// SR6 books -> pack documents per topic (scripts/lib/books.js) on the made-up samples.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { PACKS, planBookPacks, translateBook } from '../scripts/lib/books.js'
import { docId } from '../scripts/lib/ids.js'

const M = 'chummer-sr6-importer'
const load = f => JSON.parse(readFileSync(`samples/${f}`, 'utf8'))
const books = load('test-books.json'), comp = load('test-compendium.json')
const index = JSON.parse(readFileSync('icons/index.json', 'utf8'))
const OPTS = { exportedAt: books.exportedAt, appVersion: '0.9.0', descriptions: true }
const [mus, mux] = books.books
const t = translateBook(mus, OPTS)
const all = tr => Object.values(tr.packs).flat()
const byName = (tr, name) => all(tr).find(d => d.name === name)

describe('a book', () => {
  test('one pack per topic present, none for a topic without entries, in PACKS order', () => {
    const plan = planBookPacks(t)
    expect(plan.map(p => p.key)).toEqual(Object.keys(PACKS))  // the sample has every topic
    const noRules = planBookPacks(translateBook({ ...mus, entries: mus.entries.filter(e => e.kind !== 'rules') }, OPTS))
    expect(noRules.map(p => p.key)).not.toContain('rules')
    expect(plan[0]).toMatchObject({ name: 'sr6-mus-qualities', label: 'Qualities — MUS', type: 'Item' })
    expect(planBookPacks(t, 'sr6test-')[0].name).toBe('sr6test-sr6-mus-qualities')
  })
  test('_ids stable across two runs and unique', () => {
    const ids = all(t).map(d => d._id)
    expect(all(translateBook(mus, OPTS)).map(d => d._id)).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
    expect(byName(t, 'Pocket Zapper')._id).toBe(docId('MUS:weapons:mus.pocket-zapper'))
  })
  test('flags: entry id, export, source, page, canon; icon kept', () => {
    expect(byName(t, 'Pocket Zapper').flags[M]).toMatchObject({ id: 'mus.pocket-zapper', exportedAt: OPTS.exportedAt, appVersion: '0.9.0',
      source: 'MUS', page: 10, canon: true, icon: { key: expect.stringMatching(/^weapon/) } })
    expect(byName(t, 'Pocket Zapper').flags[M].compendium).toBeUndefined()
  })
  test('a book of only priorities and metatypes plans no pack, and the report says why', () => {
    const x = translateBook(mux, OPTS)
    expect(planBookPacks(x)).toEqual([])
    expect(x.textOnly).toEqual(['1 priorities: not used by Eden', '1 metatypes: not used by Eden'])
  })
  test('unused and unknown kinds: one report line each, no document', () => {
    expect(t.textOnly).toEqual(expect.arrayContaining(['1 skills: not used by Eden', '1 lifemodules: not used by Eden']))
    const x = translateBook({ ...mux, entries: [...mux.entries, { ...mux.entries[0], id: 'x', kind: 'gizmos' }] }, OPTS)
    expect(x.textOnly).toContain('1 gizmos: kind not known → not imported')
  })
  test('descriptions: the text when on and present, else "See X p.N"', () => {
    expect(byName(t, 'Pocket Zapper').system.description).toContain('<p>A made-up zapper.</p>')
    expect(byName(t, 'Pocket Zapper').system.description).toContain('<p>See MUS p.10</p>')
    const off = translateBook(mus, { ...OPTS, descriptions: false })
    expect(byName(off, 'Pocket Zapper').system.description).not.toContain('made-up zapper')
    expect(byName(off, 'Pocket Zapper').system.description).toContain('See MUS p.10')
    expect(byName(off, 'Made-up Rules').pages[0].text.content).toBe('<p>See MUS p.10</p>')
  })
  test('a rules journal per chapter, pages in file order with their levels', () => {
    const j = t.packs.rules
    expect(j).toHaveLength(1)
    expect(j[0]).toMatchObject({ _id: docId('MUS:rules-chapter:Made-up Rules'), name: 'Made-up Rules' })
    expect(j[0].pages.map(p => [p.name, p.title.level, p.sort])).toEqual([['Made-up Basics', 1, 100000], ['Made-up Detail', 2, 200000]])
    expect(j[0].pages[0]).toMatchObject({ type: 'text', text: { content: '<p>Invented rules text.</p>', format: 1 }, flags: { [M]: { id: 'mus.rule-intro' } } })
  })
  test('a weapon entry -> gear with the M2 type, qty 1; an unknown category is reported', () => {
    expect(byName(t, 'Pocket Zapper')).toMatchObject({ type: 'gear', system: { type: expect.stringMatching(/^WEAPON/), dmg: 3, stun: true, count: 1 } })
    expect(t.textOnly.some(l => l.startsWith('Glitter Cannon: weapon category'))).toBe(true)
  })
  test('qualities, picks, critter powers, lifestyles and contacts', () => {
    expect(byName(t, 'Lucky Break')).toMatchObject({ type: 'quality', system: { category: 'ADVANTAGE' } })
    expect(byName(t, 'Zap Bolt').type).toBe('spell')
    expect(byName(t, 'Quick Step')).toMatchObject({ type: 'adeptpower', system: { hasLevel: true, cost: 0.5 } })
    expect(byName(t, 'Made-up Glow')).toMatchObject({ type: 'critterpower', system: { type: 'mana' } })
    expect(byName(t, 'Made-up Hideout')).toMatchObject({ type: 'lifestyle', system: { type: 'middle', cost: 450 } })
    expect(byName(t, 'Fake Fixer')).toMatchObject({ type: 'contact', system: { rating: 4, loyalty: 2, type: 'Fixer' } })
  })
  test('a spirit entry -> Spirit actor with spiritType; a critter has its powers with the book’s fields', () => {
    const spirit = byName(t, 'Spirit of Man')
    expect(spirit).toMatchObject({ _id: docId('MUS:spirits:mus.spirit-of-man'), type: 'Spirit', system: { rating: 1, spiritType: expect.any(String) },
      prototypeToken: { actorLink: false, disposition: -1 } })
    expect(spirit.flags[M]).toMatchObject({ id: 'mus.spirit-of-man', source: 'MUS', npc: { kind: 'spirit' } })
    const hound = byName(t, 'Fake Hound')
    expect(hound.type).toBe('Critter')
    expect(hound.items.find(i => i.name === 'Made-up Glow')).toMatchObject({ type: 'critterpower', system: { type: 'mana' } })
    expect(hound.system.notes).toContain('<h3>NPC</h3>')
    expect(byName(t, 'Fault Sprite').type).toBe('sprite')
    expect(byName(t, 'Made-up Ganger')).toMatchObject({ type: 'NPC', system: { rating: 3 } })
  })
  test('a program -> Eden software: its type, rating, price; no product (Eden checks it against its own book list)', () => {
    const p = byName(t, 'Made-up Sniffer')
    expect(p).toMatchObject({ _id: docId('MUS:programs:mus.made-up-sniffer'), type: 'software',
      system: { type: 'HACKING', price: 250, availDef: '4(I)', page: 11, rating: 0 } })
    expect(p.system).not.toHaveProperty('product')
    expect(p.flags[M]).toMatchObject({ id: 'mus.made-up-sniffer', source: 'MUS', icon: { key: 'software' } })
    const odd = translateBook({ ...mus, entries: [{ ...mus.entries.find(e => e.kind === 'programs'), page: 0, attrs: { type: 'Glitter' } }] }, OPTS)
    expect(odd.packs.programs[0].system).toMatchObject({ type: 'STANDARD', page: null })
    expect(odd.textOnly).toContain('Made-up Sniffer: program type "Glitter" not known → STANDARD')
  })
  test('a martial art style and its signature technique: Eden category flags, the technique tied to the style', () => {
    const style = byName(t, 'Made-up Fist'), tech = byName(t, 'Made-up Sweep')
    expect(style).toMatchObject({ _id: docId('MUS:martialarts:mus.made-up-fist'), type: 'martialartstyle',
      system: { genesisID: 'mus.made-up-fist', category: { striking: true, grappling: true, mobility: false, ranged: false, weapon: false } } })
    expect(style.system.description).toContain('Signature technique: Made-up Sweep')
    expect(tech).toMatchObject({ type: 'martialarttech', system: { style: style.system.genesisID, choice: '' } })
    expect(tech.system.description).toContain('Category: Striking')
    const loose = translateBook({ ...mus, entries: mus.entries.filter(e => e.kind === 'martialtechniques') }, OPTS)
    expect(loose.packs.martialtechniques[0].system.style).toBe('')
  })
  test('a tradition -> a journal with one page (Eden has no tradition item)', () => {
    const [j] = t.packs.traditions
    expect(j).toMatchObject({ _id: docId('MUS:traditions:mus.made-up-path'), name: 'Made-up Path', flags: { [M]: { id: 'mus.made-up-path', page: 11 } } })
    expect(j.pages).toHaveLength(1)
    expect(j.pages[0]).toMatchObject({ name: 'Made-up Path', type: 'text', text: { content: '<p>An invented tradition.</p>', format: 1 } })
    expect(planBookPacks(t).find(p => p.key === 'traditions')).toMatchObject({ type: 'JournalEntry', label: 'Traditions — MUS' })
  })
  test('text Eden has no field for: a quality’s karma range, a mod’s slots, a weakness', () => {
    expect(byName(t, 'Lucky Break').system.description).toContain('<p>Karma: 4–8</p>')
    expect(byName(t, 'Made-up Spoiler').system.description).toContain('<p>Mod slots: 2</p>')
    expect(byName(t, 'Made-up Allergy').system.description).toContain('<p>Weakness.</p>')
    expect(byName(t, 'Made-up Glow').system.description).not.toContain('Weakness.')
  })
  test('icons: items and actors get an image when the index is passed', () => {
    const x = translateBook(mus, { ...OPTS, icons: index })
    expect(byName(x, 'Pocket Zapper').img).toMatch(/^modules\/chummer-sr6-importer\/icons\/defaults\//)
    expect(byName(x, 'Spirit of Man').img).toMatch(/npc\/spirit\.webp$/)
    expect(byName(x, 'Made-up Sniffer').img).toMatch(/defaults\/software\.webp$/)
    expect(byName(x, 'Made-up Fist').img).toMatch(/defaults\/martialartstyle\.webp$/)
  })
})

describe('a GM compendium', () => {
  const [street] = comp.books
  const c = translateBook(street, { ...OPTS, descriptions: comp.descriptions })
  test('labels end with "(House)" and docs are flagged compendium', () => {
    expect(planBookPacks(c).map(p => p.label)).toEqual(['Weapons — STREET (House)', 'NPCs — STREET (House)', 'Spirits — STREET (House)'])
    expect(byName(c, 'Zapper').flags[M]).toMatchObject({ source: 'STREET', canon: false, compendium: true })
    expect(byName(c, 'Zapper').system.description).toContain('<p>Made-up.</p>')
  })
  test('its NPCs go to their kind’s pack, with portrait and token collected', () => {
    const tough = c.packs.npcs.find(d => d.name === 'Street Tough')
    expect(tough).toMatchObject({ _id: docId('STREET:npc:street-npc-1'), type: 'NPC' })
    expect(tough.flags[M]).toMatchObject({ id: 'street-npc-1', source: 'STREET', compendium: true, npc: { kind: 'grunt' } })
    expect(c.tokens).toEqual({ [tough._id]: street.npcs[0].token })
    expect(c.portraits).toEqual({})
  })
})

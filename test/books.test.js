// SR6 books -> pack documents per topic (scripts/lib/books.js) on the made-up samples.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { PACKS, accessoryHostKind, planBookPacks, translateBook } from '../scripts/lib/books.js'

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
  test('no _id anywhere (Foundry picks it); every entry, page and actor carries a unique chummerID <source>:<kind>:<id>', () => {
    const docs = all(t), cid = d => d.flags[M].chummerID
    for (const d of docs) expect(d, d.name).not.toHaveProperty('_id')
    for (const p of t.packs.rules.flatMap(j => j.pages)) expect(p).not.toHaveProperty('_id')
    expect(new Set(docs.map(cid)).size).toBe(docs.length)
    expect(cid(byName(t, 'Pocket Zapper'))).toBe('MUS:weapons:mus.pocket-zapper')
    expect(t.packs.rules[0].pages.map(cid)).toEqual(['MUS:rules:mus.rule-intro', 'MUS:rules:mus.rule-detail'])
    expect(all(translateBook(mus, OPTS)).map(cid)).toEqual(docs.map(cid))  // the same keys every run
  })
  test('an entry’s earlier ids as chummerAliases (the kind it was filed as when another)', () => {
    expect(byName(t, 'Glitter Rope').flags[M]).toMatchObject({ chummerID: 'MUS:gear:mus.rope', chummerAliases: ['MUS:gear:mus.glitter-line'] })
    expect(byName(t, 'Made-up Sight').flags[M].chummerAliases).toEqual(['MUS:weapons:mus.old-sight'])
    expect(byName(t, 'Pocket Zapper').flags[M].chummerAliases).toEqual([])
  })
  test('flags: entry id, export, source, page, canon; icon kept', () => {
    expect(byName(t, 'Pocket Zapper').flags[M]).toMatchObject({ id: 'mus.pocket-zapper', exportedAt: OPTS.exportedAt, appVersion: '0.9.0',
      source: 'MUS', page: 10, canon: true, icon: { key: expect.stringMatching(/^weapon/) } })
    expect(byName(t, 'Pocket Zapper').flags[M].compendium).toBeUndefined()
  })
  test('kinds Eden has no document for: the Reference compendium, a journal per kind, a page per entry with its chummerID', () => {
    const x = translateBook(mux, OPTS)
    expect(planBookPacks(x)).toMatchObject([{ key: 'reference', type: 'JournalEntry', label: 'Reference — MUX' }])
    expect(x.packs.reference.map(j => [j.name, j.flags[M].chummerID, j.pages.map(p => p.flags[M].chummerID)]))
      .toEqual([['Priorities', 'MUX:reference:priorities', ['MUX:priorities:mux.prio-b']], ['Metatypes', 'MUX:reference:metatypes', ['MUX:metatypes:mux.troll']]])
    expect(x.textOnly).toEqual([])
  })
  test('a reference page: the printed stats and lines, the text, source and page', () => {
    const grades = t.packs.reference.find(j => j.name === 'Augmentation grades')
    expect(grades.pages[0]).toMatchObject({ name: 'Made-up Grade', type: 'text', flags: { [M]: { chummerID: 'MUS:grades:mus.made-up-grade', source: 'MUS', page: 10 } } })
    expect(grades.pages[0].text.content).toBe('<p>essence: 0.9</p><p>cost: 1.5</p><p>avail: 1</p><p>See MUS p.10</p>')
    const action = t.packs.reference.find(j => j.name === 'Actions').pages[0]
    expect(action.text.content).toContain('<p>An invented action.</p>')
    expect(t.packs.reference.map(j => j.name)).toEqual(['Priorities', 'Metatypes', 'Skills', 'Augmentation grades', 'Traditions', 'Life modules',
      'Actions', 'Mentor spirits'])
  })
  test('a kind this module doesn’t know: its own Reference journal, titled from its key, and a report line', () => {
    const x = translateBook({ ...mux, entries: [...mux.entries, { ...mux.entries[0], id: 'x', kind: 'gizmos' }] }, OPTS)
    expect(x.packs.reference.map(j => j.name)).toContain('Gizmos')
    expect(x.textOnly).toContain('1 gizmos: a kind this module doesn\'t know → Reference journal "Gizmos"')
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
    expect(j[0]).toMatchObject({ name: 'Made-up Rules', flags: { [M]: { chummerID: 'MUS:rules-chapter:Made-up Rules' } } })
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
    expect(spirit).toMatchObject({ flags: { [M]: { chummerID: 'MUS:spirits:mus.spirit-of-man' } }, type: 'Spirit', system: { rating: 1, spiritType: expect.any(String) },
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
    expect(p).toMatchObject({ flags: { [M]: { chummerID: 'MUS:programs:mus.made-up-sniffer' } }, type: 'software',
      system: { type: 'HACKING', price: 250, availDef: '4(I)', page: 10, rating: 0 } })
    expect(p.system).not.toHaveProperty('product')
    expect(p.flags[M]).toMatchObject({ id: 'mus.made-up-sniffer', source: 'MUS', icon: { key: 'software' } })
    const odd = translateBook({ ...mus, entries: [{ ...mus.entries.find(e => e.kind === 'programs'), page: 0, attrs: { type: 'Glitter' } }] }, OPTS)
    expect(odd.packs.programs[0].system).toMatchObject({ type: 'STANDARD', page: null })
    expect(odd.textOnly).toContain('Made-up Sniffer: program type "Glitter" not known → STANDARD')
  })
  test('a martial art style and its signature technique: Eden category flags, the technique tied to the style', () => {
    const style = byName(t, 'Made-up Fist'), tech = byName(t, 'Made-up Sweep')
    // a random genesisID, as Eden's own create button gives a new style (never our key)
    expect(style).toMatchObject({ flags: { [M]: { chummerID: 'MUS:martialarts:mus.made-up-fist' } }, type: 'martialartstyle',
      system: { category: { striking: true, grappling: true, mobility: false, ranged: false, weapon: false } } })
    expect(style.system.genesisID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(translateBook(mus, OPTS).packs.martialarts[0].system.genesisID).not.toBe(style.system.genesisID)
    expect(translateBook(mus, { ...OPTS, newGenesisId: () => 'g-1' }).packs.martialtechniques[0].system.style).toBe('g-1')
    expect(style.system.description).toContain('Signature technique: Made-up Sweep')
    expect(tech).toMatchObject({ type: 'martialarttech', system: { style: style.system.genesisID, choice: '' } })
    expect(tech.system.description).toContain('Category: Striking')
    const loose = translateBook({ ...mus, entries: mus.entries.filter(e => e.kind === 'martialtechniques') }, OPTS)
    expect(loose.packs.martialtechniques[0].system.style).toBe('')
  })
  test('a tradition -> a page of the Traditions reference journal (Eden has no tradition item)', () => {
    const j = t.packs.reference.find(x => x.name === 'Traditions')
    expect(j.flags[M].chummerID).toBe('MUS:reference:traditions')
    expect(j.pages).toHaveLength(1)
    expect(j.pages[0]).toMatchObject({ name: 'Made-up Path', type: 'text', flags: { [M]: { id: 'mus.made-up-path', page: 10, chummerID: 'MUS:traditions:mus.made-up-path' } } })
    expect(j.pages[0].text.content).toContain('<p>An invented tradition.</p>')
    expect(t.packs).not.toHaveProperty('traditions')
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
    expect(tough).toMatchObject({ type: 'NPC' })
    expect(tough.flags[M]).toMatchObject({ id: 'street-npc-1', chummerID: 'STREET:npc:street-npc-1', source: 'STREET', compendium: true, npc: { kind: 'grunt' } })
    expect(c.tokens).toEqual({ 'STREET:npc:street-npc-1': street.npcs[0].token })
    expect(c.portraits).toEqual({})
  })
})

describe('what Eden takes from the book text', () => {
  const t = translateBook(mus, OPTS), byName = (t, n) => Object.values(t.packs).flat().find(d => d.name === n)
  test('a quality’s effects as Active Effects (a conditional one disabled), its test and the rest as text', () => {
    const q = byName(t, 'Lucky Break')
    expect(q.effects).toEqual([
      { name: 'Lucky Break', transfer: true, disabled: false, changes: [{ key: 'system.attributes.agi.mod', value: '1', mode: 2 },
        { key: 'system.defenserating.physical.mod', value: '1', mode: 2 }], flags: { 'chummer-sr6-importer': { chummer: true } } },
      { name: 'Lucky Break (conditional)', transfer: true, disabled: true, changes: [{ key: 'system.skills.firearms.modifier', value: '2', mode: 2 }], flags: { 'chummer-sr6-importer': { chummer: true } } }])
    expect(q.system.description).toContain('<p>Test: Perception + Intuition (3).</p>')
  })
  test('a weapon accessory -> Eden mod in its kind’s pack, its item:ar effect on the host (not transferred)', () => {
    const sight = byName(t, 'Made-up Sight')
    expect(t.packs.gear).toContain(sight)
    expect(sight).toMatchObject({ flags: { [M]: { chummerID: 'MUS:gear:mus.made-up-sight' } }, type: 'mod', system: { type: 'accessory_weapon', price: 200, availDef: '2' } })
    expect(sight.effects).toEqual([{ name: 'Made-up Sight', transfer: false, disabled: false,
      changes: [{ key: 'system.attackRating.1', value: '1', mode: 2 }, { key: 'system.attackRating.2', value: '1', mode: 2 }], flags: { 'chummer-sr6-importer': { chummer: true } } }])
  })
  test('a cyberdeck carries Eden’s matrix fields; a vehicle its vtype; a weapon its spec through Eden’s labels', () => {
    expect(byName(t, 'Test Deck').system).toMatchObject({ subtype: 'CYBERDECK', a: 5, s: 4, progSlots: 2, matrix: { deviceRating: 2 } })
    expect(byName(t, 'Test Drone').system.vtype).toBe('AIR')
    const e = { ...mus.entries.find(x => x.id === 'mus.pocket-zapper') }
    e.attrs = { ...e.attrs, skill: 'Firearms', spec: 'Tasers' }
    const one = translateBook({ ...mus, entries: [e] }, { ...OPTS, specs: { firearms: { tasers: 'Tasers' } } })
    expect(one.packs.weapons[0].system).toMatchObject({ skill: 'firearms', skillSpec: 'tasers' })
  })
  test('accessoryHostKind: the host entry’s kind, else the category’s words', () => {
    const kindOf = id => ({ 'mus.pocket-zapper': 'weapons' })[id] ?? null
    expect(accessoryHostKind({ attrs: { accessoryOf: 'mus.pocket-zapper' } }, kindOf)).toBe('weapons')
    expect(accessoryHostKind({ attrs: { category: 'Armor modifications' } }, kindOf)).toBe('armor')
    expect(accessoryHostKind({ attrs: { category: 'Made-up firearm accessories' } }, kindOf)).toBe('weapons')
    expect(accessoryHostKind({ attrs: { category: 'Vision enhancements' } }, kindOf)).toBe('electronics')
    expect(accessoryHostKind({ attrs: { category: 'Vehicle mods' } }, kindOf)).toBe(null)
  })
})

test('a book’s vehicles and drones are also Vehicle actors in their own compendium', () => {
  const t = translateBook(mus, OPTS)
  const [drone] = t.packs.vehicleactors
  expect(drone).toMatchObject({ name: 'Test Drone', type: 'Vehicle', items: [], system: { vtype: 'aircraft', tspd: 60, bod: 2 },
    flags: { [M]: { chummerID: 'MUS:vehicleactors:mus.test-drone', source: 'MUS', page: 10 } } })
  expect(planBookPacks(t).find(p => p.key === 'vehicleactors')).toMatchObject({ type: 'Actor', label: 'Vehicles & drones (actors) — MUS' })
})

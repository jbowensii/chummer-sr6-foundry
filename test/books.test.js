// SR6 books -> pack documents per topic (scripts/lib/books.js) on the made-up samples.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { TYPES, accessoryHostKind, bookCounts, relinkUpdates, categoryOf, chunks, keepStyleIds, planTypePacks, typeKey, typeOfPack, typePackName, translateBook } from '../scripts/lib/books.js'

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
  test('one pack per type present, none for a type without entries, in TYPES order', () => {
    const plan = planTypePacks([t])
    // the sample has every type but these (Chummer's export has no sprite power kind; no drug, foci or ware other than cyberware)
    expect(plan.map(p => p.key)).toEqual(Object.keys(TYPES).filter(k => !['bioware', 'geneware', 'drugs', 'foci', 'spritepowers'].includes(k)))
    const noRules = planTypePacks([translateBook({ ...mus, entries: mus.entries.filter(e => e.kind !== 'rules') }, OPTS)])
    expect(noRules.map(p => p.key)).not.toContain('rules')
    expect(plan[0]).toMatchObject({ key: 'weapons', name: 'chummer-sr6-weapons', label: 'Weapons', type: 'Item', compendium: null })
    expect(planTypePacks([t], 'sr6test-')[0].name).toBe('sr6test-chummer-sr6-weapons')
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
    expect(planTypePacks([x])).toMatchObject([{ key: 'reference', type: 'JournalEntry', label: 'Reference', name: 'chummer-sr6-reference' }])
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
    expect(translateBook(mus, { ...OPTS, newGenesisId: () => 'g-1' }).packs.martialarts.find(d => d.type === 'martialarttech').system.style).toBe('g-1')
    expect(style.system.description).toContain('Signature technique: Made-up Sweep')
    expect(tech).toMatchObject({ type: 'martialarttech', system: { style: style.system.genesisID, choice: '' } })
    expect(tech.system.description).toContain('Category: Striking')
    const loose = translateBook({ ...mus, entries: mus.entries.filter(e => e.kind === 'martialtechniques') }, OPTS)
    expect(loose.packs.martialarts[0].system.style).toBe('')
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
    expect(planTypePacks([c]).map(p => [p.name, p.label])).toEqual([['chummer-sr6-c-street-weapons', 'Weapons — STREET (House)'],
      ['chummer-sr6-c-street-npcs', 'NPCs — STREET (House)'], ['chummer-sr6-c-street-spirits', 'Spirits — STREET (House)']])
    expect(planTypePacks([c])[0].compendium).toEqual({ id: 'STREET', name: 'Street Kit' })
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
  test('a weapon accessory -> Eden mod in the Mods & accessories pack, its item:ar effect on the host (not transferred)', () => {
    const sight = byName(t, 'Made-up Sight')
    expect(t.packs.mods).toContain(sight)
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
  expect(planTypePacks([t]).find(p => p.key === 'vehicleactors')).toMatchObject({ type: 'Actor', label: 'Vehicles & drones (actors)' })
  expect(t.packs.vehicles.map(d => d.name)).toEqual(['Test Drone'])  // and a gear item, for runners' and NPCs' links
})

describe('by type: packs, folders, report counts', () => {
  const t = translateBook(mus, OPTS), cat = d => d.flags[M].category
  const gear = (type, subtype, extra = {}) => ({ type: 'gear', system: { type, subtype }, flags: { [M]: { kind: 'gear', ...extra } } })
  test('every Eden type and gear type has its pack', () => {
    const items = { quality: 'qualities', spell: 'spells', ritual: 'rituals', adeptpower: 'adeptpowers', complexform: 'complexforms', echo: 'echoes',
      metamagic: 'metamagics', focus: 'foci', critterpower: 'critterpowers', spritepower: 'spritepowers', martialartstyle: 'martialarts',
      martialarttech: 'martialarts', lifestyle: 'lifestyles', contact: 'contacts', software: 'programs', mod: 'mods', skill: 'gear', sin: 'gear' }
    for (const [type, key] of Object.entries(items)) expect(typeKey({ type, system: {}, flags: {} }), type).toBe(key)
    const actors = { NPC: 'npcs', Critter: 'critters', Spirit: 'spirits', sprite: 'sprites', Vehicle: 'vehicleactors' }
    for (const [type, key] of Object.entries(actors)) expect(typeKey({ type, system: {}, flags: {} }), type).toBe(key)
    const gears = { WEAPON_FIREARMS: 'weapons', WEAPON_CLOSE_COMBAT: 'weapons', WEAPON_RANGED: 'weapons', WEAPON_SPECIAL: 'weapons',
      AMMUNITION: 'weapons', ARMOR: 'armor', CYBERWARE: 'cyberware', BIOWARE: 'bioware', GENETICS: 'geneware', NANOWARE: 'geneware',
      ELECTRONICS: 'electronics', SOFTWARE: 'programs', CHEMICALS: 'drugs', VEHICLES: 'vehicles', DRONES: 'vehicles', DRONE_SMALL: 'vehicles',
      DRONE_MICRO: 'vehicles', TOOLS: 'gear', SURVIVAL: 'gear', BIOLOGY: 'gear', MAGICAL: 'gear' }
    for (const [type, key] of Object.entries(gears)) expect(typeKey(gear(type, '')), type).toBe(key)
  })
  test('a vehicle mod or other accessory Eden has no mod for goes with the mods; a cyberlimb accessory stays cyberware', () => {
    expect(typeKey(gear('TOOLS', 'TOOLS'), 'Vehicle mods')).toBe('mods')
    expect(typeKey(gear('TOOLS', 'TOOLS', { category: 'Drone modifications' }))).toBe('mods')
    expect(typeKey(gear('CYBERWARE', 'CYBER_LIMBS', { kind: 'augmentations' }), 'Cyberlimb accessories')).toBe('cyberware')
    expect(typeKey(gear('TOOLS', 'TOOLS'), 'Modular tools')).toBe('gear')
  })
  test('every sample entry has a category folder, never Other or General', () => {
    for (const b of [mus, mux, ...comp.books]) for (const d of Object.values(translateBook(b, OPTS).packs).flat()) {
      expect(cat(d), d.name).toBeTruthy()
      expect(cat(d), d.name).not.toMatch(/^(other|general|misc)/i)
    }
    const folders = Object.fromEntries(Object.entries(t.packs).map(([k, docs]) => [k, docs.map(cat)]))
    expect(folders).toMatchObject({ weapons: ['Pocket Tasers', 'Glitter cannons'], armor: ['Body armor'], cyberware: ['Bodyware'],
      electronics: ['Commlinks', 'Cyberdecks'], programs: ['Hacking'], mods: ['Vehicle mods', 'Weapon accessories'], gear: ['Survival gear'],
      spells: ['Combat'], martialarts: ['Styles', 'Striking techniques'], qualities: ['Positive'], adeptpowers: ['Minor action'],
      complexforms: ['Sustained'], metamagics: ['Adepts'], critterpowers: ['Physical', 'Mana'], lifestyles: ['Middle'], contacts: ['Fixer'],
      npcs: ['Made-up Crew'], critters: ['Made-up beasts'], vehicleactors: ['Small drones (air)'], rituals: ['Anchored'] })
    // nothing in the entry to file it by: its book
    expect(folders.echoes).toEqual(['Made-Up Streets'])
    expect(folders.rules).toEqual(['Made-Up Streets'])
    expect(new Set(folders.reference)).toEqual(new Set(['Made-Up Streets']))
  })
  test('a category that says nothing or only names its kind: the entry’s own data instead', () => {
    const e = (kind, attrs) => ({ kind, attrs })
    expect(categoryOf(e('armor', { category: 'Other' }), gear('ARMOR', 'ARMOR_BODY'), 'armor', 'Core')).toBe('Body armor')
    expect(categoryOf(e('armor', { category: 'armor' }), gear('ARMOR', 'ARMOR_HELMET'), 'armor', 'Core')).toBe('Helmet armor')
    expect(categoryOf(e('augmentations', { category: 'general' }), gear('CYBERWARE', 'CYBER_EYEWARE'), 'cyberware', 'Core')).toBe('Eyeware')
    expect(categoryOf(e('weapons', { category: 'misc' }), gear('WEAPON_FIREARMS', 'PISTOLS_HEAVY'), 'weapons', 'Core')).toBe('Heavy pistols')
    expect(categoryOf(e('critters', { category: 'critter' }), { type: 'Critter', system: {} }, 'critters', 'Core')).toBe('Mundane critters')
    expect(categoryOf(e('npcs', { rating: '4' }), { type: 'NPC', system: {} }, 'npcs', 'Core')).toBe('Professional rating 4')
    expect(categoryOf(e('qualities', { category: 'qualities' }), { type: 'quality', system: { category: 'DISADVANTAGE' } }, 'qualities', 'Core')).toBe('Negative')
    expect(categoryOf(e('metamagics', {}), { type: 'metamagic', system: {} }, 'metamagics', 'Core')).toBe('All initiates')
    expect(categoryOf(e('martialtechniques', {}), { type: 'martialarttech', system: {} }, 'martialarts', 'Core')).toBe('Techniques')
    expect(categoryOf(e('gear', { category: 'heavy pistols' }), gear('WEAPON_FIREARMS', 'PISTOLS_HEAVY'), 'weapons', 'Core')).toBe('Heavy pistols')
  })
  test('a spirit: always by its Eden spirit type; one Eden doesn’t know by its category, then its book', () => {
    const spirit = (name, attrs = {}) => categoryOf({ kind: 'spirits', name, attrs }, { type: 'Spirit', system: {} }, 'spirits', 'Core')
    expect(spirit('Spirit of Man', { category: 'Hermetic spirits' })).toBe('Man')
    expect(spirit('Fire Spirit')).toBe('Fire')
    expect(spirit('Beast Spirit')).toBe('Beasts')
    expect(categoryOf({ kind: 'spirits', name: 'X', npc: { from: { name: 'Guardian Spirit' } } }, { type: 'Spirit', system: {} }, 'spirits', 'Core')).toBe('Guardian')
    expect(spirit('Glitter Thing', { category: 'Toxic spirits' })).toBe('Toxic spirits')
    expect(spirit('Glitter Thing', { category: 'spirit' })).toBe('Core')
  })
  test('a critter: its printed section when it has one, else Awakened or Mundane by its Magic', () => {
    const critter = (attrs, mag) => categoryOf({ kind: 'critters', attrs }, { type: 'Critter', system: { attributes: mag == null ? {} : { mag: { base: mag } } } }, 'critters', 'Core')
    expect(critter({ category: 'Paracritters' })).toBe('Paracritters')
    expect(critter({ category: 'critter' }, 4)).toBe('Awakened critters')
    expect(critter({ mag: '3' })).toBe('Awakened critters')
    expect(critter({ mag: '—' }, 0)).toBe('Mundane critters')
    expect(critter({})).toBe('Mundane critters')
  })
  test('a critter power the book files as a sprite’s: an Eden sprite power in its own pack', () => {
    const power = { ...mus.entries.find(e => e.kind === 'critterpowers'), attrs: { category: 'Sprite powers' } }
    const x = translateBook({ ...mus, entries: [power] }, OPTS)
    expect(x.packs.spritepowers.map(d => [d.type, cat(d)])).toEqual([['spritepower', 'Made-Up Streets']])
  })
  test('pack names: by type, a GM compendium’s with its id, never the 0.3 per-book names', () => {
    expect(typePackName('weapons')).toBe('chummer-sr6-weapons')
    expect(typePackName('npcs', 'sr6test-', 'STREET')).toBe('sr6test-chummer-sr6-c-street-npcs')
    expect(typeOfPack('world.chummer-sr6-weapons')).toEqual({ key: 'weapons', compendium: false })
    expect(typeOfPack('world.chummer-sr6-vehicleactors')).toEqual({ key: 'vehicleactors', compendium: false })
    expect(typeOfPack('world.chummer-sr6-c-street-kit-vehicles')).toEqual({ key: 'vehicles', compendium: true })
    expect(typeOfPack('world.sr6test-chummer-sr6-weapons', 'sr6test-')).toEqual({ key: 'weapons', compendium: false })
    for (const old of ['world.sr6-mus-weapons', 'world.sr6test-sr6-mus-weapons', 'world.chummer-sr6-glitter', 'world.sr6test-chummer-sr6-weapons'])
      expect(typeOfPack(old), old).toBe(null)
  })
  test('two books merge into one pack per type; a GM compendium keeps its own, after them', () => {
    const other = translateBook({ ...mus, source: { ...mus.source, id: 'MUZ', name: 'Made-Up Zones' },
      entries: mus.entries.map(e => ({ ...e, source: 'MUZ' })) }, OPTS)
    const house = translateBook(comp.books[0], { ...OPTS, descriptions: true })
    const plan = planTypePacks([t, other, house])
    const weapons = plan.find(p => p.name === 'chummer-sr6-weapons')
    expect(weapons.docs.map(d => d.flags[M].chummerID)).toEqual(['MUS:weapons:mus.pocket-zapper', 'MUS:weapons:mus.glitter-cannon',
      'MUZ:weapons:mus.pocket-zapper', 'MUZ:weapons:mus.glitter-cannon'])
    expect(plan.filter(p => p.key === 'weapons').map(p => p.name)).toEqual(['chummer-sr6-weapons', 'chummer-sr6-c-street-weapons'])
    expect(plan.findIndex(p => p.compendium)).toBe(plan.length - 3)
  })
  test('report counts per book', () => {
    const d = src => ({ flags: { [M]: { source: src } } })
    expect(bookCounts([{ doc: d('CRB') }, { doc: d('FS') }], [d('CRB'), d('CRB')], [{ doc: d('FS') }]))
      .toEqual({ CRB: { created: 2, replaced: 1, moved: 0 }, FS: { created: 0, replaced: 1, moved: 1 } })
    expect(bookCounts()).toEqual({})
  })
  test('relinkUpdates: every document pointing at a moved entry, to its new UUID; nothing else', () => {
    const moved = new Map([['Compendium.world.chummer-sr6-gear.Item.G1', 'Compendium.world.chummer-sr6-mods.Item.M1']])
    const docs = [{ id: 'a', _stats: { compendiumSource: 'Compendium.world.chummer-sr6-gear.Item.G1' } },
      { _id: 'b', _stats: { compendiumSource: 'Compendium.world.chummer-sr6-gear.Item.G2' } }, { id: 'c' }]
    expect(relinkUpdates(docs, moved)).toEqual([{ from: 'Compendium.world.chummer-sr6-gear.Item.G1',
      update: { _id: 'a', '_stats.compendiumSource': 'Compendium.world.chummer-sr6-mods.Item.M1' } }])
    expect(relinkUpdates(undefined, moved)).toEqual([])
  })
  test('chunks: pieces of n, the last shorter, none for nothing', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunks([], 100)).toEqual([])
    expect(chunks(Array.from({ length: 250 }, (_, i) => i), 100).map(c => c.length)).toEqual([100, 100, 50])
  })
  test('keepStyleIds: a style found in the world keeps its genesisID, the incoming techniques follow it', () => {
    const style = { type: 'martialartstyle', system: { genesisID: 'new' } }, tech = { type: 'martialarttech', system: { style: 'new' } }
    const fresh = { type: 'martialartstyle', system: { genesisID: 'n2' } }
    keepStyleIds([{ doc: style, hit: { system: { genesisID: 'kept' } } }, { doc: fresh, hit: {} }], [style, tech, fresh])
    expect([style.system.genesisID, tech.system.style, fresh.system.genesisID]).toEqual(['kept', 'kept', 'n2'])
  })
})

// A Chummer SR6 runner -> an Eden Player (scripts/lib/translate.js), on the made-up sample and hand-made runners.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { ATTRS, SKILLS } from '../scripts/lib/eden.js'
import { bonusChanges, escapeText, lineItem, translateRunner } from '../scripts/lib/translate.js'

const file = JSON.parse(readFileSync('samples/test-runners.json', 'utf8'))
const mara = () => structuredClone(file.runners[0])
const OPTS = { exportedAt: file.exportedAt, appVersion: file.app.version }
const SPECS = { firearms: { pistols_light: 'Pistols (Light)' } }
const run = (r = mara(), o = {}) => translateRunner(r, { ...OPTS, ...o })
const byName = (t, n) => t.items.find(i => i.name === n)
const ctx = () => { const said = []; return { said, exportedAt: 'x', appVersion: 'y', sanitize: escapeText, say: t => said.push(t) } }

describe('the Player actor', () => {
  test('raw inputs: attribute bases, edge, magic, money, flags', () => {
    const { actor } = run(), r = mara()
    expect(actor).toMatchObject({ name: 'Made-Up Mara', type: 'Player', flags: { 'chummer-sr6-importer': { id: 'run-mara-1', exportedAt: OPTS.exportedAt, appVersion: '0.9.0' } } })
    for (const k of ATTRS) expect(actor.system.attributes[k].base).toBe(r.attributes[k].natural)
    expect(actor.system.attributes.rea.base).toBe(4)  // natural, not augmented: Eden adds the ware's effect itself
    expect(actor.system.attributes.mag.initiation).toBe(1)
    expect(actor.system.attributes.res.submersion).toBe(0)
    expect(actor.system).toMatchObject({ name: 'Mara Testcase', metatype: 'Elf', mortype: 'mysticadept', nuyen: 1234, karma: 7,
      edge: { max: 3 }, tradition: { name: 'Made-up Hermetic', attribute: 'log' } })
    expect(actor.system.description).toBe('<p>An invented runner for the tests.</p><p>She exists only here.</p>')
    expect(actor.system.notes).toMatch(/^<p>Made-up notes &amp; &lt;stuff&gt;\.<\/p><h3>From Chummer<\/h3>/)
  })
  test('never a derived value', () => {
    const s = run().actor.system
    for (const k of ['initiative', 'physical', 'stun', 'overflow', 'defenserating', 'derived', 'essence', 'heat', 'reputation']) expect(s).not.toHaveProperty(k)
    for (const k of ATTRS) expect(Object.keys(s.attributes[k]).filter(x => !['base', 'initiation', 'submersion'].includes(x))).toEqual([])
  })
  test('negative money is 0; a runner with no street name uses the real name', () => {
    const r = mara(); r.nuyen = -50; r.karma = -1; r.streetName = ''
    const { actor } = run(r)
    expect(actor.system.nuyen).toBe(0); expect(actor.system.karma).toBe(0); expect(actor.name).toBe('Mara Testcase')
  })
  test('Chummer’s derived values in the notes for reference', () => {
    const n = run().actor.system.notes
    expect(n).toMatch(/Initiative 9 \+ 3D6, astral 8 \+ 2D6/)
    expect(n).toMatch(/physical 10, stun 10, overflow 3/)
    expect(n).toMatch(/Defense Rating 6/)
  })
})

describe('skills', () => {
  test('every Eden skill key; specs through the given table', () => {
    const s = run(mara(), { specs: SPECS }).actor.system.skills
    expect(Object.keys(s).sort()).toEqual([...SKILLS].sort())
    expect(s.firearms).toEqual({ points: 4, specialization: 'pistols_light', expertise: '' })
    expect(s.close_combat.points).toBe(2)
    expect(s.stealth).toEqual({ points: 0, specialization: '', expertise: '' })
  })
  test('an unmatched spec or expertise: empty, report line and notes', () => {
    const t = run()
    expect(t.actor.system.skills.firearms.specialization).toBe('')
    expect(t.textOnly).toContain('Made-Up Mara: Firearms: specialization Pistols (Light) → notes')
    expect(t.textOnly).toContain('Made-Up Mara: Sorcery: expertise Spellcasting → notes')
    expect(t.actor.system.notes).toMatch(/Firearms: specialization Pistols \(Light\) → notes/)
  })
  test('a skill Eden doesn’t have: report and notes', () => {
    const t = run()
    expect(t.textOnly).toContain('Made-Up Mara: Underwater Basket Weaving 1: not a shadowrun6-eden skill → notes')
  })
  test('a skill dropped in Chummer goes to 0', () => {
    const r = mara(); r.skills = r.skills.filter(s => s.name !== 'Firearms')
    expect(run(r).actor.system.skills.firearms.points).toBe(0)
  })
  test('knowledge and languages: skill items, a native language at 4', () => {
    const t = run()
    expect(byName(t, 'Made-up Gang Lore')).toMatchObject({ type: 'skill', system: { genesisID: 'knowledge', points: 2 } })
    expect(byName(t, 'Testlandic')).toMatchObject({ type: 'skill', system: { genesisID: 'language', points: 4 } })
    expect(byName(t, 'Fakespeak').system.points).toBe(1)
  })
})

describe('items', () => {
  test('genesisID empty on all but the skill items; flags and source on catalog items', () => {
    const t = run()
    for (const i of t.items) if (i.type !== 'skill') expect(i.system.genesisID, i.name).toBe('')
    expect(byName(t, 'Lucky Break')).toMatchObject({ flags: { 'chummer-sr6-importer': { id: 'q1', catalogId: 'mus.lucky-break', source: 'MUS', page: 10, canon: true } },
      system: { product: 'MUS', page: 10 } })
    expect(byName(t, 'Lucky Break').system.description).toMatch(/Chummer: MUS p\.10/)
  })
  test('qualities', () => {
    const t = run()
    expect(byName(t, 'Lucky Break').system).toMatchObject({ category: 'ADVANTAGE', level: false, value: 1, explain: '' })
    expect(byName(t, 'Made-up Debt').system).toMatchObject({ category: 'DISADVANTAGE', level: true, value: 2, explain: 'Owes a made-up fixer.' })
    expect(byName(t, 'Night Eyes').system.description).toMatch(/Metatype trait\./)
  })
  test('spells, rituals, adept powers, metamagics', () => {
    const t = run()
    expect(byName(t, 'Zap Bolt')).toMatchObject({ type: 'spell', system: { category: 'combat', range: 'line_of_sight', type: 'mana', duration: 'instantaneous',
      damage: 'physical', drain: 3, combatSpellType: 'spells_direct', isSustained: false } })
    expect(byName(t, 'Glimmer').system).toMatchObject({ category: 'illusion', range: 'line_of_sight_area', type: 'physical', duration: 'sustained', drain: 0, isSustained: true })
    expect(byName(t, 'Test Ward')).toMatchObject({ type: 'ritual', system: { threshold: 4,
      features: { anchored: true, material_link: false, minion: false, spell: true, spotter: false } } })
    expect(byName(t, 'Quick Step')).toMatchObject({ type: 'adeptpower', system: { hasLevel: true, level: 2, cost: 0.5, activation: 'minor_action' } })
    expect(byName(t, 'Quick Step').effects[0].changes).toEqual([{ key: 'system.initiative.physical.diceMod', value: '1', mode: 2 }])
    expect(byName(t, 'Made-up Centering').type).toBe('metamagic')
  })
  test('a complex form and an echo', () => {
    const r = mara()
    r.picks = [{ uid: 'cf', kind: 'complexforms', name: 'Made-up Pulse', canon: true, attrs: { duration: 'S' }, parts: [], values: { fade: 3 }, pick: 'complexforms', bonuses: [] },
      { uid: 'ec', kind: 'echoes', name: 'Made-up Echo', canon: true, attrs: {}, parts: [], values: {}, pick: 'echoes', bonuses: [] }]
    const t = run(r)
    expect(byName(t, 'Made-up Pulse')).toMatchObject({ type: 'complexform', system: { duration: 'sustained', fading: 3 } })
    expect(byName(t, 'Made-up Echo').type).toBe('echo')
  })
  test('a weapon: Eden type, damage, stun, printed DV, attack ratings, modes', () => {
    const w = byName(run(), 'Pocket Zapper')
    expect(w).toMatchObject({ type: 'gear', system: { type: 'WEAPON_FIREARMS', subtype: 'TASERS', skill: 'firearms', dmg: 3, stun: true, dmgDef: '3S(e)',
      attackRating: [9, 7, 0, 0, 0], modes: { SS: false, SA: true, BF: false, FA: false }, ammocap: 4,
      price: 150, priceDef: '150', avail: 2, availDef: '2(L)', count: 1, countable: false, needsRating: false, rating: 0 } })
  })
  test('a weapon with no readable DV: dmg 0, the printed DV kept, no NaN or null anywhere', () => {
    const t = run(), w = byName(t, 'Odd Blade')
    expect(w.system).toMatchObject({ type: 'WEAPON_CLOSE_COMBAT', subtype: 'BLADES', dmg: 0, stun: false, dmgDef: 'STR+?' })
    expect(w.system.description).toMatch(/Made-up engraving\./)
    for (const d of [t.actor, ...t.items]) expect(JSON.stringify(d.system), d.name).not.toMatch(/NaN|null/)
  })
  test('armor, a graded ware with its bonuses, its accessory as its own item', () => {
    const t = run()
    expect(byName(t, 'Test Jacket').system).toMatchObject({ type: 'ARMOR', subtype: 'ARMOR_BODY', defense: 3 })
    const ware = byName(t, 'Made-up Reflex Booster')
    expect(ware.system).toMatchObject({ type: 'CYBERWARE', subtype: 'CYBER_BODYWARE', essence: 0.12, rating: 1, needsRating: true, price: 1200 })
    expect(ware.system.description).toMatch(/Grade: used/)
    expect(ware.effects).toEqual([{ name: 'Made-up Reflex Booster', transfer: true, disabled: false,
      changes: [{ key: 'system.attributes.rea.mod', value: '1', mode: 2 }, { key: 'system.initiative.physical.diceMod', value: '1', mode: 2 }] }])
    const port = byName(t, 'Booster Port')
    expect(port.system).toMatchObject({ type: 'CYBERWARE', capacity: 1 })
    expect(port.system.description).toMatch(/Fitted to Made-up Reflex Booster\./)
    expect(port.effects).toBeUndefined()
  })
  test('electronics, a focus, countable gear, a custom line', () => {
    const t = run()
    expect(byName(t, 'Test Link').system).toMatchObject({ type: 'ELECTRONICS', subtype: 'COMMLINK', rating: 3 })
    expect(byName(t, 'Test Link').system.description).toMatch(/Array: 1\/1/)
    expect(byName(t, 'Made-up Power Focus')).toMatchObject({ type: 'focus', system: { rating: 2, genesisID: '' } })
    expect(byName(t, 'Glitter Rope').system).toMatchObject({ type: 'SURVIVAL', subtype: 'SURVIVAL_GEAR', count: 3, countable: true })
    const coin = byName(t, 'Lucky Coin')
    expect(coin).toMatchObject({ flags: { 'chummer-sr6-importer': { id: 'x1', catalogId: null, canon: false } }, system: { product: '', page: 0, price: 5 } })
    expect(coin.system.description).toMatch(/Chummer: custom item/)
    expect(t.textOnly).toContain('Made-Up Mara: Lucky Coin: gear category "" not known → TOOLS/TOOLS')
  })
  test('a vehicle: gear with its handling, speed and body', () => {
    expect(byName(run(), 'Test Bike').system).toMatchObject({ type: 'VEHICLES', subtype: 'BIKES', handlOn: 4, handlOff: 3, accOn: 10, accOff: 15,
      spdiOn: 20, spdiOff: 20, tspd: 120, bod: 5, arm: 4, pil: 1, sen: 1, sea: 1 })
  })
  test('an unknown weapon category still imports, with a report line', () => {
    const c = ctx(), doc = lineItem({ uid: 'u', kind: 'weapons', name: 'Glitter Gun', canon: true, attrs: { category: 'Glitter cannons' }, parts: [], values: {}, qty: 1, bonuses: [], accessories: [] }, c)
    expect(doc.system).toMatchObject({ type: 'WEAPON_SPECIAL', subtype: 'OTHER_SPECIAL' })
    expect(c.said).toEqual(['Glitter Gun: weapon category "Glitter cannons" not known → WEAPON_SPECIAL/OTHER_SPECIAL'])
  })
  test('contacts, lifestyle, SINs', () => {
    const t = run()
    expect(byName(t, 'Fake Fixer')).toMatchObject({ type: 'contact', system: { rating: 4, loyalty: 2, type: 'Fixer' } })
    expect(byName(t, 'Made-up Hideout')).toMatchObject({ type: 'lifestyle', system: { type: 'middle', paid: 2, cost: 450 } })
    expect(t.textOnly).toContain('Made-Up Mara: Lifestyle Made-up Hideout: not a shadowrun6-eden lifestyle → middle')
    expect(byName(t, 'Mara Testcase')).toMatchObject({ type: 'sin', system: { quality: 'GOOD_MATCH' } })
    expect(byName(t, 'Mara Testcase').system.description).toMatch(/Licence: Made-up Permit \(rating 3\)/)
    expect(byName(t, 'Birth Record').system.quality).toBe('REAL_SIN')
  })
})

test('bonusChanges: attributes, edge, initiative dice; unknown targets left out', () => {
  expect(bonusChanges([{ target: 'agi', value: 2 }, { target: 'edg', value: 1 }, { target: 'initDice', value: 1 }, { target: 'ess', value: 1 }]))
    .toEqual([{ key: 'system.attributes.agi.mod', value: '2', mode: 2 }, { key: 'system.edge.max', value: '1', mode: 2 },
      { key: 'system.initiative.physical.diceMod', value: '1', mode: 2 }])
  expect(bonusChanges(undefined)).toEqual([])
})

import { existsSync, readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { arText, sheetView, shown } from '../scripts/lib/sheet-view.js'
import { PARTIALS, registerNovaSheet, SHEET_CLASS, TEMPLATE } from '../scripts/foundry/sheet.js'
import { MODULE_ID } from '../scripts/lib/constants.js'

const F = { [MODULE_ID]: {} }
// Eden's prepared Player data (after prepareData): pools are Eden's, sources hold what the player typed
const actor = {
  name: 'Steelheart', img: 'p.webp', type: 'Player',
  system: {
    name: 'Jane Roe', metatype: 'Ork', gender: 'female', mortype: 'adept', essence: '5.40', karma: 7, karma_total: 30, nuyen: 1234,
    attributes: { bod: { base: 5, pool: 6 }, agi: { base: 4, pool: 4 }, rea: { base: 3, pool: 5 }, str: { base: 4, pool: 4 },
      wil: { base: 3, pool: 3 }, log: { base: 2, pool: 2 }, int: { base: 3, pool: 3 }, cha: { base: 2, pool: 2 },
      mag: { base: 4, pool: 4, initiation: 1 }, res: { base: 0, pool: 0 } },
    edge: { max: 3, value: 2 },
    physical: { max: 11, dmg: 2 }, stun: { max: 10, dmg: 0 }, overflow: { max: 6, dmg: 0 },
    initiative: { physical: { pool: 8, dicePool: 2 }, astral: { pool: 6, dicePool: 2 }, matrix: { pool: 8, dicePool: 1 } },
    defenserating: { physical: { pool: 9 }, social: { pool: 2 } },
    derived: { composure: { pool: 5 }, judge_intentions: { pool: 5 }, memory: { pool: 5 }, lift_carry: { pool: 9 } },
    defensepool: { drain: { pool: 6 }, fading: { pool: 5 } }, attackrating: { astral: { pool: 7 } },
    tradition: { name: '' },
    skills: { close_combat: { points: 4, pool: 9, poolS: 11, poolE: 0, specialization: 'blades', expertise: '' },
      con: { points: 0, pool: 1, poolS: 0, poolE: 0, specialization: '', expertise: '' },
      tasking: { points: 0, pool: 0 } },
  },
  source: { attributes: { bod: { base: 5 } }, skills: { close_combat: { points: 4 } } },
  traits: { movementRate: 10, movementSprintBase: 15, movementSprintMultiplier: 1 },
  flags: { [MODULE_ID]: { id: 'r1', animalForm: { name: 'Wolf' }, approved: true } },
  items: [
    { id: 'w1', uuid: 'U.w1', name: 'Ares Predator VI', type: 'gear', flags: { [MODULE_ID]: { ammoTypes: [{ id: 'gel', name: 'Gel rounds', dv: 2, ar: [9, 9, 7, null, null], stun: true }],
      ammoActive: 'gel', meleeAlternate: { dv: 3, stun: true, ar: [6, null, null, null, null], skill: 'close_combat', spec: 'clubs' } } },
      system: { type: 'WEAPON_FIREARMS', skill: 'firearms', skillSpec: 'pistols', pool: 8, modes: { dicePoolMod: 1 }, ammocap: 15, ammocount: 12 },
      ar: [10, 10, 8, -1, -1], dmg: 3, stun: false },
    { id: 'u1', name: 'Unarmed', type: 'gear', flags: F, system: { type: 'WEAPON_CLOSE_COMBAT', genesisID: 'unarmed', pool: 9 }, ar: [9, -1, -1, -1, -1], dmg: 2, stun: true },
    { id: 'm1', name: 'Smartgun system', type: 'gear', flags: F, system: { type: 'ACCESSORY', installedIn: { id: 'w1' } } },
    { id: 'a1', name: 'Armor jacket', type: 'gear', flags: F, system: { type: 'ARMOR', defense: 4, social: 1, usedForPool: true } },
    { id: 'c1', name: 'Cybereyes', type: 'gear', flags: F, system: { type: 'CYBERWARE', rating: 2, essence: 0.3 } },
    { id: 'd1', name: 'MCT Fly-Spy', type: 'gear', flags: { [MODULE_ID]: { dronePools: [{ mode: 'rcc', test: 'Perception', autosoft: 'Clearsight', pool: 6 }] } },
      system: { type: 'DRONE_MINI', handlOn: 4, handlOff: 3, bod: 1, arm: 0, pil: 2, sen: 3 } },
    { id: 'g1', name: 'Medkit', type: 'gear', flags: F, system: { type: 'TOOLS', count: 2, rating: 3 } },
    { id: 'q1', name: 'Toughness', type: 'quality', flags: F, system: { level: false, explain: 'Bought at creation' } },
    { id: 'l1', name: 'Sperethiel', type: 'skill', flags: F, system: { genesisID: 'language', points: 4 } },
    { id: 'k1', name: 'Gang Turf', type: 'skill', flags: F, system: { genesisID: 'knowledge' } },
    { id: 'p1', name: 'Improved Reflexes', type: 'adeptpower', flags: F, system: { hasLevel: true, level: 2 } },
    { id: 'ct1', name: 'Item', type: 'contact', flags: F, system: { name: 'Fixer Joe', type: 'Fixer', rating: 4, loyalty: 2 } },
    { id: 's1', name: 'Fake SIN', type: 'sin', flags: F, system: { quality: 'RATING_4' } },
  ],
  effects: [{ id: 'e1', name: 'Wired', disabled: false, source: 'Wired Reflexes' }, { id: 'e2', name: 'Night', disabled: true, source: '' }],
  critters: [{ id: 'x1', uuid: 'Actor.x1', name: 'Rex' }],
}
const deps = { localize: k => ({ 'skill.close_combat': 'Close Combat', 'skill.con': 'Con', 'shadowrun6.special.close_combat.blades': 'Blades' }[k] ?? k),
  skillAttr: id => ({ close_combat: 'agi', con: 'cha' }[id]), specLabel: (s, k) => `shadowrun6.special.${s}.${k}` }

test('the view model follows Eden\'s prepared numbers in the print sheet\'s sections', () => {
  const v = sheetView(actor, deps)
  expect(v.header).toMatchObject({ name: 'Steelheart', role: 'Ork, female, Adept', realName: 'Jane Roe', showReal: true })
  expect(v.attrs.map(a => [a.label, a.value])).toEqual([['Body', 6], ['Agility', 4], ['Reaction', 5], ['Strength', 4], ['Willpower', 3],
    ['Logic', 2], ['Intuition', 3], ['Charisma', 2]])
  expect(v.attrs[0]).toMatchObject({ base: 5, field: 'system.attributes.bod.base' })
  expect(v.edge.value).toBe(3)
  expect(v.magRes).toMatchObject({ key: 'mag', label: 'Magic', value: 4 })
  expect(v.essence).toBe('5.40')
  // tasking only for a technomancer; untrained dimmed; spec dice Eden's poolS
  expect(v.skills.map(s => s.id)).toEqual(['close_combat', 'con'])
  expect(v.skills[0]).toMatchObject({ label: 'Close Combat', rank: 4, attr: 'AGI', dice: 9, untrained: false, spec: { key: 'blades', label: 'Blades', dice: 11 }, expertise: null })
  expect(v.skills[1].untrained).toBe(true)
  expect(v.languages).toEqual([{ id: 'l1', name: 'Sperethiel', detail: 'native' }])
  expect(v.knowledge).toEqual([{ id: 'k1', name: 'Gang Turf' }])
  expect(v.qualities[0]).toMatchObject({ name: 'Toughness', level: null, detail: 'Bought at creation' })
  expect(v.monitors.physical.boxes.filter(b => b.filled)).toHaveLength(2)
  expect(v.monitors.physical.boxes).toHaveLength(11)
  expect(v.monitors.edge).toMatchObject({ max: 3, value: 2 })
  const d = Object.fromEntries(v.derived.map(x => [x.label, x.value]))
  expect(d).toMatchObject({ Initiative: '8 + 2D6', 'Astral initiative': '6 + 2D6', 'Defense Rating': 9, Composure: 5, Drain: 6,
    Movement: '10 m / Sprint 15 m +1 a hit' })
  expect(d.Fading).toBeUndefined()  // not a technomancer
  expect(d['Spell Attack Rating']).toBeUndefined()  // an adept casts no spells
  expect(v).toMatchObject({ karma: 7, karmaTotal: 30, nuyen: 1234 })
})

test('weapons, armor, augmentations, gear, vehicles and the import\'s flags', () => {
  const v = sheetView(actor, deps)
  expect(v.weapons.map(w => w.name)).toEqual(['Unarmed', 'Ares Predator VI'])  // Unarmed first, as the app's sheet
  expect(v.weapons[0]).toMatchObject({ dv: '2S', ar: '9/–/–/–/–' })
  expect(v.weapons[1]).toMatchObject({ dv: '3P', ar: '10/10/8/–/–', pool: 9, ammo: '12/15', accessories: 'Smartgun system',
    ammoTypes: [{ name: 'Gel rounds', dv: '2S', ar: '9/9/7/–/–', active: true }], melee: { dv: '3S', ar: '6/–/–/–/–', skill: 'clubs' } })
  expect(v.armor).toEqual([{ id: 'a1', name: 'Armor jacket', defense: 4, social: 1, worn: true, accessories: '' }])
  expect(v.augmentations[0]).toMatchObject({ name: 'Cybereyes', rating: 2, essence: '0.30' })
  expect(v.vehicles[0]).toMatchObject({ name: 'MCT Fly-Spy', handling: '4/3', pilot: 2, sensor: 3,
    dronePools: [{ mode: 'RCC', test: 'Perception', autosoft: 'Clearsight', pool: 6 }] })
  // the installed accessory is under its weapon, not loose gear
  expect(v.gear).toEqual([{ id: 'g1', name: 'Medkit', qty: 2, rating: 3 }])
  expect(v.magic).toMatchObject({ title: 'Magic', summary: 'Drain 6 · Initiation grade 1', picks: [{ name: 'Improved Reflexes', kind: 'Adept power', level: 2, roll: null }] })
  expect(v.contacts).toEqual([{ id: 'ct1', name: 'Fixer Joe', type: 'Fixer', connection: 4, loyalty: 2 }])
  expect(v.sins).toEqual([{ id: 's1', name: 'Fake SIN', quality: 'RATING_4' }])
  expect(v.effects).toEqual([{ id: 'e1', name: 'Wired', from: 'Wired Reflexes', disabled: false }, { id: 'e2', name: 'Night', from: '', disabled: true }])
  expect(v.critters).toEqual([{ id: 'x1', uuid: 'Actor.x1', name: 'Rex' }])
  expect(v.extras).toEqual([{ label: 'Approved', value: 'Yes' }, { label: 'Animal form', value: 'Wolf' }])
})

test('a mundane actor with almost nothing still lays out', () => {
  const v = sheetView({ name: 'X', system: { mortype: 'mundane' }, items: [] })
  expect(v.magRes).toBeNull()
  expect(v.magic).toBeNull()
  expect(v.skills).toEqual([])
  expect(v.monitors.physical.boxes).toEqual([])
  expect(arText(null)).toBe('')
  expect(shown({ rcc: 'Proteus', noise: 0 })).toBe('rcc Proteus, noise 0')
})

test('registration: no Eden Player sheet → no throw, nothing registered, logged once', () => {
  const Actors = { registerSheet: vi.fn() }, log = { warn: vi.fn() }
  expect(registerNovaSheet({ apps: {}, Actors, log })).toBeNull()
  expect(registerNovaSheet({ apps: undefined, Actors, log })).toBeNull()
  expect(Actors.registerSheet).not.toHaveBeenCalled()
  expect(log.warn).toHaveBeenCalledTimes(1)
})

test('registration: on Eden\'s sheet, Player only, never the default; a throwing registerSheet is caught', () => {
  class Shadowrun6ActorSheetPC {}
  const Actors = { registerSheet: vi.fn() }, loadTemplates = vi.fn()
  const Sheet = registerNovaSheet({ apps: { Shadowrun6ActorSheetPC }, Actors, loadTemplates, log: { warn() {} } })
  expect(Sheet.name).toBe(SHEET_CLASS)
  expect(Object.getPrototypeOf(Sheet)).toBe(Shadowrun6ActorSheetPC)
  expect(Actors.registerSheet).toHaveBeenCalledWith(MODULE_ID, Sheet, expect.objectContaining({ types: ['Player'], makeDefault: false }))
  expect(loadTemplates).toHaveBeenCalledWith(PARTIALS)
  const bad = { registerSheet: () => { throw new Error('boom') } }
  expect(registerNovaSheet({ apps: { Shadowrun6ActorSheetPC }, Actors: bad, log: { warn() {} } })).toBeNull()
})

test('the templates exist, the main one uses every partial, and none triple-stashes', () => {
  const path = p => new URL(`../${p.replace(`modules/${MODULE_ID}/`, '')}`, import.meta.url)
  const main = readFileSync(path(TEMPLATE), 'utf8')
  for (const p of PARTIALS) {
    expect(existsSync(path(p))).toBe(true)
    expect(main).toContain(p)
    expect(readFileSync(path(p), 'utf8')).not.toMatch(/\{\{\{/)
  }
  expect(main).not.toMatch(/\{\{\{/)
  expect(main).toMatch(/nav class="sheet-tabs[^"]*" data-group="primary"/)
})

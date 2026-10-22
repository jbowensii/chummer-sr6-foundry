// npc-spells-ammo (Nova Prime Chummer PRs #149 and #150): an NPC's spells are a runner's spell picks plus the printed note;
// a caster's tradition and drain attribute are set as a runner's are; a ranged weapon is loaded with ONE load from its ammo
// stack (the export's qty = every round owned), the rest stays as the spare, its container is gear. Invented fixtures.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import { MODULE_ID as M } from '../scripts/lib/constants.js'
import { translateRunner } from '../scripts/lib/translate.js'

const file = JSON.parse(readFileSync('samples/test-npc-combat-items.json', 'utf8'))
const OPTS = { exportedAt: file.exportedAt, appVersion: '0.20.0' }  // (the app's two-load ammunition)
const guard = file.runners[0]
const pistol = guard.npc.items.find(i => i.id === 'zz.thunderbus')
const spare = { score: 1, how: 'ammo' }
const ammoOf = (w, qty, accessories = []) => ({ id: 'zz.ammo-heavy', kind: 'gear', name: 'Heavy Pistol/SMG', source: 'ZZ', page: 2, canon: false,
  attrs: { category: 'Ammo by weapon type', class: 'AMMUNITION/AMMUNITION' }, parts: [], values: { cost: 10, avail: 1 }, uid: `${w.uid}:ammo`, qty, worn: false,
  bonuses: [], line: { part: 'weapons', printed: w.line.printed, values: {}, match: spare }, accessories })
const clipOf = w => ({ id: 'zz.clip', kind: 'gear', name: 'Made-up Spare Clip', source: 'ZZ', page: 2, canon: false, attrs: { category: 'Ammo by weapon type', class: 'TOOLS' },
  parts: [], values: { cost: 5, avail: 1 }, uid: `${w.uid}:ammo#2`, qty: 1, worn: false, bonuses: [], line: { part: 'weapons', printed: w.line.printed, values: {}, match: spare }, accessories: [] })
const gel = { id: 'zz.gel', kind: 'ammotypes', name: 'Made-up Gel', source: 'ZZ', page: 3, canon: false, attrs: { category: 'Ammo type' }, parts: [], values: {}, uid: 'gel',
  qty: 1, worn: false, bonuses: [], line: { part: 'weapons', printed: 'gel', values: {}, match: { score: 1, how: 'exact' } }, accessories: [] }
// every fixture is checked against the app's schema (schema/sr6-export.schema.json, a copy of the app's)
const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/sr6-export.schema.json', 'utf8')))
const run = (items, magic, opts = OPTS, valid = true) => {
  const runner = { ...guard, npc: { ...guard.npc, items, corrections: [], ...(magic ? { magic } : {}) } }
  if (valid) expect(check({ ...file, runners: [runner] }), JSON.stringify(check.errors?.slice(0, 3))).toBe(true)
  return translateRunner(runner, opts)
}
const named = (t, n) => t.items.filter(i => i.name === n)

describe('npc ammo: one load in the weapon, the rest is the spare', () => {
  test('36 rounds of a 12-round pistol: 12 loaded, a 24-round stack, the clip is gear', () => {
    const t = run([pistol, ammoOf(pistol, 36), clipOf(pistol)])
    const gun = named(t, 'Made-up Thunderbus Pistol')[0], [stack] = named(t, 'Heavy Pistol/SMG'), [clip] = named(t, 'Made-up Spare Clip')
    expect(gun.system).toMatchObject({ ammocap: 12, ammocount: 12, ammoLoaded: 'regular', type: expect.stringMatching(/^WEAPON_/) })
    expect(stack.system).toMatchObject({ type: 'AMMUNITION', count: 24 })
    expect(stack.system.description).toContain('ammunition for Made-up Thunderbus Pistol')
    expect(stack.system.description).not.toContain('one full load')
    expect(clip.type).toBe('gear')
    expect(clip.system.type).not.toMatch(/^WEAPON_/)
    expect(clip.system.description).toContain('spare magazine, clip or loader for Made-up Thunderbus Pistol')
  })
  test('it still rolls as a weapon: its DV and AR as printed', () => {
    const gun = named(run([pistol, ammoOf(pistol, 24), clipOf(pistol)]), 'Made-up Thunderbus Pistol')[0]
    expect(gun.system).toMatchObject({ dmg: 4, dmgDef: '4P', attackRating: [10, 9, 7, 0, 0] })
  })
  test('an ammunition type applies to the stack and the weapon’s load says so', () => {
    const t = run([pistol, ammoOf(pistol, 24, [gel])])
    expect(named(t, 'Made-up Gel')[0].flags[M]).toMatchObject({ catalogId: 'zz.gel', kind: 'ammotypes' })
    expect(named(t, 'Made-up Gel')[0].system.description).toContain('Fitted to Heavy Pistol/SMG')
    expect(named(t, 'Made-up Thunderbus Pistol')[0].system.description).toContain('Loaded with Made-up Gel ammunition.')
  })
  test('a bow with 20 arrows (a 1-arrow “magazine”) loads one and keeps 19', () => {
    const bow = { ...pistol, uid: 'bow', name: 'Made-up Bow', id: 'zz.bow', attrs: { ...pistol.attrs, ammo: '1', category: 'Bows' }, values: { ...pistol.values, ammo: 1 }, line: { ...pistol.line, printed: 'Made-up Bow' } }
    const t = run([bow, ammoOf(bow, 20)])
    expect(named(t, 'Made-up Bow')[0].system).toMatchObject({ ammocap: 1, ammocount: 1 })
    expect(named(t, 'Heavy Pistol/SMG')[0].system.count).toBe(19)
  })
  test('a tank-fed weapon (20 tanks-ammo, a stack of 2 tanks): one tank fills it, one tank is spare, the container is kept', () => {
    const inferno = { ...pistol, uid: 'inf', name: 'Made-up Inferno', id: 'zz.inferno', attrs: { ...pistol.attrs, ammo: '20(tanks)', category: 'Flamethrowers' }, values: { ...pistol.values, ammo: 20 },
      line: { ...pistol.line, printed: 'Made-up Inferno [Flamethrower, DV 4P, 20(tanks)]' } }
    const t = run([inferno, { ...ammoOf(inferno, 2), name: 'Fuel tank (small)', uid: 'f1' }, { ...clipOf(inferno), uid: 'f2' }])
    expect(named(t, 'Made-up Inferno')[0].system).toMatchObject({ ammocap: 20, ammocount: 20 })
    expect(named(t, 'Fuel tank (small)')[0].system.count).toBe(1)
    expect(named(t, 'Made-up Spare Clip')).toHaveLength(1)
  })
  test('a stack that is exactly one load leaves no spare, nor its fitted ammunition type', () => {
    const t = run([pistol, ammoOf(pistol, 12, [gel])])
    expect(named(t, 'Heavy Pistol/SMG')).toEqual([])
    expect(named(t, 'Made-up Gel')).toEqual([])
  })
  test('two identical weapon lines (uids from one shared counter) each get their own load and spare, paired by order', () => {
    const two = { ...pistol, uid: `${pistol.uid}#2` }
    const t = run([pistol, { ...ammoOf(pistol, 36), uid: 'a1' }, { ...clipOf(pistol), uid: 'a2' }, two, { ...ammoOf(two, 30), uid: 'a3' }, { ...clipOf(two), uid: 'a4' }])
    expect(named(t, 'Made-up Thunderbus Pistol').map(g => g.system.ammocount)).toEqual([12, 12])
    expect(named(t, 'Heavy Pistol/SMG').map(a => a.system.count)).toEqual([24, 18])
    expect(named(t, 'Made-up Spare Clip')).toHaveLength(2)
  })
  test('an older export (app before 0.20.0): one spare load as qty is kept whole beside the full weapon', () => {
    const t = run([pistol, ammoOf(pistol, 12)], null, { ...OPTS, appVersion: '0.19.0' })
    expect(named(t, 'Made-up Thunderbus Pistol')[0].system).toMatchObject({ ammocount: 12, ammoLoaded: 'regular' })
    expect(named(t, 'Heavy Pistol/SMG')[0].system.count).toBe(12)
    expect(named(t, 'Heavy Pistol/SMG')[0].system.description).toContain('a spare load of ammunition for Made-up Thunderbus Pistol')
  })
  test('a weapon with printed ammunition of its own gets no ammo item and comes loaded', () => {
    const t = run([pistol])
    expect(named(t, 'Made-up Thunderbus Pistol')[0].system).toMatchObject({ ammocount: 12, ammoLoaded: 'regular' })
    expect(t.items.filter(i => i.system?.type === 'AMMUNITION')).toEqual([])
  })
})

describe('npc spells: the runner’s spell item, plus the printed note', () => {
  const pick = { id: 'zz.glow-ward', kind: 'spells', name: 'Made-up Glow Ward', source: 'ZZ', page: 1, canon: false, attrs: { category: 'manipulation', range: 'LOS', type: 'P', duration: 'S' },
    parts: [], values: { drain: 3 }, uid: 'line:spells:Made-up Glow Ward (F6)', pick: 'spells', note: 'Made-up Glow Ward (F6)', description: 'Made-up ward text.', qty: 1, worn: false, bonuses: [],
    accessories: [], line: { part: 'spells', printed: 'Made-up Glow Ward (F6)', values: {}, match: { score: 1, how: 'exact' } } }
  const { note, qty, worn, accessories, line, ...asRunnerPick } = pick
  const asPc = translateRunner({ ...guard, npc: undefined, picks: [asRunnerPick], purchases: [] }, OPTS).items.find(i => i.type === 'spell')
  test('translates as the same spell a PC pick does (name, fields), the note on its description', () => {
    const spell = named(run([pick]), 'Made-up Glow Ward')[0]
    expect(spell.type).toBe('spell')
    expect(spell.system).toMatchObject({ ...asPc.system, description: expect.stringContaining('Made-up Glow Ward (F6)') })
    expect(spell.system.description).toContain('Made-up ward text.')
    expect(spell.flags[M]).toMatchObject({ catalogId: 'zz.glow-ward', npcLine: 'Made-up Glow Ward (F6)' })
  })
  test('a ritual is a ritual item; a spell the catalog lacks is a plain spell named as printed', () => {
    const ritual = { ...pick, id: 'zz.rite', kind: 'rituals', pick: 'rituals', name: 'Made-up Rite', uid: 'r', note: 'Made-up Rite (F4)', values: { threshold: 2 }, attrs: { keywords: 'spell' } }
    const plain = { uid: 'p', kind: 'spells', name: 'Made-up Hex', canon: false, attrs: {}, parts: [], values: {}, pick: 'spells', note: 'Made-up Hex (F3)', qty: 1, worn: false, bonuses: [],
      accessories: [], line: { part: 'spells', printed: 'Made-up Hex (F3)', values: {} } }
    const t = run([ritual, plain])
    expect(named(t, 'Made-up Rite')[0].type).toBe('ritual')
    expect(named(t, 'Made-up Hex')[0].system.description).toContain('Made-up Hex (F3)')
  })
})

describe('npc caster magic: the tradition and drain attribute', () => {
  test('set as a runner’s are, with a note', () => {
    const t = run([], { tradition: 'Made-up Hermetic', drainAttr: 'log', drain: 9, traditions: [{ id: 'zz.h', name: 'Made-up Hermetic', drainAttr: 'log' }] })
    expect(t.actor.system.tradition).toEqual({ name: 'Made-up Hermetic', attribute: 'log' })
    expect(t.actor.system.notes).toContain('<h3>Tradition</h3><p>Tradition: Made-up Hermetic, drain attribute LOG, drain pool 9')
  })
  test('a tie lists every tradition, the first one set', () => {
    const t = run([], { tradition: 'Made-up Hermetic', drainAttr: 'log', drain: 9,
      traditions: [{ id: 'a', name: 'Made-up Hermetic', drainAttr: 'log' }, { id: 'b', name: 'Made-up Shamanic', drainAttr: 'cha' }] })
    expect(t.actor.system.tradition.name).toBe('Made-up Hermetic')
    expect(t.actor.system.notes).toContain('Tradition: Made-up Hermetic or Made-up Shamanic')
  })
  test('no magic: nothing invented', () => {
    const t = run([])
    expect(t.actor.system.tradition).toBeUndefined()
    expect(t.actor.system.notes).not.toContain('<h3>Tradition</h3>')
  })
  test('a drain attribute Eden lacks sets no tradition, and says so', () => {
    const t = run([], { tradition: 'Made-up Odd', drainAttr: 'zzz', drain: 5, traditions: [] }, OPTS, false)  // (a value the schema forbids: a guard on bad input)
    expect(t.actor.system.tradition).toBeUndefined()
    expect(t.actor.system.notes).toContain('drain attribute zzz not a shadowrun6-eden attribute')
  })
})

describe('npc powers: line.detail', () => {
  const power = (printed, detail) => ({ uid: `power:${printed}`, kind: 'critterpowers', name: 'Made-up Immunity', canon: false, attrs: {}, parts: [], values: {}, qty: 1, worn: false,
    bonuses: [], accessories: [], line: { part: 'powers', printed, values: {}, detail } })
  test('shown in the power’s description when the printed text lacks it', () => {
    expect(run([power('Made-up Immunity', 'Cold, Fire')]).items.find(i => i.type === 'critterpower').system.description).toContain('Detail: Cold, Fire')
  })
  test('not repeated when the printed text has it', () => {
    expect(run([power('Made-up Immunity (Cold, Fire)', 'Cold, Fire')]).items.find(i => i.type === 'critterpower').system.description).not.toContain('Detail:')
  })
})

// The export's 0.13 fields (app: ammoTypes, meleeAlternate, dronePools, derived.rigging, design/approved, animalForm) through
// lib/translate.js and lib/ammo.js; the alternate-attack item data; the schema; Eden's gear keys.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import { MODULE_ID as M } from '../scripts/lib/constants.js'
import { ammoFlags, animalAr, meleeItemData, parseDv, reconcileAmmo, switchAmmo } from '../scripts/lib/ammo.js'
import { translateRunner } from '../scripts/lib/translate.js'

const file = JSON.parse(readFileSync('samples/test-runners.json', 'utf8'))
const OPTS = { exportedAt: file.exportedAt, appVersion: file.app.version }
const EDEN_GEAR = new Set(JSON.parse(readFileSync('test/fixtures/eden-gear-keys.json', 'utf8')).gear)

// Mara with every new field: her taser (inherently stun) with two ammunition types, one with no Eden equivalent and no
// dv of its own, and a club alternate; designs on the taser and the booster (approved); drone pools; rigging; an animal form
function richMara() {
  const r = structuredClone(file.runners[0]), p = uid => r.purchases.find(x => x.uid === uid)
  Object.assign(p('w1').values, {
    ammoTypes: [{ id: 'ammo.apds', name: 'APDS', dv: 2, ar: [11, 9, null, null, null] },
      { id: 'zz.capsule', name: 'Made-up Capsule', ar: [10, 7, null, null, null], stun: true }],
    meleeAlternate: { dv: 3, stun: true, ar: [4, null, null, null, null], skill: 'Close Combat', spec: 'Clubs' } })
  Object.assign(p('w1'), { design: 'design-1' })
  Object.assign(p('c1'), { design: 'design-2', approved: true })
  p('v2').values.dronePools = [{ mode: 'autonomous', test: 'Targeting', autosoft: 'Targeting (Made-up Gun)', pool: 6 },
    { mode: 'rcc', test: 'Evasion', autosoft: 'Evasion', pool: 5 }]
  r.derived.rigging = { driving: [{ test: 'Piloting (ground)', pool: 7 }], jumpedIn: [{ test: 'Piloting (ground)', pool: 9 }] }
  r.animalForm = { form: 'Made-up Wolf Shifter', attributes: { bod: 5, agi: 4, rea: 5, str: 6, wil: 3, log: 2, int: 4, cha: 2 },
    weapons: [{ name: 'Made-up Bite', dv: '4P', skill: 'Close Combat' }, { name: 'Made-up Claw', dv: '3P', ar: [12, null, null, null, null] }] }
  return r
}
const run = r => translateRunner(r, OPTS)
const item = (t, n) => t.items.find(i => i.name === n)

describe('translate: the new fields in our flags, Eden’s stats the plain values', () => {
  const t = run(richMara()), zap = item(t, 'Pocket Zapper')
  test('ammoTypes: the plain values (the line’s values, not printed), the types as given, the baseline = plain', () => {
    expect(zap.system).toMatchObject({ dmg: 3, stun: true, attackRating: [9, 7, 0, 0, 0] })
    expect(zap.flags[M].ammoPlain).toEqual({ dv: 3, ar: [9, 7, null, null, null], stun: true })
    expect(zap.flags[M].ammoTypes.map(x => [x.id, x.dv, x.stun])).toEqual([['ammo.apds', 2, false], ['zz.capsule', null, true]])
    expect(zap.flags[M].ammoBase).toEqual({ dmg: 3, stun: true, attackRating: [9, 7, 0, 0, 0] })
    expect(zap.flags[M]).not.toHaveProperty('ammoActive')
  })
  test('meleeAlternate, design: in the flags; approved only when true', () => {
    expect(zap.flags[M].meleeAlternate).toEqual({ dv: 3, stun: true, ar: [4, null, null, null, null], skill: 'Close Combat', spec: 'Clubs' })
    expect(zap.flags[M].design).toBe('design-1')
    expect(zap.flags[M]).not.toHaveProperty('approved')
    expect(item(t, 'Made-up Reflex Booster').flags[M]).toMatchObject({ design: 'design-2', approved: true })
    expect(item(t, 'Odd Blade').flags[M]).not.toHaveProperty('ammoTypes')
  })
  test('drone pools on the drone’s Vehicle actor; Eden’s opMode left as it was', () => {
    const drone = t.vehicles.find(v => v.actor.flags[M].id === 'v2').actor
    expect(drone.flags[M].dronePools.map(p => p.mode)).toEqual(['autonomous', 'rcc'])
    expect(drone.system.vehicle).toEqual({ opMode: 'autonomous' })
    expect(t.vehicles.find(v => v.actor.flags[M].id === 'v1').actor.flags[M]).not.toHaveProperty('dronePools')
  })
  test('rigging and the animal form on the actor', () => {
    expect(t.actor.flags[M].rigging.jumpedIn).toEqual([{ test: 'Piloting (ground)', pool: 9 }])
    expect(t.actor.flags[M].animalForm.form).toBe('Made-up Wolf Shifter')
  })
  test('a runner without them gets none of the keys', () => {
    const plain = run(structuredClone(file.runners[0]))
    for (const k of ['rigging', 'animalForm']) expect(plain.actor.flags[M]).not.toHaveProperty(k)
    expect(item(plain, 'Pocket Zapper').flags[M]).not.toHaveProperty('ammoTypes')
  })
  test('the fixture is a valid export', () => {
    const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/sr6-export.schema.json', 'utf8')))
    const f = { ...structuredClone(file), runners: [richMara()] }
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
  })
})

describe('switchAmmo: band by band on the baseline', () => {
  const f = ammoFlags({ dv: 3, stun: true, ar: [9, 7, null, null, null], ammoTypes: richMara().purchases[0].values.ammoTypes })
  const sys0 = { dmg: 3, stun: true, attackRating: [9, 7, 0, 0, 0] }
  const apply = (sys, flags, id) => { const u = switchAmmo(sys, flags, id); return [u.system, { ...flags, ...u.flags }] }
  test('APDS: dv −1, AR +2/+2, a "-" band stays "-"; the inherent stun stays; ammoLoaded regular', () => {
    const [s, fl] = apply(sys0, f, 'ammo.apds')
    expect(s).toEqual({ dmg: 2, stun: true, attackRating: [11, 9, 0, 0, 0], ammoLoaded: 'regular' })
    expect(fl.ammoActive).toBe('ammo.apds')
  })
  test('a type with no dv keeps the plain dv; repeated switches return to the plain values, never NaN', () => {
    let [s, fl] = apply(sys0, f, 'zz.capsule')
    expect(s).toMatchObject({ dmg: 3, attackRating: [10, 7, 0, 0, 0] })
    ;[s, fl] = apply(s, fl, 'ammo.apds')
    ;[s, fl] = apply(s, fl, 'zz.capsule')
    ;[s, fl] = apply(s, fl, '')
    expect(s).toEqual({ ...sys0, ammoLoaded: 'regular' })
    expect(fl.ammoActive).toBeNull()
    expect(JSON.stringify(s)).not.toMatch(/NaN|null/)
  })
  test('stun the ammunition adds goes again with it; a weapon’s own stun stays', () => {
    const nf = ammoFlags({ dv: 4, ar: [8, 8, 6, null, null], ammoTypes: [{ id: 'gel', name: 'Gel', dv: 4, ar: [8, 8, 6, null, null], stun: true }] })
    let [s, fl] = apply({ dmg: 4, stun: false, attackRating: [8, 8, 6, 0, 0] }, nf, 'gel')
    expect(s.stun).toBe(true)
    ;[s] = apply(s, fl, '')
    expect(s.stun).toBe(false)
  })
  test('a hand edit on the sheet survives a switch (the baseline is recomputed from what the weapon has now)', () => {
    let [s, fl] = apply(sys0, f, 'ammo.apds')
    s = { ...s, attackRating: [12, 9, 0, 0, 0] }  // +1 close by hand
    ;[s] = apply(s, fl, '')
    expect(s.attackRating).toEqual([10, 7, 0, 0, 0])
  })
  test('an unknown type or a weapon not ours: no update', () => {
    expect(switchAmmo(sys0, f, 'nope')).toBeNull()
    expect(switchAmmo(sys0, {}, 'ammo.apds')).toBeNull()
  })
  test('reconcileAmmo: the choice kept while its type exists, on the new baseline; else dropped', () => {
    const fresh = { system: { ...sys0, attackRating: [10, 8, 0, 0, 0] }, flags: { [M]: { ...ammoFlags({ dv: 3, stun: true, ar: [10, 8, null, null, null], ammoTypes: f.ammoTypes }) } } }
    const kept = reconcileAmmo({ ammoActive: 'ammo.apds' }, fresh)
    expect(kept.system.attackRating).toEqual([11, 9, 0, 0, 0])  // (the old types against the new plain: +1)
    expect(kept.flags.ammoActive).toBe('ammo.apds')
    expect(kept.flags.ammoBase.attackRating).toEqual([10, 8, 0, 0, 0])
    const gone = reconcileAmmo({ ammoActive: 'zz.gone' }, fresh)
    expect(gone.system).toEqual(fresh.system)
    expect(gone.flags).not.toHaveProperty('ammoActive')
  })
})

describe('alternate attacks: clean, unsaved melee data', () => {
  test('club: AR stored less the live Strength (Eden adds it back to show 4), no ammo, modes or id; only Eden gear keys', () => {
    const d = meleeItemData({ name: 'Zapper (club)', dmg: 3, stun: true, dmgDef: '3S', ar: [4, null, null, null, null], spec: 'clubs' }, 5)
    expect(d.system).toMatchObject({ type: 'WEAPON_CLOSE_COMBAT', skill: 'close_combat', skillSpec: 'clubs', dmg: 3, stun: true, attackRating: [-1, 0, 0, 0, 0], ammocap: 0 })
    expect(d.system.attackRating[0] + 5).toBe(4)
    expect(d).not.toHaveProperty('_id')
    expect(d).not.toHaveProperty('effects')
    for (const k of Object.keys(d.system)) expect(EDEN_GEAR.has(k), k).toBe(true)
  })
  test('the ammo switch writes only Eden gear keys', () => {
    const u = switchAmmo({ dmg: 3, attackRating: [9, 0, 0, 0, 0] }, ammoFlags({ dv: 3, ar: [9], ammoTypes: [{ id: 'x', name: 'X', dv: 4, ar: [9] }] }), 'x')
    for (const k of Object.keys(u.system)) expect(EDEN_GEAR.has(k), k).toBe(true)
  })
  test('an unarmed natural weapon whose stored close band would be 0 drops the spec (Eden would add Reaction)', () => {
    expect(meleeItemData({ name: 'Bite', dmg: 4, ar: [6], spec: 'unarmed', subtype: 'UNARMED' }, 6).system.skillSpec).toBe('')
    expect(meleeItemData({ name: 'Bite', dmg: 4, ar: [11], spec: 'unarmed', subtype: 'UNARMED' }, 6).system.skillSpec).toBe('unarmed')
  })
  test('animal form: the exported ar when present, else REA + STR of the form; DV parsed', () => {
    const a = { rea: 5, str: 6 }
    expect(animalAr({ dv: '4P' }, a)).toEqual([11, null, null, null, null])
    expect(animalAr({ dv: '3P', ar: [12, null, null, null, null] }, a)).toEqual([12, null, null, null, null])
    expect(parseDv('4P')).toMatchObject({ dmg: 4, stun: false })
    expect(parseDv('3S')).toMatchObject({ dmg: 3, stun: true })
    expect(parseDv('(STR)P').dmg).toBeNull()
  })
})

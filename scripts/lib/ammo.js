// Ammunition switching and the alternate attacks (club, animal form) for the export's 0.13 fields. Pure: no Foundry calls.
// Eden keeps one damage value, a stun flag and five Attack Rating bands on a weapon (system.dmg, stun, attackRating;
// a band of 0 is Eden's "-"). The export gives the weapon's plain values (values.dv/ar: its fittings on, regular rounds)
// and each ammunition type's final values with it loaded (values.ammoTypes). A switch adds the difference between the
// type and plain to the weapon's baseline, band by band, so what the user set by hand on the sheet survives a switch.
import { MODULE_ID } from './constants.js'

const n = v => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)
const bands = ar => [0, 1, 2, 3, 4].map(i => n(ar?.[i]))
// a band the type moves: both numbers; a band either leaves out (null, '-') moves by 0
const delta = (t, plain) => ({
  dv: t ? (n(t.dv) ?? plain.dv) - plain.dv : 0,
  ar: bands(t?.ar).map((v, i) => (v != null && plain.ar[i] != null ? v - plain.ar[i] : 0)),
  stun: !!t?.stun && !plain.stun,
})

/** The flags a weapon line with ammoTypes gets: the plain values, the types, and the baseline (= plain, as written). */
export function ammoFlags(values) {
  const plain = { dv: n(values?.dv) ?? 0, ar: bands(values?.ar), stun: !!values?.stun }
  const types = (values?.ammoTypes ?? []).map(t => ({ id: String(t.id), name: String(t.name ?? t.id), dv: n(t.dv), ar: bands(t.ar), stun: !!t.stun }))
  return { ammoPlain: plain, ammoTypes: types, ammoBase: { dmg: plain.dv, stun: plain.stun, attackRating: plain.ar.map(v => v ?? 0) } }
}

/**
 * The update for switching a managed weapon to `toId` ('' or null: standard rounds). sys: its current system ({ dmg,
 * stun, attackRating }); f: its flags of ours ({ ammoPlain, ammoTypes, ammoBase, ammoActive }). The baseline is
 * recomputed first from what the weapon has now less the active type's change (a hand edit stays), then the new type's
 * change is added. A "-" band stays "-"; never NaN. Returns { system: { dmg, stun, attackRating, ammoLoaded }, flags:
 * { ammoActive, ammoBase } } or null when the weapon is not ours or the type unknown.
 */
export function switchAmmo(sys, f, toId) {
  if (!f?.ammoPlain || !Array.isArray(f.ammoTypes)) return null
  const plain = f.ammoPlain, find = id => (id ? f.ammoTypes.find(t => t.id === id) : null)
  const to = find(toId)
  if (toId && !to) return null
  const was = delta(find(f.ammoActive), plain), now = delta(to, plain)
  const cur = bands(sys?.attackRating).map(v => v ?? 0)
  const base = {
    dmg: (n(sys?.dmg) ?? 0) - was.dv,
    // the stun the ammunition added is not the weapon's own (a taser keeps its own)
    stun: was.stun ? !!f.ammoBase?.stun : !!sys?.stun,
    attackRating: cur.map((v, i) => (v > 0 ? v - was.ar[i] : 0)),
  }
  return {
    system: { dmg: Math.max(0, base.dmg + now.dv), stun: base.stun || now.stun,
      attackRating: base.attackRating.map((v, i) => (v > 0 ? Math.max(1, v + now.ar[i]) : 0)), ammoLoaded: 'regular' },
    flags: { ammoActive: to ? to.id : null, ammoBase: base },
  }
}

/**
 * Re-import: the fresh item's system holds the new export's plain values and its flags the new ammoFlags. The old
 * item's choice is kept when that type still exists (switched on the new baseline), else dropped with the stats (both
 * are already plain). Returns { system, flags } for the item update (flags: ours only).
 */
export function reconcileAmmo(oldOurs, item) {
  const ours = { ...item.flags?.[MODULE_ID] }, system = { ...item.system }
  const keep = oldOurs?.ammoActive && ours.ammoTypes?.some(t => t.id === oldOurs.ammoActive) ? oldOurs.ammoActive : null
  if (!keep) return { system, flags: ours }
  const u = switchAmmo(system, { ...ours, ammoActive: null }, keep)
  return { system: { ...system, ...u.system }, flags: { ...ours, ...u.flags } }
}

/** "3S" / "4P" / "(STR+2)P" -> { dmg, stun, text }; dmg null when no leading number. */
export function parseDv(dv) {
  const s = String(dv ?? '').trim(), m = s.match(/^(\d+)/)
  return { dmg: m ? Number(m[1]) : null, stun: /S\)?$/i.test(s) || /\bstun\b/i.test(s), text: s }
}

/**
 * An unsaved Eden close-combat weapon's data for an alternate attack (a Melee Hardening club, an animal form's natural
 * weapon): clean melee data, no ammo, modes or effects, no id. Eden adds the actor's live Strength to a close-combat
 * weapon's close band (item.mjs calculatedAttackRating), so that band is stored less it: the sheet and the roll show
 * the exported number. ar: the exported bands; str: the actor's live Strength pool; spec: Eden's spec key or ''.
 * A stored close band of exactly 0 with the unarmed spec would make Eden add Reaction too: then no spec.
 */
export function meleeItemData({ name, dmg, stun, dmgDef, ar, spec = '', subtype = 'CLUBS', description = '' }, str) {
  const b = bands(ar), attackRating = b.map(v => v ?? 0)
  if (b[0] != null) attackRating[0] = b[0] - (n(str) ?? 0)
  const skillSpec = spec === 'unarmed' && attackRating[0] === 0 ? '' : spec
  return { name, type: 'gear', system: { type: 'WEAPON_CLOSE_COMBAT', subtype, skill: 'close_combat', skillSpec, dmg: n(dmg) ?? 0,
    stun: !!stun, dmgDef: dmgDef ?? '', attackRating, modes: { SS: false, SA: false, BF: false, FA: false }, ammocap: 0, ammocount: 0,
    description, genesisID: '' } }
}

/** An animal-form weapon's exported close band: its own ar when the export has it, else the form's REA + STR. */
export const animalAr = (w, attrs) => (Array.isArray(w?.ar) ? bands(w.ar) : [(n(attrs?.rea) ?? 0) + (n(attrs?.str) ?? 0), null, null, null, null])

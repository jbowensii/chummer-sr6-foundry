// Rolls for the panels (panels.js), through Eden's own API (game.sr6.rollTypes, exported at Shadowrun6.js init), so each
// roll gets Eden's dialog, edge, chat card and defense/damage handling. Foundry globals only inside functions.
import { animalAr, meleeItemData, parseDv } from '../lib/ammo.js'
import { specKey } from '../lib/eden.js'
import { edenSpecLabels } from './apply.js'

const types = () => game.sr6?.rollTypes

/** An owned weapon, as Eden's own weapon button rolls it (SR6ActorSheet weapon-roll: WeaponRoll + actor.rollItem). */
export function rollWeapon(actor, item) {
  const { WeaponRoll } = types()
  return actor.rollItem(new WeaponRoll(actor, item))
}

const spec = name => (name ? specKey(name, edenSpecLabels().close_combat ?? {}) ?? '' : '')
/**
 * An alternate attack as an UNSAVED Eden weapon (CONFIG.Item.documentClass, parented to the actor so its getters read the
 * actor's live Strength): never written to the world, so the firearm it came from and its ammunition are untouched
 * (Rolls.js only updates ammocount when ammocap > 0; this item has none). Its pool comes from the skill (rollItem
 * computes it when pool is 0, as it would for a sheet item Eden had not prepared).
 */
export function alternateItem(actor, data) {
  const Item = CONFIG.Item.documentClass
  const str = actor.system?.attributes?.str?.pool ?? 0
  return new Item(meleeItemData(data, str), { parent: actor })
}
export function rollAlternate(actor, data) {
  const { WeaponRoll } = types(), item = alternateItem(actor, data), roll = new WeaponRoll(actor, item)
  roll.pool = 0
  return actor.rollItem(roll)
}

/** A Melee Hardening firearm's club (meleeAlternate: { dv, stun, ar, skill, spec }) as alternate-attack data. */
export const clubData = (weapon, alt) => ({ name: `${weapon.name} (club)`, dmg: alt.dv, stun: alt.stun !== false,
  dmgDef: `${alt.dv}${alt.stun !== false ? 'S' : 'P'}`, ar: alt.ar, spec: spec(alt.spec), subtype: 'CLUBS' })

/** An animal form's natural weapons ({ name, dv: "4P", skill?, ar? }) as alternate-attack data; one with no readable DV: null. */
export function animalWeapons(form) {
  return (form?.weapons ?? []).map(w => {
    const d = parseDv(w.dv)
    if (d.dmg == null) return null
    // a natural weapon rolls Close Combat with the Unarmed Combat specialization (the export's skill is always that one)
    return { name: `${w.name} (${form.form})`, dmg: d.dmg, stun: d.stun, dmgDef: d.text, ar: animalAr(w, form.attributes),
      spec: spec('Unarmed Combat'), subtype: 'UNARMED' }
  })
}

/**
 * A plain dice pool (a drone's autosoft pool, a rigger's pool) as Eden's common check (SR6ActorSheet _onCommonCheck:
 * PreparedRoll + actor.rollCommonCheck). wounds false: no wound or sustaining modifier (a drone acting on its own is not
 * hurt by its owner's wounds; Rolls.js honours dialogConfig.useWoundModifier / useSustainedSpellModifier === false).
 */
export function rollPool(actor, { pool, label, wounds = true }) {
  const { PreparedRoll, RollType } = types(), roll = new PreparedRoll()
  roll.pool = Math.max(0, Math.trunc(Number(pool) || 0))
  roll.rollType = RollType.Common
  roll.actionText = roll.checkText = label
  roll.allowBuyHits = true
  roll.useWildDie = 1
  return actor.rollCommonCheck(roll, { useModifier: true, useThreshold: true, ...wounds ? {} : { useWoundModifier: false, useSustainedSpellModifier: false } })
}

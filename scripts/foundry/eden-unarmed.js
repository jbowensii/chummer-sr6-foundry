// shadowrun6-eden 4.0.11 gives every Player and NPC an Unarmed gear item (genesisID 'unarmed', actor.js:3345-3360, 3429-3451),
// and rolls an unarmed attack from that item's getters: calculatedAttackRating is the item's AR plus Strength (and
// Reaction), calculatedDamage its damage, calculatedStun its stun flag (item.mjs:352-430). An actor's physical attack rating
// mod (system.attackrating.physical.mod, actor.js:1152) is never added to it, and Eden has no unarmed damage modifier or
// Physical flag. The catalog's unarmed effects (derived:unarmed-ar, -dv, -damage) are written on the actor, as the
// physical AR mod and the module's traits.unarmedDv and traits.unarmedPhysical (lib/eden.js DERIVED_KEY); these three getters
// read them for the Unarmed item only. A weapon of any other kind is untouched.
// ponytail: wraps three Eden getters by name; drop it once Eden's Unarmed reads its actor's modifiers itself.
export const isUnarmed = item => item?.system?.genesisID === 'unarmed' || (item?.system?.subtype === 'UNARMED' && item?.system?.skillSpec === 'unarmed')

export function patchEdenUnarmed(Item = CONFIG.Item?.documentClass) {
  const proto = Item?.prototype
  if (!proto || proto.__chummerUnarmed) return false
  const wrap = (name, change) => {
    let get = null  // (the class's own getter, else an inherited one)
    for (let p = proto; p && !get; p = Object.getPrototypeOf(p)) get = Object.getOwnPropertyDescriptor(p, name)?.get ?? null
    if (typeof get !== 'function') return
    Object.defineProperty(proto, name, { configurable: true, get() {
      const value = get.call(this)
      return isUnarmed(this) && this.actor ? change(this.actor, value) : value
    } })
  }
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
  wrap('calculatedAttackRating', (actor, ar) => {
    const mod = num(actor.system?.attackrating?.physical?.mod)
    if (!mod || !Array.isArray(ar) || !(ar[0] >= 0)) return ar  // (-1: Eden's "-", no band)
    return [ar[0] + mod, ...ar.slice(1)]
  })
  wrap('calculatedDamage', (actor, dmg) => (dmg == null || !num(actor.traits?.unarmedDv) ? dmg : Math.max(0, dmg + num(actor.traits.unarmedDv))))
  wrap('calculatedStun', (actor, stun) => (actor.traits?.unarmedPhysical === true ? false : stun))
  proto.__chummerUnarmed = true
  return true
}

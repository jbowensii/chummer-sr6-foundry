// Armor an actor carries but does not wear must not give its bonuses. Eden marks worn armor with the gear item's
// system.usedForPool (documents/actor.js _prepareDefenseRatings reads it for the armor's own rating); our Active Effects on
// an armor item are transferred to the actor whatever that flag says. An effect is "suppressed" in Foundry when its
// isSuppressed getter says so (ActiveEffect#active = !disabled && !isSuppressed, which the actor's effect application
// checks on every prepare), so a transferred effect of ours on an ARMOR item that is not in use is suppressed, live on
// every toggle of the flag. Foundry 14 asks the effect's system data model (Eden's CONFIG.ActiveEffect.dataModels.base);
// Foundry 13 asks the effect itself: both are wrapped, and any other effect gets the answer it would have had.
// ponytail: wraps one getter by name on two classes; drop it once Eden suppresses unworn armor's effects itself.
import { MODULE_ID } from '../lib/constants.js'

/** Is this Active Effect one of ours, transferred from an ARMOR item that is not worn (system.usedForPool === false)? */
export function isUnwornArmorEffect(fx) {
  const item = fx?.parent
  return !!(fx?.transfer && fx.flags?.[MODULE_ID]?.chummer && item?.documentName === 'Item' && item.type === 'gear'
    && item.system?.type === 'ARMOR' && item.system?.usedForPool === false)
}

export function patchArmorSuppression(classes = [CONFIG.ActiveEffect?.dataModels?.base, CONFIG.ActiveEffect?.documentClass]) {
  let patched = 0
  for (const C of classes) {
    const proto = C?.prototype
    if (!proto || Object.hasOwn(proto, '__chummerArmor')) continue
    let own = null  // (the getter it would have had: the class's own, else an inherited one)
    for (let p = proto; p && !own; p = Object.getPrototypeOf(p)) own = Object.getOwnPropertyDescriptor(p, 'isSuppressed') ?? null
    // the effect: the document itself (13) or the model's parent (14)
    const effectOf = self => (self?.parent?.documentName === 'ActiveEffect' ? self.parent : self)
    Object.defineProperty(proto, 'isSuppressed', { configurable: true, get() {
      if (isUnwornArmorEffect(effectOf(this))) return true
      return own?.get ? own.get.call(this) : undefined
    } })
    Object.defineProperty(proto, '__chummerArmor', { value: true })
    patched++
  }
  return patched
}

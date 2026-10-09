// shadowrun6-eden 4.0.11's SR6Item._onUpdate calls _checkPersonaChanges and _updatePanSheets, which read the item's actor
// (this.actor.items, this.actor.system.pan) whenever an update touches usedForPool, matrix.wirelessActive or
// matrix.matrixCM. A compendium entry or a world item has no actor, so every write of our book packs threw (and Foundry
// fills those fields from Eden's defaults on a full update, so leaving them out doesn't help). An item with no actor has
// no persona and no PAN to update: those two skip it; on an actor's item they run exactly as Eden wrote them.
// ponytail: wraps two Eden methods by name; drop it once Eden checks for an actor itself.
export function guardEdenItemHooks(Item = CONFIG.Item?.documentClass) {
  const proto = Item?.prototype
  if (!proto || proto.__chummerGuarded) return false
  for (const [name, skip] of [['_checkPersonaChanges', () => Promise.resolve(false)], ['_updatePanSheets', () => undefined]]) {
    const orig = proto[name]
    if (typeof orig !== 'function') continue
    proto[name] = function (...args) { return this.actor ? orig.apply(this, args) : skip() }
  }
  proto.__chummerGuarded = true
  return true
}

import { expect, test } from 'vitest'
import { guardEdenItemHooks } from '../scripts/foundry/eden-guard.js'

test("Eden's persona and PAN hooks skip an item with no actor and run for an actor's item", async () => {
  const calls = []
  class Item {
    async _checkPersonaChanges(c) { calls.push(['persona', c]); return this.actor.items.length }
    _updatePanSheets(c) { calls.push(['pan', c]); return this.actor.system.pan.administrator.uuid }
  }
  expect(guardEdenItemHooks(Item)).toBe(true)
  expect(guardEdenItemHooks(Item)).toBe(false)  // once
  const pack = new Item()  // a compendium entry: no actor
  expect(await pack._checkPersonaChanges({ system: { usedForPool: false } })).toBe(false)
  expect(pack._updatePanSheets({ system: { usedForPool: false } })).toBeUndefined()
  expect(calls).toEqual([])
  const owned = Object.assign(new Item(), { actor: { items: [1, 2], system: { pan: { administrator: { uuid: 'A' } } } } })
  expect(await owned._checkPersonaChanges('x')).toBe(2)
  expect(owned._updatePanSheets('y')).toBe('A')
  expect(calls).toEqual([['persona', 'x'], ['pan', 'y']])
})

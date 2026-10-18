// The runtime patches (scripts/foundry/eden-unarmed.js, eden-armor.js, targets.js) against tiny fakes of Eden's classes and
// Foundry's globals. The real thing runs in Foundry's Quench batches (scripts/foundry/quench.js).
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { isUnwornArmorEffect, patchArmorSuppression } from '../scripts/foundry/eden-armor.js'
import { isUnarmed, patchEdenUnarmed } from '../scripts/foundry/eden-unarmed.js'
import { applyToTargets, changesOf, clearFromTargets, copyData, forTargets, onSocket, promptsOf, registerTargets, serial, SOCKET, sweepOrphans } from '../scripts/foundry/targets.js'

describe('Eden’s Unarmed item reads the actor’s unarmed effects', () => {
  // Eden's getters as they are (item.mjs:352-430): the AR array with -1 for no band, the damage, the stun flag
  class Item {
    get calculatedAttackRating() { return this.system.attackRating.map(n => (n === 0 ? -1 : n + 4)) }
    get calculatedDamage() { return this.actor ? this.system.dmg : null }
    get calculatedStun() { return this.system.stun }
  }
  const unarmed = (actor, system = {}) => Object.assign(new Item(), { actor, system: { genesisID: 'unarmed', attackRating: [0, 0, 0, 0, 0], dmg: 1, stun: true, ...system } })
  const actor = (mod, traits) => ({ system: { attackrating: { physical: { mod } } }, traits })
  test('physical AR mod on the first band, unarmed DV on the damage, Physical turns stun off', () => {
    expect(patchEdenUnarmed(Item)).toBe(true)
    expect(patchEdenUnarmed(Item)).toBe(false)  // once
    const u = unarmed(actor(2, { unarmedDv: 3, unarmedPhysical: true }), { attackRating: [5, 0, 0, 0, 0] })
    expect(u.calculatedAttackRating).toEqual([11, -1, -1, -1, -1])  // Eden's 5+4, our +2; the other bands stay "-"
    expect(u.calculatedDamage).toBe(4)
    expect(u.calculatedStun).toBe(false)
  })
  test('nothing changes with no effect, on another weapon, or with no actor', () => {
    class Plain extends Item {}
    patchEdenUnarmed(Plain)
    const u = unarmed(actor(0, {}), { attackRating: [5, 0, 0, 0, 0] })
    expect([u.calculatedAttackRating, u.calculatedDamage, u.calculatedStun]).toEqual([[9, -1, -1, -1, -1], 1, true])
    const pistol = unarmed(actor(2, { unarmedDv: 3, unarmedPhysical: true }), { genesisID: 'x', attackRating: [5, 0, 0, 0, 0] })
    expect([pistol.calculatedAttackRating, pistol.calculatedDamage, pistol.calculatedStun]).toEqual([[9, -1, -1, -1, -1], 1, true])
    expect(unarmed(null).calculatedDamage).toBeNull()
    expect(isUnarmed({ system: { subtype: 'UNARMED', skillSpec: 'unarmed' } })).toBe(true)  // (Eden's own marker, with no genesisID)
  })
  test('a negative unarmed DV never takes the damage below 0', () => {
    patchEdenUnarmed(Item)  // (already: a no-op)
    expect(unarmed(actor(0, { unarmedDv: -5 })).calculatedDamage).toBe(0)
  })
})

describe('unworn armor’s effects are suppressed', () => {
  const armor = (usedForPool, type = 'ARMOR') => ({ documentName: 'Item', type: 'gear', system: { type, usedForPool } })
  const fx = (parent, over = {}) => ({ transfer: true, flags: { [MODULE_ID]: { chummer: true } }, parent, ...over })
  test('ours, transferred, on an ARMOR item with usedForPool false: yes; anything else: no', () => {
    expect(isUnwornArmorEffect(fx(armor(false)))).toBe(true)
    for (const e of [fx(armor(true)), fx(armor(false, 'WEAPON_FIREARMS')), fx(armor(false), { transfer: false }), fx(armor(false), { flags: {} }),
      fx({ documentName: 'Actor' }), fx(armor(undefined))]) expect(isUnwornArmorEffect(e)).toBe(false)
  })
  test('Foundry 14 asks the data model, 13 the effect: both answer, and any other effect gets the answer it would have had', () => {
    class Base { get isSuppressed() { return 'inherited' } }
    class Model {}  // Eden's data model: no getter of its own
    class Doc extends Base {}
    expect(patchArmorSuppression([Model, Doc])).toBe(2)
    expect(patchArmorSuppression([Model, Doc])).toBe(0)
    const effect = Object.assign(new Doc(), fx(armor(false)))
    expect(effect.isSuppressed).toBe(true)
    expect(Object.assign(new Doc(), fx(armor(true))).isSuppressed).toBe('inherited')
    const model = Object.assign(new Model(), { parent: { documentName: 'ActiveEffect', ...fx(armor(false)) } })
    expect(model.isSuppressed).toBe(true)
    expect(Object.assign(new Model(), { parent: { documentName: 'ActiveEffect', ...fx(armor(true)) } }).isSuppressed).toBeUndefined()  // (falls through to duration.expired)
    // live on toggle: the same effect, the item's flag changed
    effect.parent.system.usedForPool = true
    expect(effect.isSuppressed).toBe('inherited')
  })
})

// Foundry's Collection as the module meets it: a Map of values with find/filter/map/some and iteration over the values, and
// NOTHING else (no flatMap, flat, slice, concat): a plain array in a fake hid exactly that once.
class Collection extends Map {
  constructor(items = [], key = i => i.id ?? i.uuid) { super(items.map(i => [key(i), i])) }
  [Symbol.iterator]() { return this.values() }
  find(f) { for (const v of this.values()) if (f(v)) return v; return undefined }
  filter(f) { return [...this.values()].filter(f) }
  map(f) { return [...this.values()].map(f) }
  some(f) { return [...this.values()].some(f) }
}

describe('Apply to targets', () => {
  let socket, notes, made, removed, hooks
  const spellFx = (name, changes, flags = {}) => ({ name, flags: { [MODULE_ID]: { forTargets: true, ...flags } }, system: { changes }, transfer: false, disabled: true })
  const actorOf = (uuid, owner = true, effects = [], extra = {}) => ({ uuid, id: uuid, name: uuid, documentName: 'Actor', isOwner: owner, effects: new Collection(effects, e => e.id),
    createEmbeddedDocuments: async (_, data) => { made.push([uuid, data]) }, deleteEmbeddedDocuments: async (_, ids) => { removed.push([uuid, ids]) }, ...extra })
  const spell = (effects, system = {}, extra = {}) => ({ name: 'Made-up Boost', uuid: 'Item.s1', documentName: 'Item', img: 'i.svg', effects: new Collection(effects, e => e.name), system, ...extra })
  const notify = () => ({ warn: m => notes.push(['warn', m]), info: m => notes.push(['info', m]) })
  const mine = (id, from) => ({ id, flags: { [MODULE_ID]: { appliedFrom: from } } })
  const e1 = () => spellFx('On the target: Made-up Boost', [{ key: 'k', type: 'add', value: 1 }])
  beforeEach(() => {
    socket = []; notes = []; made = []; removed = []; hooks = {}
    const users = new Collection([{ id: 'gm', isGM: true, targets: new Set() }, { id: 'p1', isGM: false, targets: new Set() }])
    users.activeGM = users.get('gm')
    globalThis.game = { release: { generation: 14 }, i18n: { localize: k => k, format: (k, d) => `${k} ${JSON.stringify(d)}` }, socket: { emit: (...a) => socket.push(a), on: (...a) => { hooks.socket = a } },
      actors: new Collection(), scenes: new Collection(), user: users.get('gm'), users, modules: new Collection() }
    globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, OVERRIDE: 5 } }
    globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn } }
    globalThis.foundry = { utils: { getProperty: (o, p) => p.split('.').reduce((v, k) => v?.[k], o) } }
    globalThis.fromUuid = async () => null
  })
  test('copyData: enabled, not transferred, from the item, the asked-for number in with its sign', () => {
    const item = spell([]), e = spellFx('On the target: Made-up Boost', [{ key: 'system.initiative.physical.diceMod', type: 'add', value: 0 }, { key: 'system.skills.con.modifier', type: 'add', value: 2 }],
      { prompt: { 'system.initiative.physical.diceMod': { what: 'hits', sign: -1 } } })
    expect(copyData(item, e, { hits: 3 })).toEqual({ name: 'On the target: Made-up Boost', img: 'i.svg', origin: 'Item.s1', disabled: false, transfer: false,
      flags: { [MODULE_ID]: { appliedFrom: 'Item.s1' } }, system: { changes: [{ key: 'system.initiative.physical.diceMod', type: 'add', value: -3 }, { key: 'system.skills.con.modifier', type: 'add', value: 2 }] } })
    expect(changesOf({ changes: [{ key: 'k', value: 1, mode: 5 }] })).toEqual([{ key: 'k', value: 1, mode: 5 }])  // (Foundry 13’s shape)
  })
  test('the targeted tokens’ actors get the effects, once each; a number is asked for once per kind', async () => {
    const f1 = spellFx('On the target: Made-up Boost', [{ key: 'system.initiative.physical.diceMod', type: 'add', value: 0 }], { prompt: { 'system.initiative.physical.diceMod': { what: 'hits', sign: 1 } } })
    const f2 = spellFx('Others get: Made-up Boost', [{ key: 'system.skills.con.modifier', type: 'add', value: 0 }], { prompt: { 'system.skills.con.modifier': { what: 'hits', sign: 1 } } })
    const item = spell([f1, f2, { name: 'Sustained: caster', flags: { [MODULE_ID]: {} } }])
    expect(forTargets(item)).toEqual([f1, f2])
    expect(promptsOf(item)).toEqual(['hits'])
    const a = actorOf('Actor.a'), ask = vi.fn(async () => 2)
    expect(await applyToTargets(item, { targets: new Set([{ actor: a }, { actor: a }, { actor: null }]), ask, notify: notify() })).toBe(1)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(made).toHaveLength(1)
    expect(made[0][1].map(d => d.system.changes[0].value)).toEqual([2, 2])
    expect(notes.at(-1)[0]).toBe('info')
  })
  test('item 2: a spell Eden says is not sustained is refused with a warning (its effects would never end); one with no flag, or sustained, is not', async () => {
    const t = [{ actor: actorOf('Actor.a') }]
    expect(await applyToTargets(spell([e1()], { isSustained: false }), { targets: t, notify: notify() })).toBe(0)
    expect(notes.at(-1)).toEqual(['warn', 'SR6I.Targets.NotSustained {"name":"Made-up Boost"}'])
    expect(made).toEqual([])
    expect(await applyToTargets(spell([e1()], { isSustained: true }), { targets: t, notify: notify() })).toBe(1)
    expect(await applyToTargets(spell([e1()], {}), { targets: t, notify: notify() })).toBe(1)  // (a complex form or power has no such flag)
  })
  test('item 3: a target the user does not own goes to a GM over the socket; with no GM online it is not sent and not counted', async () => {
    const other = actorOf('Actor.b', false), own = actorOf('Actor.c')
    expect(await applyToTargets(spell([e1()]), { targets: [{ actor: other }, { actor: own }], notify: notify() })).toBe(2)
    expect(socket).toEqual([[SOCKET, { type: 'apply', item: 'Item.s1', actor: 'Actor.b', numbers: {} }]])
    socket.length = 0; made.length = 0
    game.users.activeGM = null
    expect(await applyToTargets(spell([e1()]), { targets: [{ actor: other }, { actor: own }], notify: notify() })).toBe(1)  // (only the one it could do)
    expect(socket).toEqual([])
    expect(notes.some(([k, m]) => k === 'warn' && m.startsWith('SR6I.Targets.NoGM'))).toBe(true)
    notes.length = 0
    expect(await applyToTargets(spell([e1()]), { targets: [{ actor: other }], notify: notify() })).toBe(0)
    expect(notes.some(([k]) => k === 'info')).toBe(false)  // (no "applied" when nothing was)
  })
  test('no target, no effects or a cancelled or silly number: nothing', async () => {
    const asks = spellFx('On the target: X', [{ key: 'k', type: 'add', value: 0 }], { prompt: { k: { what: 'Force', sign: 1 } } })
    expect(await applyToTargets(spell([e1()]), { targets: [], notify: notify() })).toBe(0)
    expect(await applyToTargets(spell([]), { targets: [{ actor: actorOf('Actor.b') }], notify: notify() })).toBe(0)
    expect(await applyToTargets(spell([asks]), { targets: [{ actor: actorOf('Actor.c') }], ask: async () => null, notify: notify() })).toBe(0)
    expect(await applyToTargets(spell([asks]), { targets: [{ actor: actorOf('Actor.c') }], ask: async () => 999, notify: notify() })).toBe(0)
    expect(made).toEqual([])
  })
  test('item 4: two applies at once leave one copy: the second waits for the first, then replaces it', async () => {
    const live = []  // the effects on the actor, as Foundry would hold them
    const slow = ms => new Promise(r => setTimeout(r, ms))
    const a = actorOf('Actor.a')
    a.effects = { filter: f => live.filter(f) }
    a.deleteEmbeddedDocuments = async (_, ids) => { await slow(5); for (const id of ids) live.splice(live.findIndex(e => e.id === id), 1) }
    let n = 0
    a.createEmbeddedDocuments = async (_, data) => { await slow(5); live.push(...data.map(d => ({ id: `e${++n}`, ...d }))) }
    const item = spell([e1()])
    await Promise.all([applyToTargets(item, { targets: [{ actor: a }], notify: notify() }), applyToTargets(item, { targets: [{ actor: a }], notify: notify() })])
    expect(live).toHaveLength(1)
    // a different item on the same actor is its own queue, and a failing job does not block the next
    await expect(serial('k', async () => { throw new Error('x') })).rejects.toThrow('x')
    await expect(serial('k', async () => 'after')).resolves.toBe('after')
  })
  test('item 5: the GM’s client rebuilds the effects from the item, and only for a sender who owns it and targets or observes the actor', async () => {
    const f = spellFx('On the target: X', [{ key: 'k', type: 'add', value: 0 }], { prompt: { k: { what: 'hits', sign: 1 } } })
    const old = mine('old', 'Item.s1')
    const target = actorOf('Actor.b', true, [old, { id: 'user', flags: {} }], { testUserPermission: (u, l) => l === 'OBSERVER' && u.id === 'p1' })
    const owned = new Set(['p1']), item = spell([f], {}, { testUserPermission: (u, l) => l === 'OWNER' && owned.has(u.id) })
    globalThis.fromUuid = async u => (u === 'Item.s1' ? item : u === 'Actor.b' ? target : null)
    const ask = { type: 'apply', item: 'Item.s1', actor: 'Actor.b', numbers: { hits: 4 }, effects: [{ name: 'forged' }] }
    expect(await onSocket(ask, 'p1')).toBe(true)  // the owner, who can see the actor
    expect(removed).toEqual([['Actor.b', ['old']]])
    expect(made[0][1].map(d => [d.name, d.system.changes[0].value])).toEqual([['On the target: X', 4]])  // not the forged one
    made.length = 0
    expect(await onSocket({ ...ask }, 'gm')).toBe(true)  // a GM’s own request
    made.length = 0
    expect(await onSocket(ask, 'nobody')).toBe(false)  // not a user
    owned.clear()
    expect(await onSocket(ask, 'p1')).toBe(false)  // not the item’s owner
    owned.add('p1')
    target.testUserPermission = () => false
    expect(await onSocket(ask, 'p1')).toBe(false)  // can neither target nor see the actor
    game.users.get('p1').targets = new Set([{ actor: { uuid: 'Actor.b' } }])
    expect(await onSocket(ask, 'p1')).toBe(true)  // …but has it targeted
    made.length = 0
    expect(await onSocket({ ...ask, numbers: { hits: 400 } }, 'gm')).toBe(false)  // a number past the limit
    expect(await onSocket({ ...ask, numbers: {} }, 'gm')).toBe(false)  // the number asked for missing
    expect(await onSocket({ type: 'other' }, 'gm')).toBe(false)
    expect(await onSocket({ ...ask, actor: 'Item.s1' }, 'gm')).toBe(false)  // not an actor
    item.system.isSustained = false
    expect(await onSocket(ask, 'gm')).toBe(false)  // not sustained
    item.system.isSustained = true
    game.users.activeGM = { id: 'someone else' }
    expect(await onSocket(ask, 'gm')).toBe(false)  // (only the active GM acts)
    expect(made).toEqual([])
  })
  test('item 1: clearFromTargets walks Foundry’s Collections (no flatMap on them): the world’s actors and unlinked tokens, nothing else', async () => {
    const a = actorOf('Actor.a', true, [mine('m', 'Item.s1'), mine('o', 'Item.s2')]), t = actorOf('Token.t', true, [mine('m', 'Item.s1')])
    game.actors = new Collection([a])
    game.scenes = new Collection([{ id: 'sc', tokens: new Collection([{ id: 't1', actorLink: false, actor: t }, { id: 't2', actorLink: true, actor: actorOf('Actor.z', true, [mine('m', 'Item.s1')]) }]) }])
    expect(typeof game.actors.flatMap).toBe('undefined')  // (the fake is as thin as Foundry’s)
    expect(await clearFromTargets('Item.s1')).toBe(2)
    expect(removed).toEqual([['Actor.a', ['m']], ['Token.t', ['m']]])
  })
  test('item 2: the sweep removes effects whose item no longer exists, and keeps the ones whose item does', async () => {
    const a = actorOf('Actor.a', true, [mine('alive', 'Item.alive'), mine('gone', 'Item.gone'), { id: 'user', flags: {} }])
    game.actors = new Collection([a])
    globalThis.fromUuid = async u => (u === 'Item.alive' ? {} : null)
    expect(await sweepOrphans()).toBe(1)
    expect(removed).toEqual([['Actor.a', ['gone']]])
  })
  test('item 6: the hooks clean up — updateItem when sustaining ends, deleteItem, deleteActor (its items), deleteToken (an unlinked one’s) — on the active GM’s client only', async () => {
    const t = actorOf('Actor.t', true, [mine('a', 'Item.s1'), mine('b', 'Actor.gone.Item.i9'), mine('c', 'Scene.s.Token.k.Actor.q.Item.i1'), mine('d', 'Item.other')])
    game.actors = new Collection([t])
    globalThis.fromUuid = async () => ({})  // (the sweep at ready finds every item alive)
    registerTargets()
    expect(hooks.socket[0]).toBe(SOCKET)
    const settle = () => new Promise(r => setTimeout(r, 0))
    const run = async (name, ...args) => { removed.length = 0; hooks[name](...args); await settle(); return removed.flatMap(([, ids]) => ids) }
    expect(await run('updateItem', { uuid: 'Item.s1' }, { system: { isSustained: true } })).toEqual([])  // (still sustained)
    expect(await run('updateItem', { uuid: 'Item.s1' }, { name: 'renamed' })).toEqual([])
    expect(await run('updateItem', { uuid: 'Item.s1' }, { system: { isSustained: false } })).toEqual(['a'])
    t.effects = new Collection([mine('a', 'Item.s1'), mine('b', 'Actor.gone.Item.i9'), mine('c', 'Scene.s.Token.k.Actor.q.Item.i1')], e => e.id)
    expect(await run('deleteItem', { uuid: 'Item.s1' })).toEqual(['a'])
    expect(await run('deleteActor', { uuid: 'Actor.gone' })).toEqual(['b'])
    expect(await run('deleteToken', { actorLink: false, actor: { uuid: 'Scene.s.Token.k.Actor.q' } })).toEqual(['c'])
    expect(await run('deleteToken', { actorLink: true, actor: { uuid: 'Scene.s.Token.k.Actor.q' } })).toEqual([])  // (a linked token’s actor lives on)
    game.users.activeGM = { id: 'someone else' }  // another GM is the one who cleans
    expect(await run('deleteItem', { uuid: 'Item.s1' })).toEqual([])
    expect(await run('deleteActor', { uuid: 'Actor.gone' })).toEqual([])
  })
  test('item 6: registerTargets sweeps on the active GM’s client at ready, and adds the button only for an item with target effects', async () => {
    game.actors = new Collection([actorOf('Actor.a', true, [mine('gone', 'Item.gone')])])
    registerTargets()
    await new Promise(r => setTimeout(r, 0))
    expect(removed).toEqual([['Actor.a', ['gone']]])
    const buttons = []
    hooks.getItemSheetHeaderButtons({ item: spell([e1()]) }, buttons)
    hooks.getItemSheetHeaderButtons({ item: spell([]) }, buttons)
    expect(buttons.map(b => b.class)).toEqual(['sr6i-apply-targets'])
  })
})

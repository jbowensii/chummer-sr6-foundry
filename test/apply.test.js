// applyRunner (scripts/foundry/apply.js) against a tiny fake of the Foundry globals it uses: create order, effect shape,
// Replace order and rollback. The real thing runs in Foundry's Quench batches (scripts/foundry/quench.js).
import { beforeEach, expect, test, vi } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { applyRunner, dedupeUnarmed, effectData } from '../scripts/foundry/apply.js'

let log, world, n, failCreateItems
const flags = f => ({ [MODULE_ID]: { exportedAt: '2026-10-04T09:00:00.000Z', ...f } })
// an owned item with its effects, as the replace path touches them
const fakeItem = i => Object.assign(i, { effects: (i.effects ?? []).map(e => ({ id: e.id ?? `e${++n}`, ...e })),
  async deleteEmbeddedDocuments(_, ids) { log.push(['deleteEffects', i.id, ids]); i.effects = i.effects.filter(e => !ids.includes(e.id)) },
  async createEmbeddedDocuments(_, arr) { log.push(['createEffects', i.id, arr.map(e => e.name)]); i.effects.push(...arr.map(e => ({ id: `e${++n}`, ...e }))) } })
class FakeActor {
  constructor(data, failDelete = false) {
    Object.assign(this, { id: `a${++n}`, system: {}, ...data, failDelete })
    this.items = (data.items ?? []).map(i => fakeItem({ ...i, id: `i${++n}` }))
    world.push(this)
  }
  set items(v) { this._items = Object.assign(v, { get: id => v.find(i => i.id === id) }) }
  get items() { return this._items }
  async update(u) { log.push(['update', u]); Object.assign(this.system, u.system ?? {}) }
  async createEmbeddedDocuments(_, arr) {
    log.push(['items', arr])
    if (failCreateItems) throw new Error('items failed')
    const made = arr.map(i => fakeItem({ ...i, id: `i${++n}` })); this.items.push(...made); return made
  }
  async updateEmbeddedDocuments(_, ups) { log.push(['updateItems', ups]); for (const u of ups) Object.assign(this.items.find(i => i.id === u._id) ?? {}, u) }
  async deleteEmbeddedDocuments(_, ids) {
    log.push(['deleteItems', ids])
    if (this.failDelete && ids.some(id => this.items.find(i => i.id === id)?.old)) throw new Error('delete failed')
    this.items = this.items.filter(i => !ids.includes(i.id))
  }
  async delete() { log.push(['delete', this.name]); world.splice(world.indexOf(this), 1) }
}

beforeEach(() => {
  log = [], world = [], n = 0, failCreateItems = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
  globalThis.game = { actors: world, folders: [], release: { generation: 13 } }
  globalThis.Folder = { create: async d => ({ id: 'f', ...d }) }
  globalThis.Actor = { create: async d => { log.push(['create', d]); return new FakeActor(d) } }
  globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2 } }
})

const ware = { name: 'Made-up Booster', type: 'gear', flags: flags({ id: 'w' }),
  effects: [{ name: 'Made-up Booster', transfer: true, disabled: false, changes: [{ key: 'system.attributes.rea.mod', value: '1', mode: 2 }] }] }
const player = (system = {}) => ({ actor: { name: 'Mara', type: 'Player', flags: flags({ id: 'r1' }), prototypeToken: { actorLink: true },
  system: { edge: { max: 3 }, karma: 5, ...system } }, items: [ware] })

test('create: actor first with Edge full, then its items with Foundry 13 effects', async () => {
  const res = await applyRunner(player(), 'create')
  expect(res.action).toBe('create')
  const [[c, created], [i, items]] = log
  expect([c, i]).toEqual(['create', 'items'])
  expect(created).toMatchObject({ name: 'Mara', folder: 'f', system: { edge: { max: 3, value: 3 } }, prototypeToken: { actorLink: true } })
  expect(created).not.toHaveProperty('items')
  expect(items[0].effects[0]).toEqual({ name: 'Made-up Booster', transfer: true, disabled: false,
    changes: [{ key: 'system.attributes.rea.mod', value: '1', mode: 2 }] })
})

test('effectData: Foundry 14 puts the changes in system.changes with a change type', () => {
  game.release.generation = 14
  expect(effectData(ware.effects[0])).toEqual({ name: 'Made-up Booster', transfer: true, disabled: false,
    system: { changes: [{ key: 'system.attributes.rea.mod', type: 'add', value: '1' }] } })
})

test('create: items failing deletes the new actor and reports', async () => {
  failCreateItems = true
  const res = await applyRunner(player(), 'create')
  expect(res).toMatchObject({ actor: null, action: 'failed' })
  expect(world).toEqual([])
})

test('new version: dated name; skip: nothing written', async () => {
  const res = await applyRunner(player(), 'new')
  expect(res.actor.name).toMatch(/^Mara \(\d{1,2} \w{3} 2026\)$/)
  log = []
  expect((await applyRunner(player(), 'skip')).action).toBe('skip')
  expect(log).toEqual([])
})

test('replace: update without play state, new items, then old flagged ones deleted; GM items kept', async () => {
  const doc = new FakeActor({ name: 'Mara', img: 'user/art.webp', flags: flags({ id: 'r1' }),
    items: [{ name: 'old', old: true, flags: flags({ id: 'w' }) }, { name: 'GM item', flags: {} }] })
  const res = await applyRunner(player(), 'replace')
  expect(res).toMatchObject({ actor: doc, action: 'replace' })
  const [[u, update], [i]] = log
  expect([u, i]).toEqual(['update', 'items'])
  expect(update.system.edge).toEqual({ max: 3 })  // no edge.value: Edge spent stays
  expect(update).not.toHaveProperty('img')        // the user's art stays
  expect(update).not.toHaveProperty('prototypeToken')
  expect(doc.items.map(x => x.name)).toEqual(['GM item', 'Made-up Booster'])
})

test('replace: Eden’s own Unarmed item (unflagged, genesisID unarmed) is kept once, never deleted or made again', async () => {
  const eden = { name: 'Unarmed', type: 'gear', flags: {}, system: { genesisID: 'unarmed', subtype: 'UNARMED' } }
  const doc = new FakeActor({ name: 'Mara', flags: flags({ id: 'r1' }), items: [eden, { name: 'old', old: true, flags: flags({ id: 'w' }) }] })
  const unarmedId = doc.items[0].id
  await applyRunner(player(), 'replace')
  expect(doc.items.filter(i => i.system?.genesisID === 'unarmed').map(i => i.id)).toEqual([unarmedId])
  expect(log.find(([k]) => k === 'items')[1].some(i => i.system?.genesisID === 'unarmed')).toBe(false)
})

test('replace: deleting the old items failing removes the new ones again', async () => {
  const doc = new FakeActor({ name: 'Mara', flags: flags({ id: 'r1' }), items: [{ name: 'old', old: true, flags: flags({ id: 'w' }) }] }, true)
  const res = await applyRunner(player(), 'replace')
  expect(res.action).toBe('failed')
  expect(doc.items.map(x => x.name)).toEqual(['old'])
  expect(world).toEqual([doc])
})

test('replace with nothing in the world fails without creating anything', async () => {
  const res = await applyRunner(player(), 'replace')
  expect(res.action).toBe('failed')
  expect(world).toEqual([])
})

// Eden adds its Unarmed on every client that sees the actor created, without waiting: two can land.
const unarmed = (t, f = {}) => ({ name: 'Unarmed', type: 'gear', flags: f, _stats: { createdTime: t }, system: { genesisID: 'unarmed' } })

test('dedupeUnarmed: keeps the oldest of Eden’s Unarmed items, deletes the rest, nothing else; idempotent', async () => {
  const doc = new FakeActor({ name: 'Mara', items: [unarmed(30), { name: 'GM fists', flags: {}, system: { genesisID: 'x' } },
    unarmed(10), unarmed(20, flags({ id: 'u' })), unarmed(40)] })
  const keep = doc.items[2].id
  expect(await dedupeUnarmed(doc)).toBe(2)
  expect(doc.items.filter(i => i.system.genesisID === 'unarmed' && !i.flags[MODULE_ID]).map(i => i.id)).toEqual([keep])
  expect(doc.items.map(i => i.name)).toEqual(['GM fists', 'Unarmed', 'Unarmed'])  // ours (flagged) stays too
  log = []
  expect(await dedupeUnarmed(doc)).toBe(0)
  expect(log).toEqual([])
})

test('dedupeUnarmed: a failing delete is logged, never thrown', async () => {
  const doc = new FakeActor({ name: 'Mara', items: [unarmed(1), unarmed(2)] })
  doc.deleteEmbeddedDocuments = async () => { throw new Error('nope') }
  expect(await dedupeUnarmed(doc)).toBe(0)
})

test('replace: one actor update, one item create, one item delete; a duplicate Unarmed is removed after', async () => {
  const doc = new FakeActor({ name: 'Mara', flags: flags({ id: 'r1' }),
    items: [unarmed(2), unarmed(1), { name: 'old', old: true, flags: flags({ id: 'w' }) }] })
  const [late, first] = doc.items.map(i => i.id)
  const res = await applyRunner(player(), 'replace')
  expect(res.action).toBe('replace')
  expect(log.map(([k]) => k)).toEqual(['update', 'items', 'deleteItems', 'deleteItems'])
  expect(log[3][1]).toEqual([late])
  expect(doc.items.filter(i => i.system?.genesisID === 'unarmed').map(i => i.id)).toEqual([first])
})

test('create: a duplicate Unarmed that landed during the import is removed', async () => {
  globalThis.Actor = { create: async d => new FakeActor({ ...d, items: [unarmed(1), unarmed(2)] }) }
  const res = await applyRunner(player(), 'create')
  expect(res.actor.items.filter(i => i.system?.genesisID === 'unarmed')).toHaveLength(1)
  expect(res.actor.items.map(i => i.name)).toEqual(['Unarmed', 'Made-up Booster'])
})

test('create: items get Foundry’s ids, then a fitted mod is pointed at its host’s; a catalog item links its entry by chummerID', async () => {
  const M = MODULE_ID, entry = (id, name, key, extra = {}) => ({ _id: id, uuid: `Compendium.world.sr6-mus-weapons.Item.${id}`, type: 'gear', name,
    flags: { [M]: { chummerID: key, chummerAliases: [], kind: 'weapons', page: 10 } }, ...extra })
  const index = new Map([['F7', entry('F7', 'Zapper', 'MUS:weapons:mus.pocket-zapper')]])
  game.packs = { filter: f => [{ documentName: 'Item', collection: 'world.sr6-mus-weapons', getIndex: async () => index, getUuid: id => id }].filter(f) }
  const gun = { name: 'Zapper', type: 'gear', flags: flags({ id: 'w1', catalogId: 'mus.pocket-zapper', chummerID: 'MUS:weapons:mus.pocket-zapper', kind: 'weapons', source: 'MUS' }), system: {} }
  const sight = { name: 'Sight', type: 'mod', flags: flags({ id: 'w1a', host: 'w1', catalogId: 'mus.made-up-sight', chummerID: 'MUS:gear:mus.made-up-sight', kind: 'gear', source: 'MUS' }), system: {} }
  const t = player(); t.items = [gun, sight]
  const res = await applyRunner(t, 'create')
  expect(res.action).toBe('create')
  const [, items] = log.find(([k]) => k === 'items')
  for (const i of items) expect(i).not.toHaveProperty('_id')  // Foundry picks the ids
  expect(items[0]._stats).toEqual({ compendiumSource: 'Compendium.world.sr6-mus-weapons.Item.F7' })
  expect(items[1]).not.toHaveProperty('_stats')  // nothing in the book's packs for it: no link
  const [, fits] = log.find(([k]) => k === 'updateItems')
  const made = res.actor.items
  expect(fits).toEqual([{ _id: made.find(i => i.name === 'Sight').id, 'system.embeddedInUuid': `Actor.${res.actor.id}.Item.${made.find(i => i.name === 'Zapper').id}` }])
})

test('create: two book entries tie for a runner’s item: no link, the report lists them', async () => {
  const M = MODULE_ID, e = (id, page) => [id, { _id: id, uuid: `U-${id}`, type: 'gear', name: 'Rope', flags: { [M]: { kind: 'gear', page } } }]
  const index = new Map([e('A', 12), e('B', 12)])
  game.packs = { filter: f => [{ documentName: 'Item', collection: 'world.sr6-mus-gear', getIndex: async () => index }].filter(f) }
  const rope = { name: 'Rope', type: 'gear', flags: flags({ id: 'g1', catalogId: 'mus.rope', chummerID: 'MUS:gear:mus.rope', kind: 'gear', page: 10, source: 'MUS' }), system: {} }
  const t = player(); t.items = [rope]
  const res = await applyRunner(t, 'create')
  expect(res.notes).toEqual(['Rope: 2 compendium entries match (Rope [gear] p.12, Rope [gear] p.12) → not linked'])
  expect(log.find(([k]) => k === 'items')[1][0]).not.toHaveProperty('_stats')
})

test('replace: our item kept in place (same id, play state and other flags kept), only our effects swapped, a user’s effect kept', async () => {
  const ours = { name: 'Booster', flags: { [MODULE_ID]: { chummer: true } } }, user = { name: 'GM buff', flags: {} }
  const old = { name: 'Booster', type: 'gear', flags: { ...flags({ id: 'w' }), other: { kept: 1 } }, system: { ammocount: 3 }, effects: [ours, user] }
  const doc = new FakeActor({ name: 'Mara', type: 'Player', flags: flags({ id: 'r1' }), items: [old] })
  const id = doc.items[0].id
  const fresh = { name: 'Booster II', type: 'gear', flags: flags({ id: 'w' }), system: { rating: 2 },
    effects: [{ name: 'Booster II', transfer: true, flags: { [MODULE_ID]: { chummer: true } } }] }
  const res = await applyRunner({ actor: player().actor, items: [fresh] }, 'replace')
  expect(res.action).toBe('replace')
  const item = doc.items.get(id)
  expect(item).toMatchObject({ name: 'Booster II', flags: { other: { kept: 1 } } })
  expect(log.find(([k]) => k === 'updateItems')[1][0]).toMatchObject({ _id: id, system: { rating: 2 } })  // merged: play state stays
  expect(item.effects.map(e => e.name)).toEqual(['GM buff', 'Booster II'])
  expect(log.filter(([k]) => k === 'deleteItems')).toEqual([])  // nothing of ours dropped, nothing re-created
})

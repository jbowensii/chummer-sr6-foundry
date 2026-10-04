// applyRunner (scripts/foundry/apply.js) against a tiny fake of the Foundry globals it uses: create order, effect shape,
// Replace order and rollback. The real thing runs in Foundry's Quench batches (scripts/foundry/quench.js).
import { beforeEach, expect, test, vi } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { applyRunner, dedupeUnarmed, effectData } from '../scripts/foundry/apply.js'

let log, world, n, failCreateItems
const flags = f => ({ [MODULE_ID]: { exportedAt: '2026-10-04T09:00:00.000Z', ...f } })
class FakeActor {
  constructor(data, failDelete = false) {
    Object.assign(this, { id: `a${++n}`, system: {}, ...data, failDelete })
    this.items = (data.items ?? []).map(i => ({ ...i, id: `i${++n}` }))
    world.push(this)
  }
  async update(u) { log.push(['update', u]); Object.assign(this.system, u.system ?? {}) }
  async createEmbeddedDocuments(_, arr) {
    log.push(['items', arr])
    if (failCreateItems) throw new Error('items failed')
    const made = arr.map(i => ({ ...i, id: `i${++n}` })); this.items.push(...made); return made
  }
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

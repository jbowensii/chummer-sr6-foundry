// Import decisions (scripts/lib/plan.js), ported from the Anarchy module's tests, plus Eden's play state.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateRunner } from '../scripts/lib/translate.js'
import { defaultChoice, fitUpdates, keepArt, keepItemArt, mergeActorItems, newVersionName, replaceUpdate, tokenUpdate } from '../scripts/lib/plan.js'

const file = JSON.parse(readFileSync('samples/test-runners.json', 'utf8'))
const OPTS = { exportedAt: file.exportedAt, appVersion: file.app.version }
const t = translateRunner(file.runners[0], OPTS)
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${p}${k}.`) : [`${p}${k}`])
const M = 'modules/chummer-sr6-importer/'

describe('planning an import', () => {
  test('default choice', () => {
    const at = '2026-10-02T09:15:00.000Z'
    expect(defaultChoice(null, { exportedAt: at })).toBe('create')
    expect(defaultChoice({ exportedAt: '2026-10-03T00:00:00.000Z' }, { exportedAt: at })).toBe('skip')
    expect(defaultChoice({ exportedAt: at }, { exportedAt: at })).toBe('replace')
    expect(defaultChoice({ exportedAt: '2026-10-01T00:00:00.000Z' }, { exportedAt: at })).toBe('replace')
  })

  test('new version name', () => {
    // built from local noon, so the local date is the same in every timezone
    expect(newVersionName('Made-Up Mara', new Date(2026, 9, 2, 12).toISOString())).toBe('Made-Up Mara (2 Oct 2026)')
    expect(newVersionName('X', new Date(2026, 8, 30, 12).toISOString())).toBe('X (30 Sep 2026)')
  })

  test('replace update: Chummer data in, Eden play state out', () => {
    const u = replaceUpdate({ ...t.actor, img: 'worlds/w/chummer/portraits/p.png' })
    const keys = flat(u)
    expect(keys).toContain('system.attributes.agi.base')
    expect(keys).toContain('system.edge.max')
    expect(keys).toContain('system.skills.stealth.points')  // a dropped skill goes to 0
    expect(keys).toContain('system.karma')
    expect(keys).toContain('img')
    expect(u.flags[MODULE_ID].id).toBe('run-mara-1')
    expect(keys).toContain('system.physical.mod')  // the extra boxes are Chummer's; damage is play state
    for (const bad of ['system.edge.value', 'system.physical.dmg', 'system.physical.value', 'system.stun.dmg', 'system.stun.value', 'system.overflow', 'system.heat', 'system.reputation',
      'system.matrixIni', 'system.persona', 'prototypeToken', 'ownership', 'items', 'type'])
      expect(keys.some(k => k.startsWith(bad)), bad).toBe(false)
  })

  test('play state is dropped even if a translation carried it', () => {
    const a = structuredClone(t.actor)
    Object.assign(a.system, { physical: { mod: 1, value: 3, dmg: 2 }, stun: { mod: 0, value: 1 }, heat: 2, reputation: 1, matrixIni: 'vrhot', persona: {} })
    a.system.edge.value = 1
    const u = replaceUpdate(a)
    expect(u.system.edge).toEqual({ max: 3 })
    expect(u.system.physical).toEqual({ mod: 1 })
    expect(u.system.stun).toEqual({ mod: 0 })
    for (const k of ['heat', 'reputation', 'matrixIni', 'persona']) expect(u.system).not.toHaveProperty(k)
  })

  test('an NPC replace update: rating and GM notes in, token settings out', () => {
    const n = translateRunner(file.runners[1], OPTS)
    const keys = flat(replaceUpdate(n.actor))
    expect(keys).toEqual(expect.arrayContaining(['system.rating', 'system.notes', 'flags.chummer-sr6-importer.npc.kind']))
    expect(keys.some(k => k.startsWith('prototypeToken'))).toBe(false)
  })

  test('the token image follows a new portrait only while it shows the actor image', () => {
    const doc = src => ({ img: 'worlds/w/chummer/portraits/old.png', prototypeToken: { texture: { src } } })
    expect(tokenUpdate(doc('worlds/w/chummer/portraits/old.png'), 'new.png')).toEqual({ 'prototypeToken.texture.src': 'new.png' })
    expect(tokenUpdate(doc('gm-token.webp'), 'new.png')).toEqual({})
    expect(tokenUpdate(doc('worlds/w/chummer/portraits/old.png'), undefined)).toEqual({})
  })

  test('replace update without a portrait leaves the image alone', () => {
    expect(flat(replaceUpdate(t.actor))).not.toContain('img')
  })

  test('replace update keeps a new-version name, otherwise uses the street name', () => {
    expect(replaceUpdate(t.actor, 'Made-Up Mara (2 Oct 2026)').name).toBe('Made-Up Mara (2 Oct 2026)')
    expect(replaceUpdate(t.actor, 'Mara renamed').name).toBe('Made-Up Mara')
    expect(replaceUpdate(t.actor, 'Mara (2 Octo 2026)').name).toBe('Made-Up Mara')
  })

  test('the image: an Eden stock image is replaced, a user path is not', () => {
    const a = { ...t.actor, img: 'worlds/w/chummer/portraits/r.png' }
    expect(replaceUpdate(a, 'x', 'systems/shadowrun6-eden/icons/x.svg').img).toBe(a.img)
    expect(replaceUpdate(a, 'x', 'my-art/x.png').img).toBeUndefined()
  })

  test('replace update does not share objects with the translation', () => {
    const u = replaceUpdate(t.actor)
    u.system.attributes.str.base = 99
    expect(t.actor.system.attributes.str.base).not.toBe(99)
  })
})

describe('merging a pack actor', () => {
  test('mergeActorItems rebuilds flagged items and keeps the GM’s unflagged ones after them', () => {
    const gm = { _id: 'gm', name: 'GM item', flags: {} }, old = { _id: 'o', flags: { [MODULE_ID]: { id: 'x' } } }
    const fresh = { name: 'New', flags: { [MODULE_ID]: { id: 'x' } } }
    expect(mergeActorItems([old, gm], [fresh])).toEqual([fresh, gm])
    expect(mergeActorItems(undefined, [fresh])).toEqual([fresh])
  })
})

describe('re-import never overwrites art the user chose', () => {
  const it = (id, img) => ({ name: id, img, flags: { [MODULE_ID]: { id } } })
  test('keepItemArt: rebuilt items keep a chosen image, by flag id', () => {
    const old = [it('a', 'worlds/test/custom.webp'), it('b', M + 'icons/defaults/armor.webp'), it('c', 'systems/shadowrun6-eden/icons/x.svg'),
      { name: 'gm', img: 'worlds/x.webp', flags: {} }]
    const fresh = [it('a', M + 'icons/defaults/weapon.webp'), it('b', M + 'icons/items/vest.webp'), it('c', M + 'icons/defaults/gear.webp'), it('d', undefined)]
    expect(keepItemArt(old, fresh).map(i => i.img)).toEqual(['worlds/test/custom.webp', M + 'icons/items/vest.webp', M + 'icons/defaults/gear.webp', undefined])
    expect(keepItemArt(undefined, fresh)).toEqual(fresh)
  })
  test('keepArt: a replaced pack entry, its token and its items keep chosen images', () => {
    const old = { _id: 'p', img: 'worlds/test/custom.webp', prototypeToken: { texture: { src: 'worlds/w/gm-token.webp' } }, items: [it('a', 'worlds/test/a.webp')] }
    const fresh = { _id: 'p', img: M + 'icons/defaults/npc.webp', prototypeToken: { actorLink: false }, items: [it('a', M + 'icons/defaults/gear.webp')] }
    const k = keepArt(old, fresh)
    expect(k.img).toBe('worlds/test/custom.webp')
    expect(k.prototypeToken).toEqual({ actorLink: false, texture: { src: 'worlds/w/gm-token.webp' } })
    expect(k.items[0].img).toBe('worlds/test/a.webp')
    expect(keepArt({ img: 'icons/svg/item-bag.svg' }, { img: 'new.webp' }).img).toBe('new.webp')
    expect(keepArt({ pages: [] }, { name: 'J', pages: [] })).toEqual({ name: 'J', pages: [] })
  })
})

describe('fitting items to their hosts', () => {
  const made = (id, uid, host) => ({ id, flags: { [MODULE_ID]: { id: uid, ...host ? { host } : {} } } })
  test('once Foundry has given the items ids: a fitted item gets its host’s, the rest nothing', () => {
    const items = [made('F1', 'w1'), made('F2', 'w1a', 'w1'), made('F3', 'w1b', 'w1'), made('F4', 'g1'), made('F5', 'x', 'gone')]
    expect(fitUpdates(items, 'ACTOR')).toEqual([{ _id: 'F2', 'system.embeddedInUuid': 'Actor.ACTOR.Item.F1' },
      { _id: 'F3', 'system.embeddedInUuid': 'Actor.ACTOR.Item.F1' }])  // a host not on the actor: the item stays loose
  })
})

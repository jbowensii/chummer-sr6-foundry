// Every effect of a full catalog through the real translate path (lib/books.js translateBook -> lib/translate.js): where each
// one goes, that every change names a real Eden field with a value Eden can add, that nothing meant for others lands on the
// owner, that an item's attack bonus never lands on the actor's skills, and that nothing is silently dropped.
// The catalog: test/fixtures/catalog-effects.json, the effect-carrying entries of a Nova Prime Chummer books export with the
// book's words taken out (tools/catalog-fixture.mjs). Eden's fields: test/fixtures/eden-effect-keys.json (keys only, from
// shadowrun6-eden 4.0.11's config.js ACTIVE_EFFECT_OPTIONS and template.json) and the three this module adds.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { effectRoute, weaponBorne } from '../scripts/lib/eden.js'
import { translateBook } from '../scripts/lib/books.js'

const M = 'chummer-sr6-importer'
const fixture = JSON.parse(readFileSync('test/fixtures/catalog-effects.json', 'utf8'))
const edenKeys = JSON.parse(readFileSync('test/fixtures/eden-effect-keys.json', 'utf8'))
// what the module itself adds: traits Eden's prepare creates (traits.* is a plain object on the actor) and the token's vision mode
const OURS = ['traits.unarmedDv', 'traits.unarmedPhysical', 'token.sight.visionMode']
const KNOWN = new Set([...edenKeys.options, ...edenKeys.template, ...OURS])
const entries = fixture.books.flatMap(b => b.entries)
const effects = entries.flatMap(e => (e.effects ?? []).map(fx => ({ e, fx })))

const audit = new Map(), docs = []
for (const book of fixture.books) {
  const t = translateBook(book, { audit, exportedAt: '2026-10-18T00:00:00.000Z', appVersion: 'test', descriptions: false, entries })
  docs.push(...Object.values(t.packs).flat())
}
const changes = docs.flatMap(d => (d.effects ?? []).flatMap(fx => fx.changes.map(c => ({ doc: d, fx, c }))))
const outcome = fx => audit.get(fx)?.out

describe('the whole catalog through translate', () => {
  test('every effect has an outcome: a change on the actor, the item or its host, the targets, or a described line; none is dropped', () => {
    const lost = effects.filter(({ fx }) => !audit.has(fx)).map(({ e, fx }) => `${e.kind}:${e.id} ${fx.target} ${fx.op}`)
    expect(lost).toEqual([])
    const counts = {}
    for (const { fx } of effects) counts[outcome(fx)] = (counts[outcome(fx)] ?? 0) + 1
    // pinned: a change here means the routing changed (update it on purpose)
    expect(counts).toMatchInlineSnapshot(`
      {
        "actor": 1108,
        "covered": 6,
        "host": 57,
        "item": 20,
        "note": 1918,
        "target": 14,
      }
    `)
    expect(effects.length).toBe(Object.values(counts).reduce((t, n) => t + n, 0))
  })
  test('no effect has a target the module has no rule for', () => {
    expect(effects.filter(({ fx }) => effectRoute(fx) === 'unknown').map(({ fx }) => `${fx.target} ${fx.op}`)).toEqual([])
  })
  test('every change names a real Eden field (or one this module adds), never a mode flag', () => {
    expect(changes.length).toBeGreaterThan(1000)
    expect([...new Set(changes.map(({ c }) => c.key).filter(k => !KNOWN.has(k)))]).toEqual([])
    expect([...new Set(changes.map(({ c }) => c.key).filter(k => /^system\.modes\.(?:SA|BF|FA|SS)$/.test(k)))]).toEqual([])
  })
  test('every value is a finite number, or one of the few Eden reads another way', () => {
    const odd = changes.filter(({ c }) => !(typeof c.value === 'number' && Number.isFinite(c.value)))
    // a boolean override of a flag, the vision mode, a rating Eden reads from the item
    const allowed = ({ c }) => (c.value === true && ['system.wild', 'traits.unarmedPhysical'].includes(c.key)) || (c.value === 'lightAmplification' && c.key === 'token.sight.visionMode')
      || c.value === '@item.system.rating'
    expect(odd.filter(x => !allowed(x)).map(({ c }) => `${c.key}=${JSON.stringify(c.value)}`)).toEqual([])
    expect(new Set(odd.map(({ c }) => c.key))).toEqual(new Set(['system.wild', 'traits.unarmedPhysical', 'token.sight.visionMode', ...odd.filter(({ c }) => c.value === '@item.system.rating').map(({ c }) => c.key)]))
  })
  test('nothing meant for others or a target lands on the owner or the host; a target effect waits disabled on its own item, flagged for the targets', () => {
    const foreign = effects.filter(({ fx }) => fx.affects === 'others' || fx.affects === 'target')
    expect(foreign.length).toBeGreaterThan(100)
    expect(foreign.filter(({ fx }) => !['note', 'target'].includes(outcome(fx))).map(({ e, fx }) => `${e.kind}:${e.id} ${fx.target}`)).toEqual([])
    expect([...new Set(foreign.filter(({ fx }) => outcome(fx) === 'target').map(({ e }) => e.kind))].sort()).toEqual(['complexforms', 'spells'])
    const flagged = docs.flatMap(d => (d.effects ?? []).filter(fx => fx.flags[M].forTargets))
    expect(flagged.length).toBeGreaterThan(5)
    expect(flagged.filter(fx => fx.transfer !== false || fx.disabled !== true)).toEqual([])
    // and no transferred effect is flagged for targets, no flagged one is on a mod
    expect(docs.filter(d => d.type === 'mod').flatMap(d => d.effects ?? []).filter(fx => fx.flags[M].forTargets)).toEqual([])
  })
  test('an attack bonus or a wild die a weapon carries is never the actor’s skill', () => {
    const borne = effects.filter(({ e, fx }) => ['weapons', 'ammotypes'].includes(e.kind) && weaponBorne(fx))
    expect(borne.length).toBeGreaterThan(10)
    expect(borne.filter(({ fx }) => outcome(fx) === 'actor').map(({ e, fx }) => `${e.kind}:${e.id} ${fx.target} ${fx.op}`)).toEqual([])
    // the weapons that carry them hold them as changes on themselves: a dice pool modifier or the wild flag
    const keys = new Set(docs.filter(d => d.type === 'gear' && /^WEAPON/.test(d.system?.type)).flatMap(d => (d.effects ?? []).filter(fx => !fx.transfer).flatMap(fx => fx.changes.map(c => c.key))))
    expect(keys.has('system.modes.dicePoolMod') && keys.has('system.wild')).toBe(true)
    // a weapon's transferred effects never touch a combat skill modifier for an attack bonus it carries
    for (const d of docs.filter(d => d.type === 'gear' && /^WEAPON/.test(d.system?.type)))
      expect((d.effects ?? []).filter(fx => fx.transfer).flatMap(fx => fx.changes.map(c => c.key)).filter(k => /^system\.skills\.(?:firearms|close_combat|exotic_weapons)\.modifier$/.test(k)), d.name).toEqual([])
  })
  test('armor, drain and fading, movement, unarmed, vision: where the owner decided they go', () => {
    const used = new Set(changes.map(({ c }) => c.key))
    for (const k of ['system.defensepool.drain.mod', 'traits.movementRate', 'traits.movementSprintBase', 'traits.movementSprintMultiplier',
      'system.attackrating.physical.mod', 'traits.unarmedDv', 'traits.unarmedPhysical', 'token.sight.visionMode', 'system.persona.used.f', 'system.modes.dicePoolMod',
      'system.wild', 'system.modes.SA_ar_mod', 'system.attackRating.1']) expect(used.has(k), k).toBe(true)
  })
})

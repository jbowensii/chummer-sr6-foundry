// npc-combat-items: an NPC's or critter's stat block things (the export's npc.items, Chummer's npc.ts npcThings) as the
// items its Eden sheet rolls (owner 2026-10-20: weapons, attacks, armor, gear and powers on the actor so it can fight).
// samples/test-npc-combat-items.json was written by Chummer's own exporter from its invented test catalog: a grunt with a
// catalog gun, its accessory, a built club, armor, gear and an adept power; a critter with natural attacks and powers; a
// spirit at Force 4. Eden's sheet lists gear whose type starts WEAPON_ (helper.js itemsOfWeapontype) and rolls it with
// WeaponRoll: the pool from the item's skill (actor.js rollItem), the AR from calculatedAttackRating (which adds Strength
// to a close combat item's close band, item.mjs), the damage from dmg and stun.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import { MODULE_ID as M } from '../scripts/lib/constants.js'
import { translateBook } from '../scripts/lib/books.js'
import { translateRunner } from '../scripts/lib/translate.js'
import { npcLineItems } from '../scripts/foundry/apply.js'

const file = JSON.parse(readFileSync('samples/test-npc-combat-items.json', 'utf8'))
const OPTS = { exportedAt: file.exportedAt, appVersion: file.app.version }
const [guardR, houndR, gustR] = file.runners
const named = (items, name) => items.filter(i => i.name === name)
const one = (items, name) => { const l = named(items, name); expect(l, name).toHaveLength(1); return l[0] }
const weapons = items => items.filter(i => i.type === 'gear' && /^WEAPON_/.test(i.system.type))
// Eden's calculatedAttackRating, close band: the item's plus the actor's Strength for a close combat item
const edenAr = (item, str) => [item.system.attackRating[0] + (item.system.skill === 'close_combat' ? str : 0), ...item.system.attackRating.slice(1)]

describe('npc-combat-items: a grunt', () => {
  const t = translateRunner(guardR, OPTS)
  test('its catalog gun is an Eden weapon with the stat block’s DV, AR, mode and ammo; its accessory fitted to it', () => {
    const gun = one(t.items, 'Zap Gun')
    expect(gun.system).toMatchObject({ dmg: 4, stun: false, dmgDef: '4P', attackRating: [10, 8, 0, 0, 0], modes: { SA: true, SS: false }, ammocap: 8 })
    expect(gun.system.type).toMatch(/^WEAPON_/)
    expect(gun.system.skill).toBeTruthy()
    expect(gun.flags[M]).toMatchObject({ id: expect.stringMatching(/^line:weapons:Zap Gun \[/), catalogId: 'crb.zap-gun', chummerID: 'CRB:weapons:crb.zap-gun',
      npcLine: expect.stringContaining('Zap Gun [') })
    expect(one(t.items, 'Zap Scope')).toMatchObject({ type: 'mod', flags: { [M]: { host: gun.flags[M].id } } })
  })
  test('a club built from its line rolls Close Combat at the printed AR (Eden adds Strength 3 back)', () => {
    const stick = one(t.items, 'Made-up Stick')
    expect(stick.system).toMatchObject({ type: 'WEAPON_CLOSE_COMBAT', subtype: 'CLUBS', skill: 'close_combat', dmg: 3, stun: true, dmgDef: '3S' })
    expect(edenAr(stick, 3)).toEqual([7, 0, 0, 0, 0])
    expect(stick.system.description).toContain('Stat block: Made-up Stick [Club, DV 3S, 7/—/—/—/—]')
  })
  test('its armor is worn (Eden’s Defense Rating counts it), its gear is gear, its adept power an adept power at its level', () => {
    expect(one(t.items, 'Padded Vest').system).toMatchObject({ type: 'ARMOR', defense: 3, usedForPool: true })
    expect(one(t.items, 'Made-up credstick').type).toBe('gear')
    expect(one(t.items, 'Quick Step 2')).toMatchObject({ type: 'adeptpower', system: { level: 2 } })
    expect(t.items.filter(i => i.type === 'critterpower')).toEqual([])
  })
  test('the runner-file path finds nothing more in the world’s compendiums (no duplicates); the lines stay in the notes', async () => {
    expect(await npcLineItems(t)).toEqual({ items: [], notes: [] })
    expect(t.actor.system.notes).toContain('Zap Gun [Zapper, DV 4P')
  })
})

describe('npc-combat-items: a critter', () => {
  const t = translateRunner(houndR, OPTS)
  test('a Critter whose natural attacks are weapons: close combat at the printed AR, a ranged one with Exotic Weapons', () => {
    expect(t.actor.type).toBe('Critter')
    expect(weapons(t.items).map(i => [i.name, i.system.type, i.system.skill, i.system.dmg, i.system.stun, edenAr(i, 6)])).toEqual([
      ['Bite', 'WEAPON_CLOSE_COMBAT', 'close_combat', 4, false, [9, 0, 0, 0, 0]],
      ['Tail Lash', 'WEAPON_CLOSE_COMBAT', 'close_combat', 2, true, [9, 0, 0, 0, 0]],
      ['Spit', 'WEAPON_SPECIAL', 'exotic_weapons', 2, false, [6, 5, 2, 0, 0]],
    ])
    // the pool is Eden's skill pool: the stat block's skill ranks are on the actor
    expect(t.actor.system.skills).toMatchObject({ close_combat: { points: 5 }, exotic_weapons: { points: 3 } })
    // Eden's own pool field stays 0, so rollItem works it out from the skill (a Critter prepares no item pools)
    for (const w of weapons(t.items)) expect(w.system.pool ?? 0).toBe(0)
  })
  test('its powers are critter powers under their printed names, the catalog’s fields where it has the power; an optional one says so', () => {
    expect(t.items.filter(i => i.type === 'critterpower').map(i => i.name)).toEqual(['Glimmer', 'Made-up Hide (2)', 'Made-up Howl'])
    expect(one(t.items, 'Glimmer').flags[M]).toMatchObject({ id: 'power:Glimmer', catalogId: 'crb.glimmer' })
    expect(one(t.items, 'Made-up Howl').system.description).toContain('Optional power.')
  })
  test('as a book’s critter its compendium actor has the same items, once each', () => {
    const entry = { id: 'crb.made-up-hound', kind: 'critters', name: 'Made-up Hound', source: 'CRB', page: 10, canon: false, attrs: {}, parts: [], values: {}, npc: houndR.npc }
    const b = translateBook({ source: { id: 'CRB', name: 'Made-up Core', publisher: 'x', canon: false }, entries: [entry] }, OPTS)
    const actor = b.packs.critters[0]
    expect(weapons(actor.items).map(i => i.name)).toEqual(['Bite', 'Tail Lash', 'Spit'])
    expect(actor.items.filter(i => i.type === 'critterpower')).toHaveLength(3)
  })
  test('as a runner’s owned critter (a Critter actor of its own) it has them too', () => {
    const runner = JSON.parse(readFileSync('samples/test-runners.json', 'utf8')).runners[0]
    runner.purchases.find(p => p.kind === 'critters').npc = houndR.npc
    const owned = translateRunner(runner, OPTS).critters[0]
    expect(weapons(owned.items).map(i => i.name)).toEqual(['Bite', 'Tail Lash', 'Spit'])
  })
})

test('npc-combat-items: the sample is a valid export (the schema’s npc.items)', () => {
  const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/sr6-export.schema.json', 'utf8')))
  expect(check(file), JSON.stringify(check.errors)).toBe(true)
  expect(file.runners.every(r => r.npc.items.length)).toBe(true)
})

test('npc-combat-items: a spirit’s attack worked out at its Force', () => {
  const t = translateRunner(gustR, OPTS)
  expect(one(t.items, 'Gust').system).toMatchObject({ type: 'WEAPON_SPECIAL', skill: 'exotic_weapons', dmg: 4, stun: false, attackRating: [8, 6, 0, 0, 0], dmgDef: '(F)P' })
})

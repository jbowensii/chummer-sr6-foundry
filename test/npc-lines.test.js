// An NPC's gear and weapon lines -> compendium items (scripts/lib/npc-lines.js, lib/books.js, foundry/apply.js npcLineItems).
// Invented names and books only.
import { readFileSync } from 'node:fs'
import { beforeEach, expect, test } from 'vitest'
import { MODULE_ID as M } from '../scripts/lib/constants.js'
import { translateBook } from '../scripts/lib/books.js'
import { matchThing, npcThings, overrideStats, parseThing, thingTie } from '../scripts/lib/npc-lines.js'
import { npcLineItems } from '../scripts/foundry/apply.js'

const books = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
const [mus] = books.books
const OPTS = { exportedAt: books.exportedAt, appVersion: '0.9.0', descriptions: true }

test('parseThing: name, bracketed stats, "w/" accessories', () => {
  expect(parseThing('Pocket Zapper [Taser, DV 4S, AR 8/6/—/—/—, SA/BF, 6(m), w/ Made-up Sight and Glitter Rope]')).toEqual({
    name: 'Pocket Zapper', printed: 'Pocket Zapper [Taser, DV 4S, AR 8/6/—/—/—, SA/BF, 6(m), w/ Made-up Sight and Glitter Rope]',
    stats: { dv: 4, stun: true, dvText: '4S', ar: [8, 6, 0, 0, 0], modes: ['SA', 'BF'], ammo: 6 }, accessories: ['Made-up Sight', 'Glitter Rope'] })
  expect(parseThing('Test Link (R3)')).toMatchObject({ name: 'Test Link', stats: { rating: 3 }, accessories: [] })
  expect(parseThing('Glitter Rope')).toMatchObject({ name: 'Glitter Rope', stats: {} })
  expect(npcThings({ lines: [{ part: 'weapons', text: 'A [DV 2P], B' }, { part: 'skills', text: 'Firearms 4' }] }).map(t => [t.part, t.name]))
    .toEqual([['weapons', 'A'], ['weapons', 'B']])
})

test('matchThing: by name in the kinds the line names; the first kind, then the NPC’s page, break a tie; still tied: candidates', () => {
  const e = (name, kind, page = 10) => ({ name, kind, page })
  expect(matchThing('rope', [e('Rope', 'gear'), e('Rope', 'electronics')], ['gear', 'electronics'], 10).entry.kind).toBe('gear')
  expect(matchThing('Rope', [e('Rope', 'gear', 12), e('Rope', 'gear', 10)], ['gear'], 10).entry.page).toBe(10)
  const tie = matchThing('Rope', [e('Rope', 'gear', 12), e('Rope', 'gear', 14)], ['gear'], 10)
  expect(tie.candidates).toHaveLength(2)
  expect(thingTie({ printed: 'Rope' }, tie.candidates)).toBe('Rope: 2 compendium entries match (Rope [gear] p.12, Rope [gear] p.14) → notes')
  expect(matchThing('Rope', [e('Rope', 'weapons')], ['gear'], 10)).toBe(null)
})

test('overrideStats: the stat block’s values over the entry’s', () => {
  expect(overrideStats({ dmg: 3, stun: true, dmgDef: '3S', rating: 0, ammocap: 4 }, { dv: 5, stun: false, dvText: '5P', rating: 2, ammo: 10 }))
    .toEqual({ dmg: 5, stun: false, dmgDef: '5P', rating: 2, needsRating: true, ammocap: 10 })
})

test('a book being’s lines: the book’s real items, the stat block’s values kept, its accessory with it; unmatched stays text', () => {
  const ganger = mus.entries.find(e => e.kind === 'npcs')
  const b = structuredClone(mus)
  b.entries.find(e => e.id === ganger.id).npc.lines = [{ part: 'weapons', text: 'Pocket Zapper [Taser, DV 5S, w/ Made-up Sight], Made-up Nothing' },
    { part: 'gear', text: 'Glitter Rope, Test Link (R4)' }]
  const t = translateBook(b, OPTS), actor = t.packs.npcs[0]
  const byName = n => actor.items.find(i => i.name === n)
  expect(byName('Pocket Zapper')).toMatchObject({ type: 'gear', system: { dmg: 5, stun: true, dmgDef: '5S', type: 'WEAPON_FIREARMS' },
    flags: { [M]: { id: 'line:weapons:Pocket Zapper [Taser, DV 5S, w/ Made-up Sight]', chummerID: 'MUS:weapons:mus.pocket-zapper' } } })
  expect(byName('Made-up Sight')).toMatchObject({ type: 'mod', flags: { [M]: { host: 'line:weapons:Pocket Zapper [Taser, DV 5S, w/ Made-up Sight]' } } })
  expect(byName('Made-up Sight').effects).toHaveLength(1)  // the accessory’s own Active Effect comes with it
  expect(byName('Test Link').system).toMatchObject({ rating: 4, subtype: 'COMMLINK' })
  expect(byName('Glitter Rope').system.type).toBe('SURVIVAL')
  expect(byName('Made-up Nothing')).toBeUndefined()
  expect(actor.system.notes).toContain('Made-up Nothing')  // the printed block stays in the notes
})

let fetched
beforeEach(() => { fetched = [] })

test('a runners-file NPC: its lines from its book’s compendiums in this world, linked, the stat block’s values kept', async () => {
  const entry = (id, name, kind, system, source = 'MUS') => ({ _id: id, uuid: `U-${id}`, type: 'gear', name, flags: { [M]: { chummerID: `${source}:${kind}:x-${id}`, kind, page: 10, source } }, system })
  const index = new Map([['Z', entry('Z', 'Pocket Zapper', 'weapons', { dmg: 3 })], ['Z2', entry('Z2', 'Pocket Zapper', 'weapons', { dmg: 9 }, 'FS')],
    ['R1', entry('R1', 'Rope', 'gear', {})], ['R2', entry('R2', 'Rope', 'gear', {})]])
  // the merged type packs only (another book's Zapper loses to the NPC's own book's); 0.3's per-book pack is never read
  globalThis.game = { packs: { filter: f => [{ documentName: 'Item', collection: 'world.chummer-sr6-weapons', getIndex: async () => index },
    { documentName: 'Item', collection: 'world.sr6-mus-weapons', getIndex: async () => { throw new Error('read an old pack') } }].filter(f) } }
  globalThis.fromUuid = async uuid => { fetched.push(uuid); const e = [...index.values()].find(x => x.uuid === uuid); return { toObject: () => structuredClone({ ...e, folder: 'f', sort: 1, ownership: {} }) } }
  const t = { npc: { from: { source: 'MUS', page: 10 }, lines: [{ part: 'weapons', text: 'Pocket Zapper [DV 6P]' }, { part: 'gear', text: 'Rope, Unknown Thing' }] } }
  const r = await npcLineItems(t)
  expect(r.items).toHaveLength(1)
  expect(r.items[0]).toMatchObject({ name: 'Pocket Zapper', system: { dmg: 6, stun: false }, _stats: { compendiumSource: 'U-Z' },
    flags: { [M]: { id: 'line:weapons:Pocket Zapper [DV 6P]', npcLine: 'Pocket Zapper [DV 6P]' } } })
  expect(r.items[0]).not.toHaveProperty('_id')
  expect(r.items[0]).not.toHaveProperty('folder')
  expect(r.notes).toEqual(['Rope: 2 compendium entries match (Rope [gear] MUS p.10, Rope [gear] MUS p.10) → notes'])
  expect(await npcLineItems({ npc: { from: null, lines: t.npc.lines } })).toEqual({ items: [], notes: [] })  // no book: none
})

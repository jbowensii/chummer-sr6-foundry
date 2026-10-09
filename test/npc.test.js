// SR6 NPCs, critters, spirits and sprites (scripts/lib/translate.js beingActor/translateNpc) on hand-made NPC blocks.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { SKILLS } from '../scripts/lib/eden.js'
import { beingActor, npcHeadline, splitTop, translateRunner } from '../scripts/lib/translate.js'

const M = 'chummer-sr6-importer'
const file = JSON.parse(readFileSync('samples/test-runners.json', 'utf8'))
const OPTS = { exportedAt: '2026-10-04T09:00:00.000Z', appVersion: '0.9.0' }
const flags = id => ({ [M]: { id, ...OPTS } })
const st = (key, printed, value = printed, ok = true) => ({ key, label: key.toUpperCase(), printed, value, ok })
const npc = (r, block) => translateRunner({ ...structuredClone(file.runners[1]), ...r, npc: block }, OPTS)
const grunt = () => ({ kind: 'grunt', rating: 3, group: 'Made-up Crew',
  from: { kind: 'npcs', id: 'x.thug', name: 'Made-up Thug', source: 'XYZ', page: 12 },
  stats: [st('bod', '4'), st('agi', '3'), st('rea', '2D6'), st('edg', '2'), st('dr', '2D6')],
  lines: [{ part: 'skills', text: 'Firearms 4, Basket Weaving 3' }, { part: 'weapons', text: 'Made-up Zapper [Pistol, DV 2S]' }],
  pools: [{ name: 'Firearms', rating: 4, attr: 'agi', pool: 7, printed: 'Firearms 4' }, { name: 'Basket Weaving', rating: 3, printed: 'Basket Weaving 3' }] })

describe('a grunt', () => {
  const t = npc({ id: 'n-thug', streetName: 'Made-up Thug', background: 'Invented.' }, grunt())
  const s = t.actor.system
  test('NPC type npc at its Professional Rating, group, mundane', () => {
    expect(t.actor.type).toBe('NPC')
    expect(s).toMatchObject({ type: 'npc', rating: 3, gruntmeta: 'Made-up Crew', mortype: 'mundane', metatype: 'Human' })
    expect(t.actor.flags[M]).toMatchObject({ id: 'n-thug', npc: { kind: 'grunt', rating: 3 }, ...OPTS })
  })
  test('attribute bases from integer stats only; edge.max from edg', () => {
    expect(s.attributes).toEqual({ bod: { base: 4 }, agi: { base: 3 } })  // "2D6" is not written
    expect(s.edge).toEqual({ max: 2 })
  })
  test('skills from pools; every Eden key; an unknown one → report and notes', () => {
    expect(Object.keys(s.skills).sort()).toEqual([...SKILLS].sort())
    expect(s.skills.firearms.points).toBe(4)
    expect(s.skills.athletics.points).toBe(0)
    expect(t.textOnly).toContain('Made-up Thug: Basket Weaving 3: not a shadowrun6-eden skill → notes')
    expect(s.notes).toMatch(/Basket Weaving 3: not a shadowrun6-eden skill/)
  })
  test('GM block in the notes: headline, stats, lines, pools, source', () => {
    expect(s.notes).toMatch(/^<h3>NPC<\/h3><p>Grunt, Professional Rating 3 · Made-up Crew<\/p>/)
    for (const re of [/<p>BOD 4<\/p>/, /<p>REA 2D6<\/p>/, /Weapons: Made-up Zapper \[Pistol, DV 2S\]/, /Firearms 4 \(pool 7\), Basket Weaving 3/, /Made-up Thug: XYZ p\.12/])
      expect(s.notes).toMatch(re)
    expect(s.description).toBe('<p>Invented.</p>')
  })
  test('hostile, unlinked token; nothing derived', () => {
    expect(t.actor.prototypeToken).toEqual({ actorLink: false, disposition: -1 })
    for (const k of ['initiative', 'physical', 'stun', 'defenserating', 'essence']) expect(s).not.toHaveProperty(k)
  })
  test('magic and resonance stats set the mortype; no rating → 1', () => {
    const b = grunt(); b.stats.push(st('mag', '4')); delete b.rating
    expect(npc({}, b).actor.system).toMatchObject({ mortype: 'magician', rating: 1 })
    const c = grunt(); c.stats.push(st('res', '3'))
    expect(npc({}, c).actor.system.mortype).toBe('technomancer')
  })
  test('the sample grunt', () => {
    const g = translateRunner(file.runners[1], OPTS)
    expect(g.actor).toMatchObject({ type: 'NPC', system: { rating: 3, skills: { firearms: { points: 4 }, close_combat: { points: 3 } } } })
    expect(g.textOnly).toEqual(['Made-up Ganger: Basket Weaving 2: not a shadowrun6-eden skill → notes'])
    expect(JSON.stringify(g.actor.system)).not.toMatch(/NaN|null/)
  })
})

describe('a critter', () => {
  const block = { kind: 'critter', stats: [st('bod', '5'), st('agi', '4')],
    lines: [{ part: 'powers', text: 'Made-up Glow, Fake Bite (2, extra)' }, { part: 'optionalPowers', text: 'Made-up Hum' },
      { part: 'weaknesses', text: 'Allergy (made-up dust)' }],
    pools: [{ name: 'Close Combat', rating: 4, attr: 'agi', pool: 8, printed: 'Close Combat 4' }] }
  const powers = { made_up_glow: { id: 'xyz.glow', kind: 'critterpowers', name: 'Made-up Glow', source: 'XYZ', page: 9, canon: true,
    description: 'Shines.', attrs: { type: 'M', action: 'Minor', range: 'LOS', duration: 'S' }, values: {} } }
  const b = beingActor(block, { name: 'Fake Hound', flags: flags('c-hound'), powers })
  test('Critter with attributes and skills as a grunt', () => {
    expect(b.actor.type).toBe('Critter')
    expect(b.actor.system.attributes).toEqual({ bod: { base: 5 }, agi: { base: 4 } })
    expect(b.actor.system.skills.close_combat.points).toBe(4)
    expect(b.actor.system).not.toHaveProperty('mortype')
    expect(b.actor.system.notes).toMatch(/^<h3>NPC<\/h3><p>Critter<\/p>/)
  })
  test('powers split on top-level commas, one getting its fields from the book entry', () => {
    expect(b.items.map(i => [i.name, i.type])).toEqual([['Made-up Glow', 'critterpower'], ['Fake Bite (2, extra)', 'critterpower'],
      ['Made-up Hum', 'critterpower']])
    const [glow, bite, hum] = b.items
    expect(glow.system).toMatchObject({ type: 'mana', action: 'minor_action', range: 'line_of_sight', duration: 'sustained', genesisID: '', product: '', page: 9 })  // XYZ: no Eden book code
    expect(glow.system.description).toMatch(/Shines\./)
    expect(glow.flags[M]).toMatchObject({ id: 'power:Made-up Glow', catalogId: 'xyz.glow' })
    expect(bite.system).toEqual({ genesisID: '', description: '' })
    expect(bite.flags[M].id).toBe('power:Fake Bite (2, extra)')
    expect(hum.system.description).toBe('<p>Optional power.</p>')
  })
  test('weaknesses in the notes', () => expect(b.actor.system.notes).toMatch(/Weaknesses: Allergy \(made-up dust\)/))
})

describe('a spirit', () => {
  const block = name => ({ kind: 'spirit', rating: 5, from: { kind: 'spirits', id: 'x', name, source: 'XYZ', page: 3 },
    stats: [st('bod', 'F', '5'), st('agi', 'F+1', '6'), st('init', 'F x 2 + ?', 'F x 2 + ?', false)], lines: [{ part: 'powers', text: 'Made-up Glow' }], pools: [] })
  test('Spirit of Man rating 5 → kin, no attribute or skill writes', () => {
    const b = beingActor(block('Spirit of Man'), { name: 'Spirit of Man', flags: flags('s1') })
    expect(b.actor.type).toBe('Spirit')
    expect(b.actor.system).toMatchObject({ rating: 5, spiritType: 'kin' })
    expect(b.actor.system).not.toHaveProperty('attributes')
    expect(b.actor.system).not.toHaveProperty('skills')
    expect(b.items.map(i => i.type)).toEqual(['critterpower'])
    expect(b.actor.system.notes).toMatch(/Spirit, Force 5/)
    expect(b.actor.system.notes).toMatch(/AGI F\+1 → 6/)
    expect(b.actor.system.notes).toMatch(/INIT F x 2 \+ \? \(not read\)/)
    expect(b.lines).toEqual([])
  })
  test('an unknown spirit type → air and a report line', () => {
    const t = npc({ streetName: 'Glitter Spirit' }, { ...block('Glitter Spirit') })
    expect(t.actor.system.spiritType).toBe('air')
    expect(t.textOnly).toEqual(['Glitter Spirit: spirit type not recognised → air; set it on the sheet'])
  })
})

describe('a sprite', () => {
  const block = name => ({ kind: 'sprite', rating: 4, stats: [st('attack', 'L', '4')], lines: [{ part: 'powers', text: 'Made-up Static, Fake Hash' }], pools: [] })
  test('Fault Sprite rating 4 → sprite fault level 4, sprite powers', () => {
    const b = beingActor(block(), { name: 'Fault Sprite', flags: flags('sp1') })
    expect(b.actor).toMatchObject({ type: 'sprite', system: { type: 'fault', level: 4 }, prototypeToken: { actorLink: false, disposition: -1 } })
    expect(b.items.map(i => i.type)).toEqual(['spritepower', 'spritepower'])
    expect(b.actor.system.notes).toMatch(/Sprite, Level 4/)
  })
  test('an unknown sprite type → null and a report line', () => {
    const b = beingActor(block(), { name: 'Glitter Sprite', flags: flags('sp2') })
    expect(b.actor.system.type).toBeNull()
    expect(b.lines).toEqual(['sprite type not recognised; set it on the sheet'])
  })
})

test('helpers', () => {
  expect(splitTop('A, B (c, d), E [f, g]')).toEqual(['A', 'B (c, d)', 'E [f, g]'])
  expect(splitTop('')).toEqual([])
  expect(npcHeadline({ kind: 'critter' })).toBe('Critter')
  expect(npcHeadline({ kind: 'grunt', rating: 2 })).toBe('Grunt, Professional Rating 2')
})

test('a runner’s Player token is linked', () => {
  expect(translateRunner(file.runners[0], OPTS).actor.prototypeToken).toEqual({ actorLink: true })
})

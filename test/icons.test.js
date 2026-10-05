// Icon keys, lookup order, art rules (scripts/lib/icons.js) and the copied default set (tools/copy-icons.mjs).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { iconFor, itemIconKey, MODULE_ICON_ROOT, npcIconKey, replaceable, slugName } from '../scripts/lib/icons.js'
import { beingActor, translateRunner } from '../scripts/lib/translate.js'

const M = MODULE_ICON_ROOT
const index = JSON.parse(fs.readFileSync('icons/index.json', 'utf8'))
const map = JSON.parse(fs.readFileSync('tools/icon-defaults.json', 'utf8'))

describe('iconFor lookup order', () => {
  const all = ['icons/items/xyz.made-up-pistol.webp', 'icons/items/made-up-pistol.webp', 'icons/defaults/weapon/pistols_heavy.webp', 'icons/defaults/weapon.webp']
  const args = ['weapon/pistols_heavy', 'Made-up Pistol', 'XYZ']
  test('book file, then name file, then full key, then category, then null', () => {
    expect(iconFor(...args, all)).toBe(M + all[0])
    expect(iconFor(...args, all.slice(1))).toBe(M + all[1])
    expect(iconFor(...args, all.slice(2))).toBe(M + all[2])
    expect(iconFor(...args, new Set(all.slice(3)))).toBe(M + all[3])
    expect(iconFor(...args, [])).toBeNull()
  })
  test('no book skips the book file', () => expect(iconFor('weapon/pistols_heavy', 'Made-up Pistol', null, all)).toBe(M + all[1]))
  test('slugName', () => expect(slugName('  Made-up Pistol VI (Custom)! ')).toBe('made-up-pistol-vi-custom'))
})

test('replaceable', () => {
  for (const img of ['', null, 'icons/svg/mystery-man.svg', 'systems/shadowrun6-eden/icons/x.svg', `${M}icons/defaults/armor.webp`,
    'worlds/w/chummer/tokens/a.png', 'worlds/w/chummer/portraits/a.png']) expect(replaceable(img), img).toBe(true)
  for (const img of ['user/art.webp', 'my-art/x.png', 'systems/sra2/x.svg', 'modules/other/x.webp', 'worlds/w/chummer/x.webp'])
    expect(replaceable(img), img).toBe(false)
})

describe('icon keys', () => {
  const gear = (type, subtype = '') => ({ type: 'gear', system: { type, subtype } })
  test('gear', () => {
    expect(itemIconKey(gear('WEAPON_FIREARMS', 'PISTOLS_LIGHT'))).toBe('weapon/pistols_light')
    expect(itemIconKey(gear('WEAPON_CLOSE_COMBAT', 'BLADES'))).toBe('weapon/blades')
    expect(itemIconKey(gear('ARMOR', 'ARMOR_BODY'))).toBe('armor')
    expect(itemIconKey(gear('CYBERWARE', 'CYBER_EYEWARE'))).toBe('augmentation/cyberware')
    expect(itemIconKey(gear('BIOWARE', 'BIOWARE_STANDARD'))).toBe('augmentation/bioware')
    expect(itemIconKey(gear('ELECTRONICS', 'COMMLINK'))).toBe('electronics/commlink')
    expect(itemIconKey(gear('ELECTRONICS', 'CYBERDECK'))).toBe('electronics/cyberdeck')
    expect(itemIconKey(gear('ELECTRONICS', 'OPTICAL'))).toBe('electronics')
    expect(itemIconKey(gear('VEHICLES', 'BIKES'))).toBe('vehicle/bikes')
    expect(itemIconKey(gear('DRONE_MINI', 'AIR'))).toBe('drone/mini')
    expect(itemIconKey(gear('DRONES'))).toBe('drone')
    expect(itemIconKey(gear('TOOLS', 'TOOLS'))).toBe('gear')
  })
  test('other items', () => {
    expect(itemIconKey({ type: 'focus', system: {} })).toBe('focus')
    expect(itemIconKey({ type: 'spell', system: { category: 'combat' } })).toBe('spell/combat')
    expect(itemIconKey({ type: 'quality', system: { category: 'ADVANTAGE' } })).toBe('quality/positive')
    expect(itemIconKey({ type: 'quality', system: { category: 'DISADVANTAGE' } })).toBe('quality/negative')
    expect(itemIconKey({ type: 'skill', system: { genesisID: 'knowledge' } })).toBe('skill/knowledge')
    expect(itemIconKey({ type: 'skill', system: { genesisID: 'language' } })).toBe('skill/language')
    for (const k of ['ritual', 'adeptpower', 'complexform', 'metamagic', 'echo', 'critterpower', 'spritepower', 'contact', 'lifestyle', 'sin',
      'software', 'martialartstyle', 'martialarttech'])
      expect(itemIconKey({ type: k, system: {} })).toBe(k)
  })
  test('NPCs', () => expect(['grunt', 'critter', 'spirit', 'sprite'].map(npcIconKey)).toEqual(['npc', 'npc/critter', 'npc/spirit', 'npc/sprite']))
})

describe('the copied default set', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.webp') ? [path.join(d, e.name).split(path.sep).join('/')] : [])
  test('index matches the files on disk', () => expect(index).toEqual(walk('icons').sort()))
  test('every key in the map resolves to its own file', () => {
    for (const k of Object.keys(map)) expect(iconFor(k, null, null, index), k).toBe(`${M}icons/defaults/${k}.webp`)
  })
  test('every key the code can make has an icon (category default at least)', () => {
    const subtypes = ['TASERS', 'HOLDOUTS', 'PISTOLS_LIGHT', 'MACHINE_PISTOLS', 'PISTOLS_HEAVY', 'SUBMACHINE_GUNS', 'SHOTGUNS', 'ASSAULT_CANNON',
      'RIFLE_ASSAULT', 'RIFLE_SNIPER', 'LMG', 'MMG', 'HMG', 'RIFLE_HUNTING', 'BLADES', 'CLUBS', 'WHIPS', 'UNARMED', 'CROSSBOWS', 'BOWS', 'THROWERS',
      'THROWING', 'LAUNCHERS', 'DART', 'OTHER_CLOSE', 'OTHER_SPECIAL']
    for (const s of subtypes) expect(map, s).toHaveProperty([`weapon/${s.toLowerCase()}`])
    for (const k of ['weapon', 'armor', 'augmentation', 'electronics', 'focus', 'gear', 'vehicle', 'drone', 'spell', 'ritual', 'adeptpower',
      'complexform', 'metamagic', 'echo', 'critterpower', 'spritepower', 'quality', 'contact', 'lifestyle', 'sin', 'skill', 'npc', 'rules',
      'software', 'martialartstyle', 'martialarttech'])
      expect(map, k).toHaveProperty([k])
  })
})

describe('translators with icons', () => {
  const file = JSON.parse(fs.readFileSync('samples/test-runners.json', 'utf8'))
  const opts = { exportedAt: file.exportedAt, appVersion: file.app.version, icons: index }
  test('runner items get flags.icon and img; the Player does not', () => {
    const t = translateRunner(file.runners[0], opts)
    expect(t.items.length).toBeGreaterThan(5)
    for (const i of t.items) {
      expect(i.flags[MODULE_ID].icon.key, i.name).toBe(itemIconKey(i))
      expect(i.img, i.name).toMatch(/^modules\/chummer-sr6-importer\/icons\/defaults\//)
    }
    expect(t.actor.img).toBeUndefined()
  })
  test('without the icons option: flags.icon, no img', () => {
    const t = translateRunner(file.runners[0], { ...opts, icons: null })
    for (const i of t.items) { expect(i.img, i.name).toBeUndefined(); expect(i.flags[MODULE_ID].icon, i.name).toBeTruthy() }
  })
  test('an NPC gets its kind’s icon as image and token; its items their own', () => {
    const b = beingActor({ kind: 'sprite', rating: 2, stats: [], lines: [{ part: 'powers', text: 'Made-up Static' }], pools: [] },
      { name: 'Fault Sprite', flags: { [MODULE_ID]: { id: 's', exportedAt: 'x', appVersion: 'y' } }, icons: index })
    expect(b.actor.img).toBe(`${M}icons/defaults/npc/sprite.webp`)
    expect(b.actor.prototypeToken.texture.src).toBe(b.actor.img)
    expect(b.actor.flags[MODULE_ID].icon).toBeUndefined()
    expect(b.items[0].img).toBe(`${M}icons/defaults/spritepower.webp`)
  })
})

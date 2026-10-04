// shadowrun6-eden vocabulary (scripts/lib/eden.js): invented category strings, Eden's keys only.
import { describe, expect, test } from 'vitest'
import {
  ATTRS, MOR, SKILLS, activationKey, armorSubtype, augmentType, durationKey, electronicsSubtype, gearType, lifestyleKey, normKey,
  sinQuality, skillKey, specKey, spellFields, spiritKey, spriteKey, vehicleType, weaponType,
} from '../scripts/lib/eden.js'

describe('keys', () => {
  test('attributes, magic types and the 19 skills', () => {
    expect(ATTRS).toEqual(['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'mag', 'res'])
    expect(MOR['mystic-adept']).toBe('mysticadept')
    expect(SKILLS).toHaveLength(19)
  })
  test('normKey', () => expect(normKey(' Close  Combat! ')).toBe('close_combat'))
  test('skillKey', () => {
    expect(skillKey('Close Combat')).toBe('close_combat')
    expect(skillKey('Exotic Weapons')).toBe('exotic_weapons')
    expect(skillKey('Basket Weaving')).toBe(null)
  })
  test('specKey: by label, then by key', () => {
    expect(specKey('Pistols (Light)', { pistols_light: 'Pistols (Light)' })).toBe('pistols_light')
    expect(specKey('pistols light', {})).toBe(null)
    expect(specKey('Pistols Light', { pistols_light: 'x' })).toBe('pistols_light')
    expect(specKey('Made-up', { pistols_light: 'Pistols (Light)' })).toBe(null)
  })
})

describe('weapons', () => {
  test.each([
    ['Pocket Tasers', 'WEAPON_FIREARMS', 'TASERS', 'firearms'],
    ['Made-up hold-outs', 'WEAPON_FIREARMS', 'HOLDOUTS', 'firearms'],
    ['Light pistols', 'WEAPON_FIREARMS', 'PISTOLS_LIGHT', 'firearms'],
    ['Machine pistols', 'WEAPON_FIREARMS', 'MACHINE_PISTOLS', 'firearms'],
    ['Heavy pistols', 'WEAPON_FIREARMS', 'PISTOLS_HEAVY', 'firearms'],
    ['Made-up SMGs', 'WEAPON_FIREARMS', 'SUBMACHINE_GUNS', 'firearms'],
    ['Shotguns', 'WEAPON_FIREARMS', 'SHOTGUNS', 'firearms'],
    ['Assault cannons', 'WEAPON_FIREARMS', 'ASSAULT_CANNON', 'firearms'],
    ['Assault rifles', 'WEAPON_FIREARMS', 'RIFLE_ASSAULT', 'firearms'],
    ['Sniper rifles', 'WEAPON_FIREARMS', 'RIFLE_SNIPER', 'firearms'],
    ['Light machine guns', 'WEAPON_FIREARMS', 'LMG', 'firearms'],
    ['Medium machine guns', 'WEAPON_FIREARMS', 'MMG', 'firearms'],
    ['HMGs', 'WEAPON_FIREARMS', 'HMG', 'firearms'],
    ['Hunting rifles', 'WEAPON_FIREARMS', 'RIFLE_HUNTING', 'firearms'],
    ['Blades', 'WEAPON_CLOSE_COMBAT', 'BLADES', 'close_combat'],
    ['Clubs', 'WEAPON_CLOSE_COMBAT', 'CLUBS', 'close_combat'],
    ['Whips', 'WEAPON_CLOSE_COMBAT', 'WHIPS', 'close_combat'],
    ['Unarmed', 'WEAPON_CLOSE_COMBAT', 'UNARMED', 'close_combat'],
    ['Crossbows', 'WEAPON_RANGED', 'CROSSBOWS', 'athletics'],
    ['Bows', 'WEAPON_RANGED', 'BOWS', 'athletics'],
    ['Flamethrowers', 'WEAPON_SPECIAL', 'THROWERS', 'exotic_weapons'],
    ['Throwing stars', 'WEAPON_RANGED', 'THROWING', 'athletics'],
    ['Grenades', 'WEAPON_RANGED', 'THROWING', 'athletics'],
    ['Rocket launchers', 'WEAPON_SPECIAL', 'LAUNCHERS', 'engineering'],
    ['Dart guns', 'WEAPON_SPECIAL', 'DART', 'exotic_weapons'],
    ['Other melee', 'WEAPON_CLOSE_COMBAT', 'OTHER_CLOSE', 'close_combat'],
  ])('%s', (c, type, subtype, skill) => expect(weaponType(c)).toEqual({ type, subtype, skill, known: true }))
  test('an unknown category: special, not known', () =>
    expect(weaponType('Glitter cannons')).toEqual({ type: 'WEAPON_SPECIAL', subtype: 'OTHER_SPECIAL', skill: 'exotic_weapons', known: false }))
})

describe('armor, augmentations, electronics, gear, vehicles', () => {
  test.each([['Made-up helmets', 'ARMOR_HELMET'], ['Riot shields', 'ARMOR_SHIELD'], ['Clothing', 'ARMOR_CLOTHES'],
    ['Formal wear', 'ARMOR_SOCIAL'], ['Body armor', 'ARMOR_BODY'], ['Glitter suits', 'ARMOR_BODY']])('armor %s', (c, s) => expect(armorSubtype(c)).toBe(s))
  test.each([
    ['cyberware', 'Headware', 'CYBERWARE', 'CYBER_HEADWARE'], ['cyberware', 'Eyeware', 'CYBERWARE', 'CYBER_EYEWARE'],
    ['cyberware', 'Earware', 'CYBERWARE', 'CYBER_EARWARE'], ['cyberware', 'Datajacks', 'CYBERWARE', 'CYBERJACK'],
    ['cyberware', 'Cyberlimbs', 'CYBERWARE', 'CYBER_LIMBS'], ['cyberware', 'Implant weapons', 'CYBERWARE', 'CYBER_IMPLANT_WEAPON'],
    ['cyberware', 'Bodyware', 'CYBERWARE', 'CYBER_BODYWARE'], ['bioware', 'Cultured bioware', 'BIOWARE', 'BIOWARE_CULTURED'],
    ['bioware', 'Bio-weapons', 'BIOWARE', 'BIOWARE_IMPLANT_WEAPON'], ['bioware', 'Dermal mods', 'BIOWARE', 'BIOWARE_DERMAL'],
    ['bioware', 'Made-up', 'BIOWARE', 'BIOWARE_STANDARD'],
  ])('augmentation %s %s', (t, c, type, subtype) => expect(augmentType(t, c)).toEqual({ type, subtype }))
  test.each([['Commlinks', 'COMMLINK'], ['Cyberdecks', 'CYBERDECK'], ['Rigger consoles', 'RIGGER_CONSOLE'], ['RFID tags', 'RFID'],
    ['Vision enhancements', 'OPTICAL'], ['Audio enhancements', 'AUDIO'], ['Sensors', 'SENSOR_HOUSING'], ['Security devices', 'SECURITY'],
    ['Breaking and entering', 'BREAKING'], ['Tac nets', 'TAC_NET'], ['Credsticks', 'ID_CREDIT'], ['Communication', 'COMMUNICATION'],
    ['Glitter gadgets', 'ELECTRONIC_ACCESSORIES']])('electronics %s', (c, s) => expect(electronicsSubtype(c)).toBe(s))
  test.each([
    ['Foci', { item: 'focus', known: true }],
    ['Autosofts', { item: 'gear', type: 'SOFTWARE', subtype: 'OTHER_PROGRAMS', known: true }],
    ['Magical supplies', { item: 'gear', type: 'MAGICAL', subtype: 'MAGIC_SUPPLIES', known: true }],
    ['Toxins', { item: 'gear', type: 'CHEMICALS', subtype: 'INDUSTRIAL_CHEMICALS', known: true }],
    ['Medkits', { item: 'gear', type: 'BIOLOGY', subtype: 'BIOTECH', known: true }],
    ['Survival gear', { item: 'gear', type: 'SURVIVAL', subtype: 'SURVIVAL_GEAR', known: true }],
    ['Glitter', { item: 'gear', type: 'TOOLS', subtype: 'TOOLS', known: false }],
  ])('gear %s', (c, r) => expect(gearType(c)).toEqual(r))
  test.each([
    ['Microdrones', 'DRONE_MICRO', 'GROUND'], ['Minidrones (aerial)', 'DRONE_MINI', 'AIR'], ['Small drones (air)', 'DRONE_SMALL', 'AIR'],
    ['Medium drones, aquatic', 'DRONE_MEDIUM', 'AQUATIC'], ['Large drones (anthro)', 'DRONE_LARGE', 'ANTHRO'], ['Made-up drones', 'DRONES', ''],
    ['Bikes', 'VEHICLES', 'BIKES'], ['Trucks', 'VEHICLES', 'TRUCKS'], ['Vans', 'VEHICLES', 'VANS'], ['Buses', 'VEHICLES', 'BUS'],
    ['Boats', 'VEHICLES', 'BOATS'], ['Ships', 'VEHICLES', 'SHIPS'], ['Submarines', 'VEHICLES', 'SUBMARINES'], ['Helicopters', 'VEHICLES', 'ROTORCRAFT'],
    ['VTOL', 'VEHICLES', 'VTOL'], ['Fixed-wing aircraft', 'VEHICLES', 'FIXED_WING'], ['Hovercraft', 'VEHICLES', 'HOVERCRAFT'],
    ['Walkers', 'VEHICLES', 'WALKER'], ['Cars', 'VEHICLES', 'CARS'],
  ])('vehicle %s', (c, type, subtype) => expect(vehicleType(c)).toEqual({ type, subtype, known: true }))
  test('an unknown vehicle category: special vehicles, not known', () =>
    expect(vehicleType('Glitter wagons')).toEqual({ type: 'VEHICLES', subtype: 'SPECIAL_VEHICLES', known: false }))
})

describe('spells, powers, forms', () => {
  test('spellFields', () => {
    expect(spellFields({ range: 'LOS(A)', type: 'M', duration: 'S', damage: 'S', tags: 'Direct', category: 'combat' }, { drain: 5 }))
      .toEqual({ category: 'combat', range: 'line_of_sight_area', type: 'mana', duration: 'sustained', damage: 'stun', drain: 5,
        combatSpellType: 'spells_direct', isSustained: true })
    expect(spellFields({ range: 'T', type: 'P', duration: 'I', damage: 'P', tags: 'Indirect, Area', category: 'Manipulation' }, {}))
      .toEqual({ category: 'manipulation', range: 'touch', type: 'physical', duration: 'instantaneous', damage: 'physical', drain: 0,
        combatSpellType: 'spells_indirect', isSustained: false })
    expect(spellFields({ range: 'S', category: 'glitter' }, {})).toMatchObject({ category: 'health', range: 'self', duration: 'special', combatSpellType: 'spells_indirect' })
    expect(spellFields({ range: 'S(A)' }, {}).range).toBe('self_area')
    expect(spellFields({ range: 'LOS' }, {}).range).toBe('line_of_sight')
  })
  test.each([['I', 'instantaneous'], ['S', 'sustained'], ['P', 'permanent'], ['L', 'limited'], ['Sustained', 'sustained'], ['Special', 'special'], ['?', 'special']])(
    'durationKey %s', (s, k) => expect(durationKey(s)).toBe(k))
  test('activationKey', () => {
    expect(activationKey('Major action')).toBe('major_action')
    expect(activationKey('Minor')).toBe('minor_action')
    expect(activationKey(undefined)).toBe('passive')
  })
})

describe('lifestyles, SINs, spirits, sprites', () => {
  test('lifestyleKey', () => {
    expect(lifestyleKey('Made-up Low Lifestyle')).toBe('low')
    expect(lifestyleKey('Street')).toBe('street')
    expect(lifestyleKey('Made-up Hideout')).toBe(null)
  })
  test('sinQuality', () => {
    expect(sinQuality('fake', 4)).toBe('SUPERFICIALLY_PLAUSIBLE')
    expect(sinQuality('fake', 1)).toBe('ANYONE')
    expect(sinQuality('fake', 6)).toBe('SECOND_LIFE')
    expect(sinQuality('real')).toBe('REAL_SIN')
    expect(sinQuality('fake', 9)).toBe('ANYONE')
    expect(sinQuality('fake')).toBe('ANYONE')
  })
  test('spiritKey', () => {
    expect(spiritKey('Spirit of Man')).toBe('kin')
    expect(spiritKey('Beast Spirit')).toBe('beasts')
    expect(spiritKey('Fire Spirit')).toBe('fire')
    expect(spiritKey('Guardians')).toBe('guardian')
    expect(spiritKey('Glitter Spirit')).toBe(null)
    expect(spiritKey(undefined)).toBe(null)
  })
  test('spriteKey', () => {
    expect(spriteKey('Fault Sprite')).toBe('fault')
    expect(spriteKey('Data Sprite')).toBe('data')
    expect(spriteKey('Glitter Sprite')).toBe(null)
  })
})

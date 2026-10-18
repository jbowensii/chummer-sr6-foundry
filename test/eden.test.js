// shadowrun6-eden vocabulary (scripts/lib/eden.js): invented category strings, Eden's keys only.
import { describe, expect, test } from 'vitest'
import {
  ACCESS_DEVICES, ATTRS, effectOptionKey, effectRoute, missingTargets, OUR_TARGETS, MOR, SKILLS, activationKey, armorSubtype, augmentType, autosoftSubtype, actorChanges, deviceFields, durationKey, edenBook, effectKeys, effectValue,
  electronicsSubtype, gearType, hostChanges, lifestyleKey, martialCategories, modType, normKey, sinQuality, skillKey, softwareType, specKey,
  spellFields, spiritKey, spriteKey, testSkills, vehicleType, vehicleVtype, weaponChanges, weaponType,
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
    ['bioware', 'Made-up', 'BIOWARE', 'BIOWARE_STANDARD'], ['cyberware', 'Cyberdecks (implanted)', 'CYBERWARE', 'CYBERDECK'],
    ['cyberware', 'Commlinks (implanted)', 'CYBERWARE', 'COMMLINK'],
  ])('augmentation %s %s', (t, c, type, subtype) => expect(augmentType(t, c)).toEqual({ type, subtype }))
  test.each([
    ['cyberware', 'nanoware', 'Made-up nanites', 'NANOWARE', 'NANO_CYBERWARE'], ['cyberware', 'nanoware', 'Cosmetic nanites', 'NANOWARE', 'NANITES_COSMETIC'],
    ['bioware', 'geneware', 'Made-up', 'GENETICS', 'AUGMENTICS'], ['bioware', 'geneware', 'Gene therapy', 'GENETICS', 'THERAPEUTIC'],
    ['bioware', 'transgenics', 'Made-up', 'GENETICS', 'TRANSGENICS'], ['bioware', 'symbionts', 'Made-up', 'BIOWARE', 'SYMBIONTS'],
  ])('augmentation the export folded: %s (%s) %s', (t, ware, c, type, subtype) => expect(augmentType(t, c, ware)).toEqual({ type, subtype }))
  test.each([['Commlinks', 'COMMLINK'], ['Cyberdecks', 'CYBERDECK'], ['Rigger consoles', 'RIGGER_CONSOLE'], ['RFID tags', 'RFID'],
    ['Vision enhancements', 'OPTICAL'], ['Audio enhancements', 'AUDIO'], ['Sensors', 'SENSOR_HOUSING'], ['Security devices', 'SECURITY'],
    ['Breaking and entering', 'BREAKING'], ['Tac nets', 'TAC_NET'], ['Credsticks', 'ID_CREDIT'], ['Communication', 'COMMUNICATION'],
    ['Glitter gadgets', 'ELECTRONIC_ACCESSORIES'], ['Cyberterms', 'CYBERTERM'], ['Dataterms', 'DATATERM']])('electronics %s', (c, s) => expect(electronicsSubtype(c)).toBe(s))
  test('a Matrix access device: device rating, its array on the attributes Eden reads, program slots', () => {
    expect(deviceFields('COMMLINK', { rating: 3, array: '1/1' })).toEqual({ matrix: { deviceRating: 3 }, d: 1, f: 1 })
    expect(deviceFields('CYBERDECK', { rating: 2, array: '5 4', programs: '2' })).toEqual({ matrix: { deviceRating: 2 }, a: 5, s: 4, progSlots: 2 })
    expect(deviceFields('CYBERTERM', { rating: 4, array: '6 5 4 3' })).toEqual({ matrix: { deviceRating: 4 }, a: 6, s: 5, d: 4, f: 3 })
    expect(deviceFields('CYBERDECK', { rating: 2, array: 'see text', programs: 'Rating' })).toEqual({ matrix: { deviceRating: 2 } })
    expect(deviceFields('OPTICAL', { rating: 2, array: '1/1' })).toEqual({})
    expect(ACCESS_DEVICES).toEqual(['COMMLINK', 'RIGGER_CONSOLE', 'DATATERM', 'CYBERJACK', 'CYBERDECK', 'CYBERTERM'])
  })
  test.each([['Small drones (air)', 'AIR'], ['Rotorcraft', 'AIR'], ['Boats', 'WATER'], ['Made-up submarines', 'WATER'], ['Bikes', 'GROUND'],
    ['Medium drones, aquatic', 'WATER'], [undefined, 'GROUND']])('vtype %s', (c, v) => expect(vehicleVtype(c)).toBe(v))
  test.each([['weapons', 'Weapon accessories', 'accessory_weapon'], ['weapons', 'Made-up firearm mods', 'weapon_mod'],
    ['armor', 'Armor modifications', 'armor_mod'], ['electronics', 'Vision enhancements', 'visual_enhancement'],
    ['electronics', 'Audio enhancements', 'audio_enhancement'], ['electronics', 'Made-up', 'accessory_electronics'],
    ['augmentations', 'Cyberlimb accessories', null], ['gear', 'Made-up', null]])('mod type on %s: %s', (h, c, t) => expect(modType(h, c)).toBe(t))
  test.each([
    ['Foci', { item: 'focus', known: true }],
    ['Autosofts', { item: 'gear', type: 'SOFTWARE', subtype: 'OTHER_PROGRAMS', known: true }],
    ['Magical supplies', { item: 'gear', type: 'MAGICAL', subtype: 'MAGIC_SUPPLIES', known: true }],
    ['Toxins', { item: 'gear', type: 'CHEMICALS', subtype: 'TOXINS', known: true }],
    ['Industrial chemicals', { item: 'gear', type: 'CHEMICALS', subtype: 'INDUSTRIAL_CHEMICALS', known: true }],
    ['Made-up drugs', { item: 'gear', type: 'CHEMICALS', subtype: 'DRUGS', known: true }],
    ['BTLs', { item: 'gear', type: 'CHEMICALS', subtype: 'BTL', known: true }],
    ['Slap patches', { item: 'gear', type: 'BIOLOGY', subtype: 'SLAP_PATCHES', known: true }],
    ['Grenades', { item: 'gear', type: 'AMMUNITION', subtype: 'GRENADES', known: true }],
    ['Rockets', { item: 'gear', type: 'AMMUNITION', subtype: 'ROCKETS', known: true }],
    ['Missiles', { item: 'gear', type: 'AMMUNITION', subtype: 'MISSILES', known: true }],
    ['Explosives', { item: 'gear', type: 'AMMUNITION', subtype: 'EXPLOSIVES', known: true }],
    ['Ammunition', { item: 'gear', type: 'AMMUNITION', subtype: 'AMMUNITION', known: true }],
    ['Magical formulae', { item: 'gear', type: 'MAGICAL', subtype: 'MAGICAL_FORMULA', known: true }],
    ['Magical lodge materials', { item: 'gear', type: 'MAGICAL', subtype: 'MAGIC_LODGE', known: true }],
    ['Maglocks', { item: 'gear', type: 'ELECTRONICS', subtype: 'SECURITY', known: true }],
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
    expect(spellFields({ range: 'LOS(A)', type: 'M', duration: 'S', damage: 'S', tags: 'Direct', category: 'combat', opposed: 'true' }, { drain: 5 }))
      .toEqual({ category: 'combat', range: 'line_of_sight_area', type: 'mana', duration: 'sustained', damage: 'stun', drain: 5,
        combatSpellType: 'spells_direct', isSustained: true, multiSense: false, isOpposed: true, withEssence: false })
    expect(spellFields({ range: 'T', type: 'P', duration: 'I', damage: 'P', tags: 'Indirect, Area, Multi-Sense', category: 'Manipulation' }, {}))
      .toEqual({ category: 'manipulation', range: 'touch', type: 'physical', duration: 'instantaneous', damage: 'physical', drain: 0,
        combatSpellType: 'spells_indirect', isSustained: false, multiSense: true, isOpposed: false, withEssence: false })
    expect(spellFields({ essence: 'true' }, {})).toMatchObject({ isOpposed: false, withEssence: true })
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

describe('programs and martial arts', () => {
  test('autosoftSubtype: Eden’s autosoft kind by the words of its name; none of them -> null', () => {
    expect(autosoftSubtype('Made-up Targeting Autosoft')).toBe('TARGETING')
    expect(autosoftSubtype('Electronic Warfare')).toBe('ELECTRONIC_WARFARE')
    expect(autosoftSubtype('Manoeuvre [Zap Rotor]')).toBe('MANEUVER')
    expect(autosoftSubtype('Clearsight')).toBe('CLEARSIGHT')
    expect(autosoftSubtype('Made-up Glitter')).toBeNull()
  })
  test('softwareType: Eden software types from the printed program type; unknown -> STANDARD, not known', () => {
    expect(softwareType('Hacking')).toEqual({ type: 'HACKING', known: true })
    expect(softwareType('basic')).toEqual({ type: 'STANDARD', known: true })
    expect(softwareType('Autosoft')).toEqual({ type: 'AUTOSOFT', known: true })
    expect(softwareType('Made-up Datasoft')).toEqual({ type: 'DATASOFT', known: true })
    expect(softwareType('IC')).toEqual({ type: 'IC', known: true })
    expect(softwareType('Glitterware')).toEqual({ type: 'STANDARD', known: false })
    expect(softwareType(undefined)).toEqual({ type: 'STANDARD', known: false })
  })
  test('martialCategories: printed categories -> Eden flags, plurals too', () => {
    expect(martialCategories('Striking, Grappling')).toEqual({ grappling: true, mobility: false, ranged: false, striking: true, weapon: false })
    expect(martialCategories('Weapons / Ranged')).toMatchObject({ weapon: true, ranged: true, striking: false })
    expect(Object.values(martialCategories(undefined)).some(Boolean)).toBe(false)
  })
})

describe('books, effects', () => {
  test('Eden book codes for the sources Eden has, none for the rest', () => {
    expect(['CRB', 'crb', 'CRB-SEA', 'SWC', 'FS', 'SIF-NO', 'MUS', '', undefined].map(edenBook))
      .toEqual(['core', 'core', 'core_seattle', 'companion', 'firing_squad', 'sif_new_orleans', null, null, null])
  })
  test('a catalog effect -> Eden effect keys; what Eden has no field for: none', () => {
    const keys = target => effectKeys({ target, op: 'add' })
    expect(Object.fromEntries(['attr:agi', 'attr:edg', 'attr:ess', 'skill:close-combat', 'derived:defense', 'derived:defense-astral',
      'derived:social', 'derived:initiative', 'derived:initiative-dice', 'derived:matrix-initiative', 'derived:matrix-initiative-dice',
      'derived:physical-monitor', 'derived:stun-monitor', 'derived:overflow', 'derived:composure', 'derived:judge-intentions',
      'derived:memory', 'derived:lift', 'matrix:attack', 'matrix:sleaze', 'matrix:data-processing', 'matrix:firewall', 'test:defense',
      'test:damage-resistance', 'test:toxin-resistance', 'derived:matrix-defense', 'derived:unarmed-ar', 'test:defense-astral', 'test:defense-spell-direct',
      'test:defense-spell-indirect'].map(t => [t, keys(t)]))).toEqual({
      'attr:agi': ['system.attributes.agi.mod'], 'attr:edg': ['system.edge.max'], 'attr:ess': ['system.attributes.essence.mod'],
      'skill:close-combat': ['system.skills.close_combat.modifier'], 'derived:defense': ['system.defenserating.physical.mod'],
      'derived:defense-astral': ['system.defenserating.astral.mod'], 'derived:social': ['system.defenserating.social.mod'],
      'derived:initiative': ['system.initiative.physical.mod'], 'derived:initiative-dice': ['system.initiative.physical.diceMod'],
      'derived:matrix-initiative': ['system.initiative.matrix.mod'], 'derived:matrix-initiative-dice': ['system.initiative.matrix.diceMod'],
      'derived:physical-monitor': ['system.physical.mod'], 'derived:stun-monitor': ['system.stun.mod'], 'derived:overflow': ['system.overflow.mod'],
      'derived:composure': ['system.derived.composure.mod'], 'derived:judge-intentions': ['system.derived.judge_intentions.mod'],
      'derived:memory': ['system.derived.memory.mod'], 'derived:lift': ['system.derived.lift_carry.mod'],
      'matrix:attack': ['system.persona.used.a'], 'matrix:sleaze': ['system.persona.used.s'],
      'matrix:data-processing': ['system.persona.used.d'], 'matrix:firewall': ['system.persona.used.f'],
      'test:defense': ['system.defensepool.physical.mod'], 'test:damage-resistance': ['system.defensepool.damage_physical.mod'],
      'test:toxin-resistance': ['system.defensepool.toxin.mod'], 'derived:matrix-defense': ['system.defenserating.matrix.mod'], 'derived:unarmed-ar': ['system.attackrating.physical.mod'],
      'test:defense-astral': ['system.defensepool.astral.mod'], 'test:defense-spell-direct': ['system.defensepool.spells_direct.mod'],
      'test:defense-spell-indirect': ['system.defensepool.spells_indirect.mod'] })
    // a Magic Resistance test is the defense against a spell; Hardened Armor is Eden's trait its Defense Rating and soak read
    expect(keys('test:magic-resistance')).toEqual(['system.defensepool.spells_direct.mod', 'system.defensepool.spells_indirect.mod'])
    expect(keys('derived:hardened-armor')).toEqual(['traits.hardenedArmor'])
    // a test type: each skill it covers
    expect(keys('test:social')).toEqual(['system.skills.con.modifier', 'system.skills.influence.modifier'])
    expect(keys('test:combat')).toEqual(['system.skills.close_combat.modifier', 'system.skills.exotic_weapons.modifier', 'system.skills.firearms.modifier'])
    expect(testSkills('physical')).toEqual(['athletics', 'close_combat', 'exotic_weapons', 'firearms', 'piloting', 'stealth'])
    expect(testSkills('attr-cha')).toEqual(['con', 'influence'])
    expect(testSkills('magic')).toEqual(['astral', 'conjuring', 'enchanting', 'sorcery'])
    // drain and fading resistance: Eden makes those pools after the effects run, so a NUMBER added to the missing mod is stored as it is
    expect(keys('test:drain-resistance')).toEqual(['system.defensepool.drain.mod'])
    expect(keys('test:fading-resistance')).toEqual(['system.defensepool.fading.mod'])
    // Eden's Unarmed is a gear item: its AR is the actor's physical AR mod, its DV and Physical damage module traits; a sense is a vision mode; movement is three traits
    expect(keys('derived:unarmed-dv')).toEqual(['traits.unarmedDv'])
    expect(effectKeys({ target: 'derived:unarmed-damage', op: 'set' })).toEqual(['traits.unarmedPhysical'])
    expect(effectKeys({ target: 'sense:low-light-vision', op: 'add' })).toEqual(['token.sight.visionMode'])
    expect(keys('derived:movement')).toEqual(['traits.movementRate', 'traits.movementSprintBase', 'traits.movementSprintMultiplier'])
    expect(effectKeys({ target: 'derived:movement', op: 'add', when: 'when in flight' })).toEqual([])  // (flight stays a note)
    // no Eden field: none
    for (const t of ['derived:unarmed-damage', 'sense:thermographic-vision', 'sense:astral-perception', 'limb-attr:agi', 'skill:basket-weaving', 'skill:choice', 'attr:choice', 'attr-max:agi', 'derived:matrix-monitor',
      'derived:minor-actions', 'derived:major-actions', 'matrix:overwatch', 'test:surprise', 'test:all',
      'test:spell-combat', 'item:ar', 'action:wrest', 'resource:karma', 'lifestyle:comforts', 'pool:chase',
      'pricemod:armor', 'skill-max:choice', 'complex-form:static-veil']) expect(keys(t), t).toEqual([])
    for (const op of ['set', 'edge', 'edge-cost', 'edge-cost-set', 'no-edge', 'no-edge-gain', 'wild-die', 'hits', 'threshold', 'threshold-set'])
      expect(effectKeys({ target: 'skill:firearms', op, value: '1' }), op).toEqual([])
  })
  test('actorChanges: numbers, never strings; a movement value split three ways; a vision mode and a flag as overrides; a formula: none', () => {
    const ch = (target, value, op = 'add', extra = {}) => actorChanges({ target, op, value, ...extra }, 3)
    expect(ch('attr:agi', '2')).toEqual([{ key: 'system.attributes.agi.mod', value: 2, mode: 2 }])
    expect(ch('test:drain-resistance', 'R')).toEqual([{ key: 'system.defensepool.drain.mod', value: 3, mode: 2 }])
    expect(ch('derived:movement', '3/6/1')).toEqual([{ key: 'traits.movementRate', value: 3, mode: 2 }, { key: 'traits.movementSprintBase', value: 6, mode: 2 }, { key: 'traits.movementSprintMultiplier', value: 1, mode: 2 }])
    expect(ch('derived:movement', '10/15/1', 'add', { when: 'flying' })).toEqual([])
    expect(ch('derived:movement', '10/15')).toEqual([])
    expect(ch('sense:low-light-vision', '1')).toEqual([{ key: 'token.sight.visionMode', value: 'lightAmplification', mode: 5 }])
    expect(ch('derived:unarmed-damage', 'P', 'set')).toEqual([{ key: 'traits.unarmedPhysical', value: true, mode: 5 }])
    expect(ch('derived:unarmed-damage', 'S', 'set')).toEqual([])
    expect(ch('derived:unarmed-ar', '2,0,0,0,0')).toEqual([{ key: 'system.attackrating.physical.mod', value: 2, mode: 2 }])  // (Eden's Unarmed has one AR)
    expect(ch('derived:unarmed-ar', '2,1,0,0,0')).toEqual([])
    expect(ch('derived:unarmed-dv', 'hits')).toEqual([])
    expect(ch('attr:agi', '1', 'set')).toEqual([])
  })
  test('weaponChanges: an attack bonus is the weapon’s dice pool modifier, a wild die its own flag; neither is a skill or for a non-attack skill', () => {
    const w = (target, op, value = '1', extra = {}) => weaponChanges({ target, op, value, ...extra }, 2)
    expect(w('test:combat', 'add', 'R')).toEqual([{ key: 'system.modes.dicePoolMod', value: 2, mode: 2 }])
    expect(w('skill:firearms', 'add', '1')).toEqual([{ key: 'system.modes.dicePoolMod', value: 1, mode: 2 }])
    expect(w('skill:close-combat', 'wild-die')).toEqual([{ key: 'system.wild', value: true, mode: 5 }])
    expect(w('test:combat', 'wild-die')).toEqual([{ key: 'system.wild', value: true, mode: 5 }])
    for (const [t, op, extra] of [['skill:perception', 'add'], ['skill:firearms', 'edge'], ['test:social', 'add'], ['skill:firearms', 'add', { spec: 'Pistols' }]]) expect(w(t, op, '1', extra), t).toEqual([])
  })
  test('an effect value: a number, or so much per rating; a formula or a list: null', () => {
    expect(['2', '-1', '–1', 'R', '-R', 'R*2', '2*R', 'edg/2', '0,1,1,0,0'].map(v => effectValue(v, 3))).toEqual([2, -1, -1, 3, -3, 6, 6, null, null])
    // owner decisions 2026-10-11: a level after the first, the book's own value per rating
    expect(['R-1', 'R*2-2', 'R[1,1,2,2]'].map(v => effectValue(v, 3))).toEqual([2, 4, 2])
    expect(['R-1', 'R[1,1,2,2]'].map(v => effectValue(v, 1))).toEqual([0, 1])
    expect(effectValue('R[1,1,2,2]', 9)).toBe(2)
  })
  test('an accessory item:ar effect -> its host attack rating bands', () => {
    expect(hostChanges({ target: 'item:ar', op: 'add', value: '0,1,1,0,0' }))
      .toEqual([{ key: 'system.attackRating.1', value: 1, mode: 2 }, { key: 'system.attackRating.2', value: 1, mode: 2 }])
    expect(hostChanges({ target: 'item:ar', op: 'add', value: '-2,0,1' })).toEqual([{ key: 'system.attackRating.0', value: -2, mode: 2 }, { key: 'system.attackRating.2', value: 1, mode: 2 }])
    expect(hostChanges({ target: 'attr:agi', op: 'add', value: '1' })).toEqual([])
  })
  test('a matrix: effect on a host that is no access device (a weapon’s or armor’s accessory) is no host change; on a device it is its own attribute', () => {
    const fw = { target: 'matrix:firewall', op: 'add', value: '1' }
    expect(hostChanges(fw, 1, { device: false })).toEqual([])
    expect(hostChanges(fw)).toEqual([{ key: 'system.f', value: 1, mode: 2 }])
    expect(hostChanges({ target: 'item:dv', op: 'add', value: '1' }, 1, { device: false })).toEqual([{ key: 'system.dmg', value: 1, mode: 2 }])
  })
  test('item:ar on a host whose band is 0 or '-': that band is left out (Eden’s own guard never fires in Foundry 14); a set and a fire mode are not bands', () => {
    const ar = { target: 'item:ar', op: 'add', value: '1,1,1,1,1' }
    expect(hostChanges(ar, 1, { bands: [9, 7, 0, '-', 3] }).map(c => c.key)).toEqual(['system.attackRating.0', 'system.attackRating.1', 'system.attackRating.4'])
    expect(hostChanges(ar, 1)).toHaveLength(5)  // (host unknown: all bands)
    expect(hostChanges({ ...ar, op: 'set' }, 1, { bands: [0, 0, 0, 0, 0] })).toHaveLength(5)
    expect(hostChanges({ ...ar, value: '1', when: 'semi-auto' }, 1, { bands: [0, 0, 0, 0, 0] })).toEqual([{ key: 'system.modes.SA_ar_mod', value: 1, mode: 2 }])
    // one value alone is every live band, not the first only; x removes a band (override to 0, which Eden shows as a dash)
    expect(hostChanges({ ...ar, value: '2' }, 1, { bands: [9, 7, 0, 0, 3] }).map(c => [c.key, c.value])).toEqual([['system.attackRating.0', 2], ['system.attackRating.1', 2], ['system.attackRating.4', 2]])
    expect(hostChanges({ ...ar, value: '-2,x,0,0,0' }, 1, { bands: [9, 7, 0, 0, 0] })).toEqual([{ key: 'system.attackRating.0', value: -2, mode: 2 }, { key: 'system.attackRating.1', value: 0, mode: 5 }])
    expect(hostChanges({ ...ar, value: 'x' }, 1)).toHaveLength(5)
  })
  test('an add-on’s other item effects -> its host’s fields: fire modes, damage, ammunition, a vehicle’s on- and off-road pairs', () => {
    expect(hostChanges({ target: 'item:ar', op: 'add', value: '1', when: 'semi-auto, burst fire' }))
      .toEqual([{ key: 'system.modes.SA_ar_mod', value: 1, mode: 2 }, { key: 'system.modes.BF_ar_mod', value: 1, mode: 2 }])
    // a single shot has no modifier of Eden's; the boolean mode flags are never written
    expect(hostChanges({ target: 'item:ar', op: 'add', value: '1', when: 'single shot' })).toEqual([])
    expect(hostChanges({ target: 'item:ar', op: 'add', value: '1', when: 'semi-auto, burst fire, full auto' }).map(c => c.key)).toEqual(['system.modes.SA_ar_mod', 'system.modes.BF_ar_mod', 'system.modes.FA_ar_mod'])
    // an attack bonus or a wild die on a weapon host
    expect(hostChanges({ target: 'test:combat', op: 'add', value: '1' }, 1, { weapon: true })).toEqual([{ key: 'system.modes.dicePoolMod', value: 1, mode: 2 }])
    expect(hostChanges({ target: 'test:combat', op: 'add', value: '1' })).toEqual([])  // (no weapon host: none)
    expect(hostChanges({ target: 'item:dv', op: 'add', value: '-1' })).toEqual([{ key: 'system.dmg', value: -1, mode: 2 }])
    expect(hostChanges({ target: 'item:ammo', op: 'set', value: '1000' })).toEqual([{ key: 'system.ammocap', value: 1000, mode: 5 }])
    expect(hostChanges({ target: 'item:handling', op: 'add', value: 'R/-R' }, 2)).toEqual([{ key: 'system.handlOn', value: 2, mode: 2 }, { key: 'system.handlOff', value: -2, mode: 2 }])
    expect(hostChanges({ target: 'item:handling', op: 'add', value: '-R' }, 2)).toEqual([{ key: 'system.handlOn', value: -2, mode: 2 }, { key: 'system.handlOff', value: -2, mode: 2 }])
    expect(hostChanges({ target: 'item:top-speed', op: 'add', value: '50' })).toEqual([{ key: 'system.tspd', value: 50, mode: 2 }])
    expect(hostChanges({ target: 'item:top-speed', op: 'add', value: '20%' })).toEqual([])  // (a formula: a note)
    expect(hostChanges({ target: 'matrix:firewall', op: 'add', value: 'R' }, 3)).toEqual([{ key: 'system.f', value: 3, mode: 2 }])
    expect(hostChanges({ target: 'item:concealability', op: 'add', value: '1' })).toEqual([])
    expect(hostChanges({ target: 'item:ar', op: 'add', value: '2,1,-2,0,x' })).toEqual([{ key: 'system.attackRating.0', value: 2, mode: 2 }, { key: 'system.attackRating.1', value: 1, mode: 2 }, { key: 'system.attackRating.2', value: -2, mode: 2 }, { key: 'system.attackRating.4', value: 0, mode: 5 }])  // (a removed band: Eden's no band)
  })
  test('every target the importer produces has a route: an actor effect, a host change or a described line, never unknown', () => {
    // the vocabulary of importer/sr6/effects.py (docs/sr6-data-format.md Effects), one of each
    const targets = ['attr:bod', 'attr:edg', 'attr:ess', 'attr:choice', 'attr-max:str', 'attr-max:choice', 'skill:firearms', 'skill:choice', 'skill:knowledge', 'skill:language',
      'skill-max:choice', 'test:social', 'test:matrix', 'test:magic', 'test:resonance', 'test:combat', 'test:vehicle', 'test:physical', 'test:mental', 'test:attr-cha',
      'test:damage-resistance', 'test:drain-resistance', 'test:fading-resistance', 'test:toxin-resistance', 'test:magic-resistance', 'test:fatigue-resistance', 'test:defense',
      'test:defense-astral', 'test:defense-spell-direct', 'test:defense-spell-indirect', 'derived:matrix-defense', 'limb-attr:str', 'derived:unarmed-ar', 'derived:unarmed-dv', 'derived:unarmed-damage', 'test:surprise',
      'test:crash', 'test:addiction', 'test:spell-illusion', 'test:all', 'test:other', 'derived:defense', 'derived:defense-astral', 'derived:social', 'derived:initiative',
      'derived:initiative-dice', 'derived:matrix-initiative', 'derived:matrix-initiative-dice', 'derived:physical-monitor', 'derived:stun-monitor', 'derived:matrix-monitor',
      'derived:overflow', 'derived:composure', 'derived:judge-intentions', 'derived:memory', 'derived:lift', 'derived:movement', 'derived:minor-actions', 'derived:major-actions',
      'derived:hardened-armor', 'derived:damage-reduction', 'derived:power-points', 'derived:monthly-cost', 'matrix:attack', 'matrix:sleaze', 'matrix:data-processing',
      'matrix:firewall', 'matrix:choice', 'matrix:overwatch', 'item:ar', 'item:dv', 'item:concealability', 'item:handling', 'item:acceleration', 'item:speed-interval',
      'item:top-speed', 'item:body', 'item:armor', 'item:pilot', 'item:sensor', 'item:seats', 'item:size', 'item:ammo', 'action:wrest', 'complex-form:puppeteer',
      'lifestyle:necessities', 'resource:contact-points', 'pricemod:armor', 'pricemod:lifestyle', 'pool:chase', 'sense:thermographic-vision', 'action-max:take-aim']
    const routes = Object.fromEntries(targets.map(t => [t, effectRoute({ target: t, op: 'add', value: '1' })]))
    expect(Object.entries(routes).filter(([, r]) => r === 'unknown')).toEqual([])
    expect(routes['test:drain-resistance']).toBe('actor'); expect(routes['test:fading-resistance']).toBe('actor'); expect(routes['limb-attr:str']).toBe('note'); expect(routes['derived:unarmed-ar']).toBe('actor')
    expect(['derived:unarmed-dv', 'derived:movement'].map(t => routes[t])).toEqual(['actor', 'actor'])
    expect(effectRoute({ target: 'derived:unarmed-damage', op: 'set', value: 'P' })).toBe('actor')
    expect(effectRoute({ target: 'skill:cracking', op: 'set', value: '3' })).toBe('note')  // (a set: shown)
    expect(effectRoute({ target: 'test:attr-wil', op: 'add', value: '1' })).toBe('note')  // (no skill is linked to Willpower)
    expect(['test:defense-astral', 'test:defense-spell-direct', 'test:defense-spell-indirect', 'derived:matrix-defense'].map(t => routes[t])).toEqual(['actor', 'actor', 'actor', 'actor'])
    expect(routes['attr:bod']).toBe('actor'); expect(routes['item:dv']).toBe('host'); expect(routes['sense:thermographic-vision']).toBe('note')
    expect(routes['item:top-speed']).toBe('host'); expect(routes['test:spell-illusion']).toBe('note')
    expect(effectRoute({ target: 'item:top-speed', op: 'add', value: '20%' })).toBe('host')  // (the field exists; a formula stays text)
    for (const op of ['edge', 'edge-cost', 'wild-die', 'hits', 'threshold', 'no-edge']) expect(effectRoute({ target: 'skill:firearms', op, value: '1' })).toBe('note')
  })
})

test('effect targets: Eden’s option key for a path, and the ones Eden lacks', () => {
  expect(effectOptionKey('system.derived.judge_intentions.mod')).toBe('system_derived_judge__intentions_mod')
  const eden = Object.fromEntries(OUR_TARGETS.filter(p => !p.includes('social')).map(p => [effectOptionKey(p), 'x']))
  expect(missingTargets(eden)).toEqual({ system_defenserating_social_mod: 'system.defenserating.social.mod' })
})

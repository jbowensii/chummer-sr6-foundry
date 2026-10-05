// shadowrun6-eden 4.x vocabulary: keys read from its source at tag release-4.0.9 (template.json, module/config.js,
// module/datamodels/*). Keys only: no Eden code or text is copied (Eden is GPL-3; this module is MIT).
export const ATTRS = ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'mag', 'res']  // system.attributes.<k>.base
export const MOR = { full: 'magician', aspected: 'aspectedmagician', 'mystic-adept': 'mysticadept', adept: 'adept', technomancer: 'technomancer', mundane: 'mundane' }
export const SKILLS = ['astral', 'athletics', 'biotech', 'close_combat', 'con', 'conjuring', 'cracking', 'electronics', 'enchanting',
  'engineering', 'exotic_weapons', 'firearms', 'influence', 'outdoors', 'perception', 'piloting', 'sorcery', 'stealth', 'tasking']
export const SPELL_CATEGORIES = ['combat', 'detection', 'health', 'illusion', 'manipulation']
export const normKey = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
export const skillKey = name => { const k = normKey(name); return SKILLS.includes(k) ? k : null }
/** labels: { specKey: label } for one skill, from the Eden localization Foundry loaded (foundry/app.js); matched by label, then by key. */
export function specKey(name, labels = {}) {
  const k = normKey(name), hit = Object.entries(labels).find(([, l]) => normKey(l) === k)
  return hit ? hit[0] : Object.hasOwn(labels, k) ? k : null
}
const first = (rows, s, fallback) => { const t = String(s ?? '').toLowerCase(); const r = rows.find(([re]) => re.test(t)); return r ? { hit: r, known: true } : { hit: fallback, known: false } }
const words = s => String(s ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean)

// [pattern on the catalog category, Eden gear type, subtype, weapon skill] (R: verify on the owner's book in the local check)
const WEAPONS = [
  [/taser/, 'WEAPON_FIREARMS', 'TASERS', 'firearms'], [/hold.?out/, 'WEAPON_FIREARMS', 'HOLDOUTS', 'firearms'],
  [/light pistol/, 'WEAPON_FIREARMS', 'PISTOLS_LIGHT', 'firearms'], [/machine pistol/, 'WEAPON_FIREARMS', 'MACHINE_PISTOLS', 'firearms'],
  [/heavy pistol/, 'WEAPON_FIREARMS', 'PISTOLS_HEAVY', 'firearms'], [/submachine|\bsmg/, 'WEAPON_FIREARMS', 'SUBMACHINE_GUNS', 'firearms'],
  [/shotgun/, 'WEAPON_FIREARMS', 'SHOTGUNS', 'firearms'], [/assault cannon/, 'WEAPON_FIREARMS', 'ASSAULT_CANNON', 'firearms'],
  [/assault rifle/, 'WEAPON_FIREARMS', 'RIFLE_ASSAULT', 'firearms'], [/sniper/, 'WEAPON_FIREARMS', 'RIFLE_SNIPER', 'firearms'],
  [/light machine|\blmg/, 'WEAPON_FIREARMS', 'LMG', 'firearms'], [/medium machine|\bmmg/, 'WEAPON_FIREARMS', 'MMG', 'firearms'],
  [/heavy machine|\bhmg/, 'WEAPON_FIREARMS', 'HMG', 'firearms'], [/rifle/, 'WEAPON_FIREARMS', 'RIFLE_HUNTING', 'firearms'],
  [/blade|sword|knife/, 'WEAPON_CLOSE_COMBAT', 'BLADES', 'close_combat'], [/club|baton|staff/, 'WEAPON_CLOSE_COMBAT', 'CLUBS', 'close_combat'],
  [/whip/, 'WEAPON_CLOSE_COMBAT', 'WHIPS', 'close_combat'], [/unarmed/, 'WEAPON_CLOSE_COMBAT', 'UNARMED', 'close_combat'],
  [/crossbow/, 'WEAPON_RANGED', 'CROSSBOWS', 'athletics'], [/\bbow/, 'WEAPON_RANGED', 'BOWS', 'athletics'],
  [/flame|thrower\b/, 'WEAPON_SPECIAL', 'THROWERS', 'exotic_weapons'], [/grenade|throw/, 'WEAPON_RANGED', 'THROWING', 'athletics'],
  [/launcher|rocket|missile/, 'WEAPON_SPECIAL', 'LAUNCHERS', 'engineering'], [/dart/, 'WEAPON_SPECIAL', 'DART', 'exotic_weapons'],
  [/melee|close/, 'WEAPON_CLOSE_COMBAT', 'OTHER_CLOSE', 'close_combat'],
]
export function weaponType(category) {
  const { hit: [, type, subtype, skill], known } = first(WEAPONS, category, [null, 'WEAPON_SPECIAL', 'OTHER_SPECIAL', 'exotic_weapons'])
  return { type, subtype, skill, known }
}

// Eden gear type ARMOR
const ARMOR = [[/helmet/, 'ARMOR_HELMET'], [/shield/, 'ARMOR_SHIELD'], [/cloth/, 'ARMOR_CLOTHES'], [/social|formal|fashion/, 'ARMOR_SOCIAL']]
export const armorSubtype = category => first(ARMOR, category, [null, 'ARMOR_BODY']).hit[1]

const CYBER = [[/head/, 'CYBER_HEADWARE'], [/eye/, 'CYBER_EYEWARE'], [/ear/, 'CYBER_EARWARE'], [/jack/, 'CYBERJACK'],
  [/limb|\barms?\b|\blegs?\b|\bhands?\b|\bfeet\b|\bfoot\b/, 'CYBER_LIMBS'], [/weapon/, 'CYBER_IMPLANT_WEAPON']]
const BIO = [[/cultured/, 'BIOWARE_CULTURED'], [/weapon/, 'BIOWARE_IMPLANT_WEAPON'], [/dermal|skin/, 'BIOWARE_DERMAL']]
/** type: the catalog's augmentation type (cyberware | bioware). */
export function augmentType(type, category) {
  return /bio/i.test(type ?? '') ? { type: 'BIOWARE', subtype: first(BIO, category, [null, 'BIOWARE_STANDARD']).hit[1] }
    : { type: 'CYBERWARE', subtype: first(CYBER, category, [null, 'CYBER_BODYWARE']).hit[1] }
}

// Eden gear type ELECTRONICS
const ELECTRONICS = [[/commlink/, 'COMMLINK'], [/deck/, 'CYBERDECK'], [/rigger/, 'RIGGER_CONSOLE'], [/rfid|\btags?\b/, 'RFID'],
  [/optic|vision|camera/, 'OPTICAL'], [/audio/, 'AUDIO'], [/sensor/, 'SENSOR_HOUSING'], [/security|lock/, 'SECURITY'],
  [/breaking/, 'BREAKING'], [/\btac/, 'TAC_NET'], [/credstick|credit|\bid\b/, 'ID_CREDIT'], [/comm/, 'COMMUNICATION']]
export const electronicsSubtype = category => first(ELECTRONICS, category, [null, 'ELECTRONIC_ACCESSORIES']).hit[1]

const GEAR = [[/software|program|autosoft/, 'SOFTWARE', 'OTHER_PROGRAMS'], [/magic|formula|lodge|reagent/, 'MAGICAL', 'MAGIC_SUPPLIES'],
  [/chemical|toxin/, 'CHEMICALS', 'INDUSTRIAL_CHEMICALS'], [/medkit|patch|biotech|medical/, 'BIOLOGY', 'BIOTECH'],
  [/survival|climb|grapple/, 'SURVIVAL', 'SURVIVAL_GEAR']]
/** A focus is its own Eden item type; everything else is a gear item. */
export function gearType(category) {
  if (/foci|focus/i.test(category ?? '')) return { item: 'focus', known: true }
  const { hit: [, type, subtype], known } = first(GEAR, category, [null, 'TOOLS', 'TOOLS'])
  return { item: 'gear', type, subtype, known }
}

const DRONES = [[/micro/, 'DRONE_MICRO'], [/mini/, 'DRONE_MINI'], [/small drone/, 'DRONE_SMALL'], [/medium drone/, 'DRONE_MEDIUM'], [/large drone/, 'DRONE_LARGE']]
const DRONE_KIND = [[/\bair|aerial|fly|rotor/, 'AIR'], [/water|aquatic/, 'AQUATIC'], [/anthro/, 'ANTHRO']]
const VEHICLES = [[/bike|motorcycle/, 'BIKES'], [/truck/, 'TRUCKS'], [/\bvans?\b/, 'VANS'], [/\bbus/, 'BUS'], [/boat/, 'BOATS'], [/ship/, 'SHIPS'],
  [/\bsub/, 'SUBMARINES'], [/rotor|helicopter/, 'ROTORCRAFT'], [/vtol|t-bird|thunderbird/, 'VTOL'], [/fixed|plane|\bjet/, 'FIXED_WING'],
  [/hover/, 'HOVERCRAFT'], [/walker/, 'WALKER'], [/\bcars?\b|sedan|coupe/, 'CARS']]
/** Drones by size (the sized types take GROUND/AIR/AQUATIC/ANTHRO); a drone of no known size is DRONES with no subtype. */
export function vehicleType(category) {
  const sized = first(DRONES, category, null)
  if (sized.known) return { type: sized.hit[1], subtype: first(DRONE_KIND, category, [null, 'GROUND']).hit[1], known: true }
  if (/drone/i.test(category ?? '')) return { type: 'DRONES', subtype: '', known: true }
  const { hit: [, subtype], known } = first(VEHICLES, category, [null, 'SPECIAL_VEHICLES'])
  return { type: 'VEHICLES', subtype, known }
}

const RANGE = { 'LOS(A)': 'line_of_sight_area', LOS: 'line_of_sight', T: 'touch', 'S(A)': 'self_area', S: 'self' }
const DURATION = { i: 'instantaneous', instant: 'instantaneous', instantaneous: 'instantaneous', s: 'sustained', sustained: 'sustained',
  p: 'permanent', permanent: 'permanent', l: 'limited', limited: 'limited', always: 'always' }
export const durationKey = s => DURATION[normKey(s)] ?? 'special'
/** A printed range (LOS, LOS(A), T, S, S(A)) -> Eden's spell_range key; unknown -> self (Eden's default). */
export const rangeKey = s => RANGE[String(s ?? '').toUpperCase().replace(/\s+/g, '')] ?? 'self'
/** A spell's Eden fields from its printed attrs and Chummer's values. An unknown category is health (the caller reports it). */
export function spellFields(attrs = {}, values = {}) {
  const cat = String(attrs.category ?? '').toLowerCase(), duration = durationKey(attrs.duration), tags = String(attrs.tags ?? '').toLowerCase()
  return {
    category: SPELL_CATEGORIES.includes(cat) ? cat : 'health',
    range: rangeKey(attrs.range),
    type: /^\s*m/i.test(attrs.type ?? '') ? 'mana' : 'physical',
    duration,
    damage: /^\s*s/i.test(attrs.damage ?? '') ? 'stun' : 'physical',
    drain: values.drain ?? 0,
    combatSpellType: /indirect/.test(tags) ? 'spells_indirect' : /direct/.test(tags) ? 'spells_direct' : 'spells_indirect',
    isSustained: duration === 'sustained',
  }
}
export const activationKey = s => (/major/i.test(s ?? '') ? 'major_action' : /minor/i.test(s ?? '') ? 'minor_action' : 'passive')

const LIFESTYLES = ['street', 'squatter', 'low', 'middle', 'high', 'luxury']
export const lifestyleKey = name => { const w = words(name); return LIFESTYLES.find(k => w.includes(k)) ?? null }

const FAKE_SIN = ['ANYONE', 'ROUGH_MATCH', 'GOOD_MATCH', 'SUPERFICIALLY_PLAUSIBLE', 'HIGHLY_PLAUSIBLE', 'SECOND_LIFE']
export const sinQuality = (kind, rating) => (kind === 'real' ? 'REAL_SIN' : FAKE_SIN[rating - 1] ?? 'ANYONE')

// Eden SPIRIT_TYPES keys (masterShedim left out: no one-word name) and sprite types
const SPIRITS = ['air', 'beasts', 'earth', 'fire', 'kin', 'water', 'plant', 'guardian', 'guidance', 'task', 'blood', 'caretaker', 'nymph', 'scout',
  'soldier', 'worker', 'queen', 'alpha', 'abomination', 'barren', 'noxious', 'nuclear', 'plague', 'sludge', 'shadow', 'shedim', 'zonbi']
const SPIRIT_ALIAS = { beast: 'beasts', man: 'kin', men: 'kin' }
const SPRITES = ['courier', 'crack', 'data', 'fault', 'machine', 'assassin', 'defender', 'modular', 'music', 'primal']
const wordKey = (keys, alias = {}) => name => {
  for (const w of words(name)) for (const c of [w, w.replace(/s$/, '')]) { const k = alias[c] ?? c; if (keys.includes(k)) return k }
  return null
}
export const spiritKey = wordKey(SPIRITS, SPIRIT_ALIAS)
export const spriteKey = wordKey(SPRITES)

// Eden 4.x `software` item (a data-model type): its system.type keys. Chummer's program type is printed ("basic",
// "hacking", …); an unknown one is STANDARD (the caller reports it).
const SOFTWARE = [[/hack/, 'HACKING'], [/auto/, 'AUTOSOFT'], [/data/, 'DATASOFT'], [/map/, 'MAPSOFT'], [/shop/, 'SHOPSOFT'],
  [/talent|skill|active|know|lingua/, 'TALENTSOFT'], [/teach|tutor/, 'TEACHSOFT'], [/\bic\b|intrusion/, 'IC'], [/basic|common|standard/, 'STANDARD']]
export function softwareType(type) {
  const { hit: [, key], known } = first(SOFTWARE, type, [null, 'STANDARD'])
  return { type: key, known }
}

// Eden martialartstyle system.category flags, from Chummer's printed categories ("Grappling, Weapon")
const MARTIAL = ['grappling', 'mobility', 'ranged', 'striking', 'weapon']
export const martialCategories = printed => { const w = words(printed).map(x => x.replace(/s$/, '')); return Object.fromEntries(MARTIAL.map(c => [c, w.includes(c)])) }

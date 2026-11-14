// The Nova Prime Chummer sheet's view model (foundry/sheet.js, templates/sheet/*.hbs): Eden's PREPARED actor data (after
// its effects and derived numbers) laid out the way the app's SR6 print sheet shows it (Nova Prime Chummer
// src/sr6/print/ui/Sheet.tsx: header, attribute strip, skills, languages and knowledge, qualities, condition monitors,
// derived, karma and nuyen, weapons, armor, augmentations, magic or resonance, gear, contacts, SINs and lifestyles,
// effects, vehicles and drones, critters). No Foundry here: foundry/sheet.js hands it plain data, so vitest runs it.
// What the app has and Eden lacks the import stores in our flags; they are only shown here (the panels edit them).
import { MODULE_ID } from './constants.js'

export const ATTRS = ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha']
// the app's ATTR_NAMES (runner-builder/ui/editor.ts)
export const ATTR_NAMES = { bod: 'Body', agi: 'Agility', rea: 'Reaction', str: 'Strength', wil: 'Willpower', log: 'Logic',
  int: 'Intuition', cha: 'Charisma', edg: 'Edge', mag: 'Magic', res: 'Resonance' }
// Eden's mortype (config.js MOR_DEFINITIONS): magic, resonance, spells, powers
const MOR = { mundane: [false, false, false, false], magician: [true, false, true, false], mysticadept: [true, false, true, true],
  technomancer: [false, true, false, false], adept: [true, false, false, true], aspectedmagician: [true, false, true, false] }
const MOR_LABELS = { magician: 'Magician', mysticadept: 'Mystic adept', technomancer: 'Technomancer', adept: 'Adept', aspectedmagician: 'Aspected magician' }
const AUGMENT = new Set(['CYBERWARE', 'BIOWARE', 'NANOWARE', 'GENETICS'])
const isVehicleType = t => t === 'VEHICLES' || t === 'DRONES' || /^DRONE_/.test(t ?? '')
// what the Magic or Resonance block lists, in the app's PICKS order
const PICKS = [['spell', 'Spell'], ['ritual', 'Ritual'], ['adeptpower', 'Adept power'], ['complexform', 'Complex form'],
  ['metamagic', 'Metamagic'], ['echo', 'Echo'], ['focus', 'Focus'], ['martialartstyle', 'Martial art'], ['martialarttech', 'Technique']]
const ROLL = { spell: 'spell-roll', ritual: 'ritual-roll', complexform: 'complexform-roll' }

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const text = v => (v == null ? '' : String(v))
const byName = (a, b) => text(a.name).localeCompare(text(b.name))
const flagOf = d => d?.flags?.[MODULE_ID] ?? {}
const boxes = (max, filled) => Array.from({ length: Math.max(0, num(max)) }, (_, i) => ({ n: i + 1, filled: i < num(filled) }))
// Eden's Attack Ratings: -1 (or 0 / null) is "-" (helper.js attackrating)
export const arText = ar => (Array.isArray(ar) ? ar.map(v => (v == null || num(v) <= 0 ? '–' : String(v))).join('/') : '')
const dvText = (dv, stun) => (dv == null || dv === '' ? '' : `${dv}${stun ? 'S' : 'P'}`)
// a flag value we only show (the panels' data: a string, number, or an object with a name or label)
export function shown(v) {
  if (v == null || v === '' || v === false) return ''
  if (v === true) return 'Yes'
  if (typeof v !== 'object') return String(v)
  if (Array.isArray(v)) return v.map(shown).filter(Boolean).join(', ')
  if (v.name || v.label) return text(v.name ?? v.label)
  return Object.entries(v).filter(([, x]) => x != null && x !== '' && typeof x !== 'object').map(([k, x]) => `${k} ${x}`).join(', ')
}

/**
 * actor: { name, img, type, system (prepared), source (actor._source.system), flags, traits,
 *          items: [{ id, uuid, name, type, system, flags, ar, dmg, stun }] (ar/dmg/stun: Eden's calculated getters),
 *          effects: [{ id, name, disabled, source }], critters: [{ id, uuid, name }] }
 * deps:  { localize(key), skillAttr(id) -> 'agi', specLabel(skill, key) }
 */
export function sheetView(actor, deps = {}) {
  const sys = actor.system ?? {}, src = actor.source ?? {}, at = sys.attributes ?? {}
  const loc = deps.localize ?? (k => k), skillAttr = deps.skillAttr ?? (() => ''), specLabel = deps.specLabel ?? ((s, k) => k)
  const [magic, resonance, spells, powers] = MOR[sys.mortype] ?? MOR.mundane
  const items = [...(actor.items ?? [])].sort(byName)
  const of = type => items.filter(i => i.type === type)
  const installedIn = i => i.system?.installedIn?.id ?? null
  const accessoriesOf = w => [...items.filter(i => installedIn(i) === w.id).map(i => i.name), ...(w.system?.accessories ? [text(w.system.accessories)] : [])]

  const attr = k => ({ key: k, label: ATTR_NAMES[k], value: num(at[k]?.pool), base: num(src.attributes?.[k]?.base ?? at[k]?.base),
    field: `system.attributes.${k}.base` })
  const magRes = resonance ? attr('res') : magic ? attr('mag') : null

  // every Eden skill (tasking only for a technomancer, as Eden's own sheet), untrained ones dimmed
  const skills = Object.entries(sys.skills ?? {})
    .filter(([id]) => id !== 'tasking' || sys.mortype === 'technomancer')
    .map(([id, s]) => {
      const rank = num(src.skills?.[id]?.points ?? s.points), a = skillAttr(id)
      return { id, label: loc(`skill.${id}`), rank, attr: text(a).toUpperCase(), dice: num(s.pool), untrained: !rank,
        field: `system.skills.${id}.points`,
        spec: s.specialization ? { key: s.specialization, label: loc(specLabel(id, s.specialization)), dice: num(s.poolS) } : null,
        expertise: s.expertise ? { key: s.expertise, label: loc(specLabel(id, s.expertise)), dice: num(s.poolE) } : null }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const skillItems = of('skill')
  const LANG = { 1: '', 2: 'specialist', 3: 'expert', 4: 'native' }
  const languages = skillItems.filter(i => i.system?.genesisID === 'language')
    .map(i => ({ id: i.id, name: i.name, detail: LANG[num(i.system?.points)] ?? '' }))
  const knowledge = skillItems.filter(i => i.system?.genesisID === 'knowledge').map(i => ({ id: i.id, name: i.name }))
  const qualities = of('quality').map(i => ({ id: i.id, name: i.name,
    level: i.system?.level && num(i.system?.value) ? num(i.system.value) : null, detail: text(i.system?.explain) }))

  const mon = (m, cls) => ({ max: num(m?.max), dmg: num(m?.dmg), cls, boxes: boxes(m?.max, m?.dmg) })
  const monitors = { physical: mon(sys.physical, ''), stun: mon(sys.stun, 's'), overflow: mon(sys.overflow, 'i'),
    edge: { max: num(sys.edge?.max), value: num(sys.edge?.value), boxes: boxes(sys.edge?.max, sys.edge?.value) } }

  const ini = i => (i ? `${num(i.pool ?? i.base)} + ${num(i.dicePool ?? i.dice)}D6` : null)
  const pool = p => (p?.pool == null ? null : num(p.pool))
  const tr = actor.traits ?? {}
  const derived = [
    ['Initiative', ini(sys.initiative?.physical)],
    ['Astral initiative', magic ? ini(sys.initiative?.astral) : null],
    ['Matrix initiative', ini(sys.initiative?.matrix)],
    ['Defense Rating', pool(sys.defenserating?.physical)],
    ['Social Rating', pool(sys.defenserating?.social)],
    ['Composure', pool(sys.derived?.composure), 'composure'],
    ['Judge Intentions', pool(sys.derived?.judge_intentions), 'judge_intentions'],
    ['Memory', pool(sys.derived?.memory), 'memory'],
    ['Lift/Carry', pool(sys.derived?.lift_carry), 'lift_carry'],
    ['Drain', magic ? pool(sys.defensepool?.drain) : null],
    ['Fading', resonance ? pool(sys.defensepool?.fading) : null],
    ['Spell Attack Rating', spells ? pool(sys.attackrating?.astral) : null],
    ['Movement', tr.movementRate != null ? `${tr.movementRate} m / Sprint ${num(tr.movementSprintBase)} m +${num(tr.movementSprintMultiplier)} a hit` : null],
  ].filter(([, v]) => v != null && v !== '').map(([label, value, rollId]) => ({ label, value, rollId: rollId ?? null }))

  const gearOf = items.filter(i => i.type === 'gear')
  const weapons = gearOf.filter(i => /^WEAPON/.test(text(i.system?.type)))
    .sort((a, b) => (b.system?.genesisID === 'unarmed') - (a.system?.genesisID === 'unarmed'))
    .map(i => {
      const f = flagOf(i), alt = f.meleeAlternate
      return { id: i.id, uuid: i.uuid, name: i.name, dv: dvText(i.dmg ?? i.system?.dmg, i.stun ?? i.system?.stun), ar: arText(i.ar ?? i.system?.attackRating),
        pool: num(i.system?.pool) + num(i.system?.modes?.dicePoolMod), skill: text(i.system?.skill), spec: text(i.system?.skillSpec),
        ammo: num(i.system?.ammocap) > 0 ? `${num(i.system.ammocount)}/${num(i.system.ammocap)}` : '',
        accessories: accessoriesOf(i).join(', '),
        ammoTypes: (Array.isArray(f.ammoTypes) ? f.ammoTypes : []).map(t => ({ name: text(t.name), dv: dvText(t.dv, t.stun), ar: arText(t.ar),
          active: f.ammoActive != null && (f.ammoActive === t.id || f.ammoActive === t.name) })),
        melee: alt ? { dv: dvText(alt.dv, alt.stun), ar: arText(alt.ar), skill: text(alt.spec || alt.skill) } : null }
    })
  const armor = gearOf.filter(i => i.system?.type === 'ARMOR' && !installedIn(i))
    .map(i => ({ id: i.id, name: i.name, defense: num(i.system?.defense), social: num(i.system?.social), worn: !!i.system?.usedForPool,
      accessories: accessoriesOf(i).join(', ') }))
  const augmentations = gearOf.filter(i => AUGMENT.has(i.system?.type))
    .map(i => ({ id: i.id, name: i.name, rating: num(i.system?.rating) || null, essence: num(i.system?.essence).toFixed(2), accessories: accessoriesOf(i).join(', ') }))
  const vehicles = gearOf.filter(i => isVehicleType(i.system?.type)).map(i => {
    const s = i.system ?? {}
    return { id: i.id, name: i.name, handling: `${num(s.handlOn)}/${num(s.handlOff)}`, body: num(s.bod), armor: num(s.arm), pilot: num(s.pil), sensor: num(s.sen),
      dronePools: (Array.isArray(flagOf(i).dronePools) ? flagOf(i).dronePools : [])
        .map(p => ({ mode: p.mode === 'rcc' ? 'RCC' : 'Autonomous', test: text(p.test), autosoft: text(p.autosoft), pool: num(p.pool) })) }
  })
  const listed = new Set([...weapons, ...armor, ...augmentations, ...vehicles].map(x => x.id))
  const gear = [...gearOf, ...of('software')].filter(i => !listed.has(i.id) && !installedIn(i))
    .map(i => ({ id: i.id, name: i.name, qty: num(i.system?.count) > 1 ? num(i.system.count) : null, rating: num(i.system?.rating) || null }))

  const picks = (magic || resonance) ? PICKS.flatMap(([type, label]) => of(type).map(i => ({ id: i.id, name: i.name, kind: label,
    level: type === 'focus' ? num(i.system?.rating) || null : i.system?.hasLevel ? num(i.system.level) : null,
    roll: ROLL[type] ?? null }))) : []
  const m = sys.attributes ?? {}
  const magicBlock = (magic || resonance) ? {
    title: resonance ? 'Resonance' : 'Magic',
    summary: [spells && sys.tradition?.name && `Tradition: ${sys.tradition.name}`, magic && pool(sys.defensepool?.drain) != null && `Drain ${pool(sys.defensepool.drain)}`,
      resonance && pool(sys.defensepool?.fading) != null && `Fading ${pool(sys.defensepool.fading)}`,
      num(m.mag?.initiation) > 0 && `Initiation grade ${num(m.mag.initiation)}`, num(m.res?.submersion) > 0 && `Submersion grade ${num(m.res.submersion)}`]
      .filter(Boolean).join(' · '),
    picks,
  } : null

  const contacts = of('contact').map(i => ({ id: i.id, name: text(i.system?.name) || i.name || 'Contact', type: text(i.system?.type),
    connection: num(i.system?.rating), loyalty: num(i.system?.loyalty) }))
  // (quality: Eden's SIN_QUALITY key, localized in the template as Eden's section-sins.html does)
  const sins = of('sin').map(i => ({ id: i.id, name: i.name, quality: text(i.system?.quality) }))
  const lifestyles = of('lifestyle').map(i => ({ id: i.id, name: i.name, type: text(i.system?.type) }))
  const effects = (actor.effects ?? []).map(e => ({ id: e.id, name: text(e.name), from: text(e.source), disabled: !!e.disabled }))
  const af = flagOf(actor)

  return {
    header: { name: text(actor.name), img: actor.img, metatype: text(sys.metatype), gender: text(sys.gender), mortype: sys.mortype ?? 'mundane',
      role: [sys.metatype, sys.gender, MOR_LABELS[sys.mortype]].filter(Boolean).join(', '),
      realName: text(sys.name), showReal: !!sys.name && sys.name !== actor.name },
    attrs: ATTRS.map(attr), edge: { label: 'Edge', value: num(sys.edge?.max), field: 'system.edge.max' }, magRes,
    essence: num(sys.essence).toFixed(2),
    skills, languages, knowledge, qualities, monitors, derived,
    karma: num(sys.karma), karmaTotal: num(sys.karma_total), nuyen: num(sys.nuyen),
    weapons, armor, augmentations, magic: magicBlock, gear, contacts, sins, lifestyles, effects, vehicles,
    critters: [...(actor.critters ?? [])].sort(byName).map(c => ({ id: c.id, uuid: c.uuid, name: c.name })),
    extras: [['Design', shown(af.design)], ['Approved', shown(af.approved)], ['Rigging', shown(af.rigging)], ['Animal form', shown(af.animalForm)]]
      .filter(([, v]) => v).map(([label, value]) => ({ label, value })),
  }
}

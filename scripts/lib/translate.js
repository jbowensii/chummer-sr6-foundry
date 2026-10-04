// One Chummer SR6 runner (chummer-anarchy2 docs/sr6-export-format.md) -> shadowrun6-eden 4.x document data. Pure: no Foundry calls.
// Raw inputs only (attribute bases, skill points, items with their fields): Eden derives pools, monitors, initiative and essence.
import { MODULE_ID } from './constants.js'
import { iconFor, itemIconKey, npcIconKey, withIcon } from './icons.js'
import {
  ATTRS, MOR, SKILLS, SPELL_CATEGORIES, activationKey, armorSubtype, augmentType, durationKey, electronicsSubtype, gearType,
  lifestyleKey, normKey, rangeKey, sinQuality, skillKey, specKey, spellFields, spiritKey, spriteKey, vehicleType, weaponType,
} from './eden.js'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
// Plain text -> HTML: escaped, one <p> per paragraph (blank-line separated).
export const escapeText = s => String(s ?? '').split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${p.replace(/[&<>"']/g, c => ESC[c])}</p>`).join('')

const num = v => (Number.isFinite(v) ? v : 0)
const yes = v => v === true || v === 'true'
// flags.icon on every item, and img when the index (ctx.icons: Set or array, or null for none) has an icon for it
const icon = (doc, x, ctx) => withIcon(doc, itemIconKey(doc), x?.source ?? null, ctx.icons ?? null)
const iconSet = i => (i ? new Set(i) : null)

// Augmentation bonuses -> ActiveEffect changes Eden applies itself (mode 2 = ADD). Edge: Eden's own effect key for the
// template actors (Player, NPC, Critter, Spirit) is system.edge.max (config.js ACTIVE_EFFECT_OPTIONS); Eden moves it to
// system.edge.mod itself for its data-model actors (EFFECT_CONVERSION_TOV2). Initiative dice: diceMod, which Eden adds to
// dice into initiative.physical.dicePool, the number its initiative roll uses (dice itself stays the base).
const BONUS_KEY = t => (t === 'initDice' ? 'system.initiative.physical.diceMod' : t === 'edg' ? 'system.edge.max' : `system.attributes.${t}.mod`)
export const bonusChanges = bonuses => (bonuses ?? []).filter(b => b.target === 'initDice' || b.target === 'edg' || ATTRS.includes(b.target))
  .map(b => ({ key: BONUS_KEY(b.target), value: String(num(b.value)), mode: 2 }))

const ref = x => (x.source ? `Chummer: ${x.source}${x.page ? ` p.${x.page}` : ''}` : 'Chummer: custom item')
// The fields every item carries: Eden's genesis template, our flags, the description with the entry's text and its source
// (ctx.ref: a book's "See SRC p.N" in place of the runner's "Chummer: SRC p.N").
export function base(x, type, ctx, extra = []) {
  return {
    name: x.name, type,
    flags: { [MODULE_ID]: { id: x.uid ?? x.id, catalogId: x.id ?? null, source: x.source ?? null, page: x.page ?? null, canon: !!x.canon,
      exportedAt: ctx.exportedAt, appVersion: ctx.appVersion } },
    system: { genesisID: '', product: x.source ?? '', page: x.page ?? 0,
      description: ctx.sanitize(x.description) + extra.filter(Boolean).map(t => ctx.sanitize(t)).join('') + ctx.sanitize((ctx.ref ?? ref)(x)) },
  }
}
const withEffects = (doc, x) => {
  const changes = bonusChanges(x.bonuses)
  if (changes.length) doc.effects = [{ name: x.name, transfer: true, disabled: false, changes }]
  return doc
}
const unknown = (ctx, x, what) => ctx.say(`${x.name}: ${what}`)

/**
 * One purchase -> Eden item data (gear or focus); accessories are the caller's. ctx: { exportedAt, appVersion, sanitize, say(line) }.
 * Every gear item carries price/avail as Chummer's numbers and as printed, the count and the rating.
 */
export function lineItem(p, ctx) {
  const a = p.attrs ?? {}, v = p.values ?? {}, rating = v.rating
  const extra = [p.grade && `Grade: ${p.grade}`, p.note]
  let gear
  switch (p.kind) {
    case 'weapons': {
      const w = weaponType(a.category)
      if (!w.known) unknown(ctx, p, `weapon category "${a.category ?? ''}" not known → ${w.type}/${w.subtype}`)
      const modes = v.modes ?? []
      gear = { type: w.type, subtype: w.subtype, skill: w.skill, dmg: num(v.dv), stun: !!v.stun, dmgDef: a.dv ?? '',
        attackRating: [0, 1, 2, 3, 4].map(i => num(v.ar?.[i])), modes: Object.fromEntries(['SS', 'SA', 'BF', 'FA'].map(m => [m, modes.includes(m)])),
        ammocap: num(v.ammo) }
      break
    }
    case 'armor': gear = { type: 'ARMOR', subtype: armorSubtype(a.category), defense: num(v.defense) }; break
    case 'augmentations': gear = { ...augmentType(a.type, a.category), essence: num(v.essence), capacity: num(v.capacity) }; break
    case 'electronics':
      gear = { type: 'ELECTRONICS', subtype: electronicsSubtype(a.category) }
      extra.push(a.array && `Array: ${a.array}`, a.programs && `Programs: ${a.programs}`)
      break
    case 'gear': {
      const g = gearType(a.category)
      if (g.item === 'focus') return focus(p, ctx, extra)
      if (!g.known) unknown(ctx, p, `gear category "${a.category ?? ''}" not known → ${g.type}/${g.subtype}`)
      gear = { type: g.type, subtype: g.subtype }
      break
    }
    case 'vehicles': {
      const t = vehicleType(a.category), x = v.vehicle ?? {}
      if (!t.known) unknown(ctx, p, `vehicle category "${a.category ?? ''}" not known → ${t.type}/${t.subtype}`)
      gear = { type: t.type, subtype: t.subtype, handlOn: num(x.handling?.[0]), handlOff: num(x.handling?.[1]), accOn: num(x.accel?.[0]),
        accOff: num(x.accel?.[1]), spdiOn: num(x.interval?.[0]), spdiOff: num(x.interval?.[1]), tspd: num(x.topSpeed), bod: num(x.body),
        arm: num(x.armor), pil: num(x.pilot), sen: num(x.sensor), sea: num(x.seats) }
      break
    }
    default:
      unknown(ctx, p, `kind ${p.kind} not known → gear TOOLS`)
      gear = { type: 'TOOLS', subtype: 'TOOLS' }
  }
  const doc = base(p, 'gear', ctx, extra), qty = p.qty ?? 1
  Object.assign(doc.system, gear, { price: num(v.cost), priceDef: a.cost ?? '', avail: num(v.avail), availDef: a.avail ?? '',
    count: qty, countable: qty > 1, needsRating: rating != null, rating: num(rating) })
  return icon(withEffects(doc, p), p, ctx)
}
function focus(p, ctx, extra) {
  const doc = base(p, 'focus', ctx, extra)
  doc.system.rating = num(p.values?.rating)
  return icon(withEffects(doc, p), p, ctx)
}

const RITUAL_FEATURES = ['anchored', 'material_link', 'minion', 'spell', 'spotter']
/** A spell, ritual, adept power, complex form, metamagic or echo (x.pick: its kind) -> Eden item data. */
export function pickItem(x, ctx) {
  const a = x.attrs ?? {}, v = x.values ?? {}
  const type = { spells: 'spell', rituals: 'ritual', adeptpowers: 'adeptpower', complexforms: 'complexform', metamagics: 'metamagic', echoes: 'echo' }[x.pick]
  const doc = base(x, type, ctx)
  if (type === 'spell') {
    Object.assign(doc.system, spellFields(a, v))
    if (!SPELL_CATEGORIES.includes(String(a.category ?? '').toLowerCase())) unknown(ctx, x, `spell category "${a.category ?? ''}" not known → health`)
  } else if (type === 'ritual') {
    const kw = String(a.keywords ?? '').split(',').map(normKey)
    Object.assign(doc.system, { threshold: num(v.threshold), features: Object.fromEntries(RITUAL_FEATURES.map(f => [f, kw.includes(f)])) })
  } else if (type === 'adeptpower') {
    Object.assign(doc.system, { hasLevel: yes(a.perLevel), level: num(x.level), cost: num(v.powerCost), activation: activationKey(a.activation) })
  } else if (type === 'complexform') {
    Object.assign(doc.system, { duration: durationKey(a.duration), fading: num(v.fade) })
  }
  return icon(withEffects(doc, x), x, ctx)
}

/** A quality ({ positive, free?, level?, note? } on a runner; a book's entry sets positive from attrs.kind) -> Eden item data. */
export function qualityItem(q, ctx) {
  const doc = base(q, 'quality', ctx, [q.free && 'Metatype trait.'])
  Object.assign(doc.system, { category: q.positive ? 'ADVANTAGE' : 'DISADVANTAGE', level: yes(q.attrs?.perLevel), value: num(q.level), explain: q.note ?? '' })
  return icon(doc, q, ctx)
}
/** A critter power entry's Eden fields (Eden's critterpower sheet: type, action, range, duration). */
export function critterPowerFields(e) {
  const a = e.attrs ?? {}
  return { type: /^\s*m/i.test(a.type ?? '') ? 'mana' : 'physical', action: activationKey(a.action), range: rangeKey(a.range), duration: durationKey(a.duration) }
}

// Everything a runner file holds as items, for runners and NPCs alike (an NPC's build is usually blank).
function runnerItems(r, ctx) {
  const { sanitize } = ctx, items = []
  const flag = id => ({ [MODULE_ID]: { id, exportedAt: ctx.exportedAt, appVersion: ctx.appVersion } })
  for (const k of r.knowledge ?? [])
    items.push(icon({ name: k.name, type: 'skill', flags: flag(`${k.kind}:${k.name}`),
      system: { genesisID: k.kind === 'language' ? 'language' : 'knowledge', points: k.native ? 4 : num(k.rank) } }, k, ctx))

  for (const q of r.qualities ?? []) items.push(qualityItem(q, ctx))
  for (const p of r.picks ?? []) items.push(pickItem(p, ctx))

  const addLine = (p, parent) => {
    const doc = lineItem(p, ctx)
    if (parent) doc.system.description += sanitize(`Fitted to ${parent.name}.`)
    items.push(doc)
    for (const a of p.accessories ?? []) addLine(a, p)
  }
  for (const p of r.purchases ?? []) addLine(p)

  for (const c of r.contacts ?? [])
    items.push(icon({ name: c.name, type: 'contact', flags: flag(c.uid),
      system: { genesisID: '', rating: num(c.connection), loyalty: num(c.loyalty), type: c.archetype ?? '' } }, c, ctx))
  if (r.lifestyle) {
    const l = r.lifestyle, key = lifestyleKey(l.name)
    if (!key) ctx.say(`Lifestyle ${l.name}: not a shadowrun6-eden lifestyle → middle`)
    items.push(icon({ name: l.name, type: 'lifestyle', flags: flag(l.id),
      system: { genesisID: '', type: key ?? 'middle', paid: num(l.months), cost: num(l.cost) } }, l, ctx))
  }
  for (const s of r.sins ?? [])
    items.push(icon({ name: s.name, type: 'sin', flags: flag(s.uid),
      system: { genesisID: '', quality: sinQuality(s.kind, s.rating),
        description: sanitize((s.licences ?? []).map(l => `Licence: ${l.name} (rating ${l.rating})`).join('\n\n')) } }, s, ctx))
  return items
}
const noSkills = () => Object.fromEntries(SKILLS.map(k => [k, { points: 0, specialization: '', expertise: '' }]))

/**
 * sanitize: PLAIN TEXT -> safe HTML (callers wrap Foundry's cleaner around escapeText, never replace it).
 * specs: { [edenSkill]: { [specKey]: label } } from the Eden localization Foundry loaded. icons: icons/index.json (M5).
 * A runner with an npc block is an NPC, critter, spirit or sprite (translateNpc).
 */
export function translateRunner(r, opts) {
  if (r.npc) return translateNpc(r, opts)
  const { exportedAt, appVersion, sanitize = escapeText, icons = null, specs = {} } = opts
  const name = r.streetName || r.realName || 'Runner', lines = []
  const ctx = { exportedAt, appVersion, sanitize, icons: iconSet(icons), say: t => lines.push(t) }
  const flag = id => ({ [MODULE_ID]: { id, exportedAt, appVersion } })

  // every Eden skill key, 0 when the runner has none of it (so Replace clears a skill dropped in Chummer)
  const skills = noSkills()
  for (const s of r.skills ?? []) {
    const key = skillKey(s.name) ?? skillKey(s.id)
    if (!key) { ctx.say(`${s.name} ${num(s.rank)}: not a shadowrun6-eden skill → notes`); continue }
    const pick = (spec, what) => {
      if (!spec) return ''
      const k = specKey(spec, specs[key])
      if (!k) ctx.say(`${s.name}: ${what} ${spec} → notes`)
      return k ?? ''
    }
    skills[key] = { points: num(s.rank), specialization: pick(s.spec, 'specialization'), expertise: pick(s.expertise, 'expertise') }
  }
  if (r.magic?.aspectedSkill) ctx.say(`Aspected magician: ${r.magic.aspectedSkill} → notes`)
  const items = runnerItems(r, ctx)

  const d = r.derived, init = i => (i ? `${i.base}${i.dice != null ? ` + ${i.dice}D6` : ''}` : '')
  const facts = d ? [`Initiative ${init(d.initiative)}${d.astralInit ? `, astral ${init(d.astralInit)}` : ''}`,
    `Condition monitors: physical ${d.monitors?.physical ?? '—'}, stun ${d.monitors?.stun ?? '—'}, overflow ${d.monitors?.overflow ?? '—'}`,
    `Defense Rating ${d.defenseRating}`] : []
  const m = r.magic ?? {}
  const actor = {
    name, type: 'Player', flags: flag(r.id), prototypeToken: { actorLink: true },
    system: {
      name: r.realName ?? '', metatype: r.metatype?.name ?? '', mortype: MOR[m.kind] ?? 'mundane',
      nuyen: Math.max(0, Math.trunc(num(r.nuyen))), karma: Math.max(0, Math.trunc(num(r.karma))),
      attributes: Object.fromEntries(ATTRS.map(k => [k, { base: num(r.attributes?.[k]?.natural) }])),
      edge: { max: num(r.attributes?.edg?.natural) },
      tradition: { name: m.tradition ?? '', attribute: m.drainAttr ?? 'log' },
      skills,
      description: sanitize(r.background),
      notes: sanitize(r.notes) + '<h3>From Chummer</h3>' + sanitize([...lines, ...facts].join('\n\n')),
    },
  }
  actor.system.attributes.mag.initiation = num(m.initiation)
  actor.system.attributes.res.submersion = num(m.submersion)
  return { actor, items, textOnly: lines.map(t => `${name}: ${t}`) }
}

// NPCs (Chummer's src/sr6/engine/npc.ts): kind -> [Eden actor type, headline label, rating label].
const KINDS = { grunt: ['NPC', 'Grunt', 'Professional Rating'], critter: ['Critter', 'Critter'], spirit: ['Spirit', 'Spirit', 'Force'],
  sprite: ['sprite', 'Sprite', 'Level'] }
const PART_LABELS = { skills: 'Skills', powers: 'Powers', optionalPowers: 'Optional powers', weaknesses: 'Weaknesses', attacks: 'Attacks',
  augmentations: 'Augmentations', gear: 'Gear', weapons: 'Weapons' }
/** "Grunt, Professional Rating 3 · Made-up Crew", "Spirit, Force 4", "Critter" (as Chummer's npcHeadline). */
export function npcHeadline(n) {
  const [, label = n.kind, rating] = KINDS[n.kind] ?? []
  return [label, rating && n.rating != null && `${rating} ${n.rating}`].filter(Boolean).join(', ') + (n.kind === 'grunt' && n.group ? ` · ${n.group}` : '')
}
/** A line split on its top-level commas: "Glow (fire, light), Bite" -> ["Glow (fire, light)", "Bite"]. */
export function splitTop(s) {
  const out = ['']
  let depth = 0
  for (const c of String(s ?? '')) {
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1)
    if (c === ',' && !depth) out.push(''); else out[out.length - 1] += c
  }
  return out.map(x => x.trim()).filter(Boolean)
}
const intOf = s => (/^\s*-?\d+\s*$/.test(s?.value ?? '') ? Number(s.value) : null)

/**
 * An NPC block (C1's runner.npc, or a book being's entry.npc) -> Eden actor data; book beings use it too (books.js).
 * flags: the actor's flags ({ [MODULE_ID]: { id, exportedAt, appVersion, … } }); powers: { [normKey(name)]: entry } of the
 * file's critterpowers, for their fields. Returns { actor, items, lines } (report lines, not prefixed). GM-only facts go in
 * system.notes; the token is hostile and unlinked; system.description is the caller's.
 */
export function beingActor(npc, { name, flags, sanitize = escapeText, icons = null, powers = {} }) {
  const f = flags[MODULE_ID], lines = [], items = []
  const ctx = { exportedAt: f.exportedAt, appVersion: f.appVersion, sanitize, icons: iconSet(icons), say: t => lines.push(t) }
  const known = Object.hasOwn(KINDS, npc.kind), [type] = KINDS[known ? npc.kind : 'grunt']
  const stat = Object.fromEntries((npc.stats ?? []).map(s => [s.key, s])), int = k => intOf(stat[k])
  const rating = npc.rating ?? 1, system = {}

  if (!known || npc.kind === 'grunt' || npc.kind === 'critter') {
    // raw inputs: integer stats only ("2D6", or a formula Chummer couldn't read, stays in the notes)
    system.attributes = Object.fromEntries(ATTRS.filter(k => int(k) != null).map(k => [k, { base: int(k) }]))
    if (int('edg') != null) system.edge = { max: int('edg') }
    system.skills = noSkills()
    for (const p of npc.pools ?? []) {
      const key = skillKey(p.name)
      if (key) system.skills[key] = { points: num(p.rating), specialization: '', expertise: '' }
      else ctx.say(`${p.printed}: not a shadowrun6-eden skill → notes`)
    }
  }
  if (!known || npc.kind === 'grunt') {
    if (!known) ctx.say(`NPC kind ${npc.kind} not known → NPC`)
    Object.assign(system, { type: 'npc', rating, gruntmeta: npc.group ?? '',
      mortype: int('mag') > 0 ? 'magician' : int('res') > 0 ? 'technomancer' : 'mundane' })
  } else if (npc.kind === 'spirit') {
    const k = spiritKey(npc.from?.name ?? name)
    if (!k) ctx.say('spirit type not recognised → air; set it on the sheet')
    Object.assign(system, { rating, spiritType: k ?? 'air' })
  } else if (npc.kind === 'sprite') {
    const k = spriteKey(npc.from?.name ?? name)
    if (!k) ctx.say('sprite type not recognised; set it on the sheet')
    Object.assign(system, { type: k, level: rating })
  }

  // powers as items (a sprite's are sprite powers); a critter power's fields from the file's entry when it has one
  const powerType = npc.kind === 'sprite' ? 'spritepower' : 'critterpower'
  for (const part of ['powers', 'optionalPowers']) for (const l of (npc.lines ?? []).filter(l => l.part === part)) for (const p of splitTop(l.text)) {
    const e = powers[normKey(p)] ?? powers[normKey(p.replace(/\s*\(.*$/, ''))]
    const optional = part === 'optionalPowers' && 'Optional power.'
    const doc = e ? base({ ...e, name: p, uid: `power:${p}` }, powerType, ctx, [optional])
      : { name: p, type: powerType, flags: { [MODULE_ID]: { id: `power:${p}`, exportedAt: f.exportedAt, appVersion: f.appVersion } },
        system: { genesisID: '', description: optional ? sanitize(optional) : '' } }
    if (e && powerType === 'critterpower') Object.assign(doc.system, critterPowerFields(e))
    items.push(icon(doc, e, ctx))
  }

  const value = s => (!s.ok ? `${s.printed} (not read)` : s.value !== s.printed ? `${s.printed} → ${s.value}` : s.printed)
  const pool = p => (p.pool != null ? `${p.name}${p.rating != null ? ` ${p.rating}` : ''} (pool ${p.pool})` : p.printed)
  const from = npc.from
  const block = [npcHeadline(npc), ...(npc.stats ?? []).map(s => `${s.label} ${value(s)}`),
    ...(npc.lines ?? []).map(l => `${PART_LABELS[l.part] ?? l.part}: ${l.text}`),
    ...(npc.pools?.length ? [`Dice pools: ${npc.pools.map(pool).join(', ')}`] : []),
    ...(from ? [`${from.name}: ${from.source} p.${from.page}`] : [])]
  system.notes = '<h3>NPC</h3>' + sanitize(block.join('\n\n')) + (lines.length ? '<h3>From Chummer</h3>' + sanitize(lines.join('\n\n')) : '')
  const actor = { name, type, flags: { [MODULE_ID]: { ...f, npc: { kind: npc.kind, rating: npc.rating ?? null } } },
    prototypeToken: { actorLink: false, disposition: -1 }, system }
  // the kind's default icon as image and token (an uploaded portrait or token replaces it); no flags.icon: Apply icons never touches actors
  const img = ctx.icons && iconFor(npcIconKey(npc.kind), null, null, ctx.icons)
  if (img) { actor.img = img; actor.prototypeToken.texture = { src: img } }
  return { actor, items, lines }
}

/** A runner file's NPC (runner.npc set): beingActor, plus the runner's background, notes and (usually empty) build items. */
export function translateNpc(r, { exportedAt, appVersion, sanitize = escapeText, icons = null }) {
  const name = r.streetName || r.realName || 'NPC', own = []
  const items = runnerItems(r, { exportedAt, appVersion, sanitize, icons: iconSet(icons), say: t => own.push(t) })
  const b = beingActor(r.npc, { name, flags: { [MODULE_ID]: { id: r.id, exportedAt, appVersion } }, sanitize, icons })
  const s = b.actor.system
  s.description = sanitize(r.background)
  s.notes = sanitize(r.notes) + s.notes + sanitize(own.join('\n\n'))
  if (r.npc.kind === 'grunt' && r.metatype?.name) s.metatype = r.metatype.name
  return { actor: b.actor, items: [...b.items, ...items], textOnly: [...b.lines, ...own].map(t => `${name}: ${t}`) }
}

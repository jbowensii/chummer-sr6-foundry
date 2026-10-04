// One Chummer SR6 runner (chummer-anarchy2 docs/sr6-export-format.md) -> shadowrun6-eden 4.x document data. Pure: no Foundry calls.
// Raw inputs only (attribute bases, skill points, items with their fields): Eden derives pools, monitors, initiative and essence.
import { MODULE_ID } from './constants.js'
import {
  ATTRS, MOR, SKILLS, SPELL_CATEGORIES, activationKey, armorSubtype, augmentType, durationKey, electronicsSubtype, gearType,
  lifestyleKey, normKey, sinQuality, skillKey, specKey, spellFields, vehicleType, weaponType,
} from './eden.js'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
// Plain text -> HTML: escaped, one <p> per paragraph (blank-line separated).
export const escapeText = s => String(s ?? '').split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${p.replace(/[&<>"']/g, c => ESC[c])}</p>`).join('')

const num = v => (Number.isFinite(v) ? v : 0)
const yes = v => v === true || v === 'true'
// ponytail: no icons until M5; then icon(doc, x) = withIcon(doc, itemIconKey(doc), x?.source ?? null, iconSet)
const icon = doc => doc

// Augmentation bonuses -> ActiveEffect changes Eden applies itself (mode 2 = ADD). Edge: Eden's own effect key for the
// template actors (Player, NPC, Critter, Spirit) is system.edge.max (config.js ACTIVE_EFFECT_OPTIONS); Eden moves it to
// system.edge.mod itself for its data-model actors (EFFECT_CONVERSION_TOV2).
const BONUS_KEY = t => (t === 'initDice' ? 'system.initiative.physical.diceMod' : t === 'edg' ? 'system.edge.max' : `system.attributes.${t}.mod`)
export const bonusChanges = bonuses => (bonuses ?? []).filter(b => b.target === 'initDice' || b.target === 'edg' || ATTRS.includes(b.target))
  .map(b => ({ key: BONUS_KEY(b.target), value: String(num(b.value)), mode: 2 }))

const ref = x => (x.source ? `Chummer: ${x.source}${x.page ? ` p.${x.page}` : ''}` : 'Chummer: custom item')
// The fields every item carries: Eden's genesis template, our flags, the description with the entry's text and its source.
function base(x, type, ctx, extra = []) {
  return {
    name: x.name, type,
    flags: { [MODULE_ID]: { id: x.uid ?? x.id, catalogId: x.id ?? null, source: x.source ?? null, page: x.page ?? null, canon: !!x.canon,
      exportedAt: ctx.exportedAt, appVersion: ctx.appVersion } },
    system: { genesisID: '', product: x.source ?? '', page: x.page ?? 0,
      description: ctx.sanitize(x.description) + extra.filter(Boolean).map(t => ctx.sanitize(t)).join('') + ctx.sanitize(ref(x)) },
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
  return icon(withEffects(doc, p), p)
}
function focus(p, ctx, extra) {
  const doc = base(p, 'focus', ctx, extra)
  doc.system.rating = num(p.values?.rating)
  return icon(withEffects(doc, p), p)
}

const RITUAL_FEATURES = ['anchored', 'material_link', 'minion', 'spell', 'spotter']
function pickItem(x, ctx) {
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
  return icon(withEffects(doc, x), x)
}

/**
 * sanitize: PLAIN TEXT -> safe HTML (callers wrap Foundry's cleaner around escapeText, never replace it).
 * specs: { [edenSkill]: { [specKey]: label } } from the Eden localization Foundry loaded. icons: icons/index.json (M5).
 */
export function translateRunner(r, { exportedAt, appVersion, sanitize = escapeText, icons = null, specs = {} }) {
  const name = r.streetName || r.realName || 'Runner', lines = [], items = []
  const ctx = { exportedAt, appVersion, sanitize, say: t => lines.push(t) }
  const flag = id => ({ [MODULE_ID]: { id, exportedAt, appVersion } })

  // every Eden skill key, 0 when the runner has none of it (so Replace clears a skill dropped in Chummer)
  const skills = Object.fromEntries(SKILLS.map(k => [k, { points: 0, specialization: '', expertise: '' }]))
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

  for (const k of r.knowledge ?? [])
    items.push(icon({ name: k.name, type: 'skill', flags: flag(`${k.kind}:${k.name}`),
      system: { genesisID: k.kind === 'language' ? 'language' : 'knowledge', points: k.native ? 4 : num(k.rank) } }, k))

  for (const q of r.qualities ?? []) {
    const doc = base(q, 'quality', ctx, [q.free && 'Metatype trait.'])
    Object.assign(doc.system, { category: q.positive ? 'ADVANTAGE' : 'DISADVANTAGE', level: yes(q.attrs?.perLevel), value: num(q.level), explain: q.note ?? '' })
    items.push(icon(doc, q))
  }
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
      system: { genesisID: '', rating: num(c.connection), loyalty: num(c.loyalty), type: c.archetype ?? '' } }, c))
  if (r.lifestyle) {
    const l = r.lifestyle, key = lifestyleKey(l.name)
    if (!key) ctx.say(`Lifestyle ${l.name}: not a shadowrun6-eden lifestyle → middle`)
    items.push(icon({ name: l.name, type: 'lifestyle', flags: flag(l.id),
      system: { genesisID: '', type: key ?? 'middle', paid: num(l.months), cost: num(l.cost) } }, l))
  }
  for (const s of r.sins ?? [])
    items.push(icon({ name: s.name, type: 'sin', flags: flag(s.uid),
      system: { genesisID: '', quality: sinQuality(s.kind, s.rating),
        description: sanitize((s.licences ?? []).map(l => `Licence: ${l.name} (rating ${l.rating})`).join('\n\n')) } }, s))

  const d = r.derived, init = i => (i ? `${i.base}${i.dice != null ? ` + ${i.dice}D6` : ''}` : '')
  const facts = d ? [`Initiative ${init(d.initiative)}${d.astralInit ? `, astral ${init(d.astralInit)}` : ''}`,
    `Condition monitors: physical ${d.monitors?.physical ?? '—'}, stun ${d.monitors?.stun ?? '—'}, overflow ${d.monitors?.overflow ?? '—'}`,
    `Defense Rating ${d.defenseRating}`] : []
  const m = r.magic ?? {}
  const actor = {
    name, type: 'Player', flags: flag(r.id),
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

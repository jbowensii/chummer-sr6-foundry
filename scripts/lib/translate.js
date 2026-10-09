// One Chummer SR6 runner (chummer-anarchy2 docs/sr6-export-format.md) -> shadowrun6-eden 4.x document data. Pure: no Foundry calls.
// Raw inputs only (attribute bases, skill points, items with their fields): Eden derives pools, monitors, initiative and essence.
import { chummerFlags } from './chummer-id.js'
import { MODULE_ID } from './constants.js'
import { iconFor, itemIconKey, npcIconKey, withIcon } from './icons.js'
import {
  ACCESS_DEVICES, ATTRS, MOR, SKILLS, SPELL_CATEGORIES, activationKey, armorSubtype, augmentType, deviceFields, durationKey, edenBook,
  effectKey, electronicsSubtype, gearType, hostChanges, lifestyleKey, martialCategories, modType, normKey, rangeKey, sinQuality, skillKey,
  softwareType, specKey, spellFields, spiritKey, spriteKey, vehicleType, vehicleVtype, weaponType,
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
// dice into initiative.physical.dicePool, the number its initiative roll uses (dice itself stays the base). Defense:
// the physical Defense Rating's mod (Eden's own Dermal Deposits effect).
// A skill bonus ({ target: 'skill', id, name }): the skill's modifier, Eden's key by the skill's name (an Eden skill only).
const skillOf = b => skillKey(b.name) ?? skillKey(String(b.id ?? '').replace(/^[a-z0-9-]+\./, ''))
const BONUS_KEY = b => (b.target === 'initDice' ? 'system.initiative.physical.diceMod' : b.target === 'edg' ? 'system.edge.max'
  : b.target === 'defense' ? 'system.defenserating.physical.mod'
  : b.target === 'skill' ? (skillOf(b) ? `system.skills.${skillOf(b)}.modifier` : null)
  : ATTRS.includes(b.target) ? `system.attributes.${b.target}.mod` : null)
export const bonusChanges = bonuses => (bonuses ?? []).flatMap(b => { const key = BONUS_KEY(b); return key ? [{ key, value: String(num(b.value)), mode: 2 }] : [] })
const BONUS_LABEL = { initDice: 'Initiative dice', defense: 'Defense Rating' }
const bonusText = bonuses => (bonuses ?? []).map(b => `${b.target === 'skill' ? b.name ?? b.id : BONUS_LABEL[b.target] ?? String(b.target).toUpperCase()} ${num(b.value) >= 0 ? '+' : ''}${num(b.value)}`).join(', ')
/** The flag that marks an Active Effect as this module's: a re-import or Replace swaps only these, never a user's own. */
export const OUR_EFFECT = { [MODULE_ID]: { chummer: true } }
const ours = e => ({ ...e, flags: { ...e.flags, ...OUR_EFFECT } })

/**
 * The catalog's effects (the export's `effects`: what the book's text says the entry does) -> Active Effects Eden applies:
 * one effect with the changes Eden has a key for, transferred to the actor that holds the item, and the conditional ones
 * (low) in a second, disabled effect for the GM to switch on. Book entries only: a runner's items carry none until
 * Chummer applies them too (it shows none yet), so both show the same numbers.
 */
export function catalogEffects(x) {
  const fx = x.effects ?? [], out = []
  for (const [low, name] of [[false, x.name], [true, `${x.name} (conditional)`]]) {
    const changes = fx.filter(e => !!e.low === low).flatMap(e => { const key = effectKey(e); return key ? [{ key, value: String(e.value), mode: 2 }] : [] })
    if (changes.length) out.push(ours({ name, transfer: true, disabled: low, changes }))
  }
  return out
}
const ATTR_NAME = { bod: 'Body', agi: 'Agility', rea: 'Reaction', str: 'Strength', wil: 'Willpower', log: 'Logic', int: 'Intuition',
  cha: 'Charisma', edg: 'Edge', mag: 'Magic', res: 'Resonance' }
const words = t => String(t ?? '').replace(/^[a-z]+:/, '').replace(/-/g, ' ')
const named = t => ATTR_NAME[String(t ?? '').replace(/^attr:/, '')] ?? words(t).replace(/\b\w/g, c => c.toUpperCase())
/** The text lines for what Eden can't hold of the catalog's effects (an Edge-cost effect) and the tests the entry calls for. */
export const effectLines = x => [
  ...(x.effects ?? []).filter(e => e.op === 'edge-cost').map(e => `Edge boosts and actions on ${named(e.target)} tests cost ${Math.abs(num(Number(e.value)))} less.`),
  ...(x.tests ?? []).map(t => `Test: ${named(t.skill)} + ${named(t.attr)}${Number.isFinite(t.threshold) ? ` (${t.threshold})` : ''}.`)]

const ref = x => (x.source ? `Chummer: ${x.source}${x.page ? ` p.${x.page}` : ''}` : 'Chummer: custom item')
// The fields every item carries: Eden's genesis template, our flags, the description with the entry's text and its source
// (ctx.ref: a book's "See SRC p.N" in place of the runner's "Chummer: SRC p.N").
// product: Eden's book code (eden.js edenBook), so the sheet names the book and links its PDF; '' when Eden has no code for
// the source (the description and flags name it). chummerID, chummerAliases: our identity for the entry
// (lib/chummer-id.js), how a re-import and a runner's compendium link find it. genesisID stays empty: it is Eden's
// own key for its translations and its Import Data, never ours.
export function base(x, type, ctx, extra = []) {
  return {
    name: x.name, type,
    flags: { [MODULE_ID]: { id: x.uid ?? x.id, catalogId: x.id ?? null, ...chummerFlags(x.source, x.kind, x.id, x.aliases),
      kind: x.kind ?? null, source: x.source ?? null, page: x.page ?? null, canon: !!x.canon,
      exportedAt: ctx.exportedAt, appVersion: ctx.appVersion } },
    system: { genesisID: '', product: edenBook(x.source) ?? '', page: x.page ?? 0,
      description: ctx.sanitize(x.description) + extra.filter(Boolean).map(t => ctx.sanitize(t)).join('') + ctx.sanitize((ctx.ref ?? ref)(x)) },
  }
}
// a runner's bonuses (ctx.host: an accessory's are its host's, never the runner's: no effect) and, in a book
// the catalog's effects (what the book's text says the entry does), on a book entry and a runner's item alike
const withEffects = (doc, x, ctx = {}) => {
  const changes = ctx.host ? [] : bonusChanges(x.bonuses)
  const effects = [...changes.length ? [ours({ name: x.name, transfer: true, disabled: false, changes })] : [], ...catalogEffects(x)]
  if (effects.length) doc.effects = effects
  return doc
}
// the data-model item types (software, mod) accept only Eden's book codes and a page of at least 1
const dataModelSource = doc => {
  if (!doc.system.product) delete doc.system.product
  doc.system.page = doc.system.page >= 1 ? doc.system.page : null
  return doc
}
const unknown = (ctx, x, what) => ctx.say(`${x.name}: ${what}`)

/**
 * One purchase -> Eden item data (gear or focus); accessories are the caller's. ctx: { exportedAt, appVersion, sanitize, say(line) }.
 * Every gear item carries price/avail as Chummer's numbers and as printed, the count and the rating.
 */
export function lineItem(p, ctx) {
  const a = p.attrs ?? {}, v = p.values ?? {}, rating = v.rating
  const extra = [p.grade && `Grade: ${p.grade}`, a.slots && `Mod slots: ${a.slots}`, p.note, ...effectLines(p)]
  let gear
  switch (p.kind) {
    case 'weapons': {
      const w = weaponType(a.category)
      if (!w.known) unknown(ctx, p, `weapon category "${a.category ?? ''}" not known → ${w.type}/${w.subtype}`)
      const modes = v.modes ?? [], skill = skillKey(a.skill) ?? w.skill
      // the row's own spec (Chummer reads it from the weapon's TYPE), as Eden's spec key through Eden's labels
      const spec = a.spec ? specKey(a.spec, ctx.specs?.[skill]) : null
      if (a.spec && !spec) ctx.say(`${p.name}: specialization ${a.spec} not a shadowrun6-eden ${skill} specialization → none`)
      gear = { type: w.type, subtype: w.subtype, skill, skillSpec: spec ?? '', dmg: num(v.dv), stun: !!v.stun, dmgDef: a.dv ?? '',
        attackRating: [0, 1, 2, 3, 4].map(i => num(v.ar?.[i])), modes: Object.fromEntries(['SS', 'SA', 'BF', 'FA'].map(m => [m, modes.includes(m)])),
        ammocap: num(v.ammo) }
      break
    }
    // worn armor counts toward Eden's Defense Rating (usedForPool)
    case 'armor': gear = { type: 'ARMOR', subtype: armorSubtype(a.category), defense: num(v.defense), usedForPool: !!p.worn }; break
    case 'augmentations': {
      const t = augmentType(a.type, a.category, a.ware)
      gear = { ...t, essence: num(v.essence), capacity: num(v.capacity), ...deviceFields(t.subtype, { rating, array: a.array, programs: a.programs }) }
      break
    }
    case 'electronics': {
      const subtype = electronicsSubtype(a.category), dev = deviceFields(subtype, { rating, array: a.array, programs: a.programs })
      gear = { type: 'ELECTRONICS', subtype, ...dev }
      // what Eden got no field for stays text
      extra.push(a.array && !('a' in dev || 'd' in dev) && `Array: ${a.array}`, a.programs && !('progSlots' in dev) && `Programs: ${a.programs}`)
      break
    }
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
        arm: num(x.armor), pil: num(x.pilot), sen: num(x.sensor), sea: num(x.seats), vtype: vehicleVtype(a.category) }
      break
    }
    case 'programs': return programItem(p, ctx)
    default:
      unknown(ctx, p, `kind ${p.kind} not known → gear TOOLS`)
      gear = { type: 'TOOLS', subtype: 'TOOLS' }
  }
  const doc = base(p, 'gear', ctx, extra), qty = p.qty ?? 1
  Object.assign(doc.system, gear, { price: num(v.cost), priceDef: a.cost ?? '', avail: num(v.avail), availDef: a.avail ?? '',
    count: qty, countable: qty > 1, needsRating: rating != null, rating: num(rating), notes: p.note ?? '' })
  return icon(withEffects(doc, p, ctx), p, ctx)
}
function focus(p, ctx, extra) {
  const doc = base(p, 'focus', ctx, extra)
  doc.system.rating = num(p.values?.rating)
  return icon(withEffects(doc, p, ctx), p, ctx)
}

/**
 * An accessory as Eden's `mod` item (type: eden.js modType): fitted to its host by system.embeddedInUuid, which
 * foundry/apply.js sets from flags.host (the host's uid) once the host has its id. Its
 * item: effects (the catalog's) change the host (transfer off: Eden applies a fitted mod's effects to its host); a
 * runner's hand-entered bonuses on an accessory are its host's, so they are text.
 */
export function modItem(x, ctx, type) {
  const a = x.attrs ?? {}, v = x.values ?? {}
  const doc = dataModelSource(base(x, 'mod', ctx, [a.slots && `Mod slots: ${a.slots}`, x.note,
    x.bonuses?.length && `On its host: ${bonusText(x.bonuses)}`, ...effectLines(x)]))
  Object.assign(doc.system, { type, rating: Math.max(0, num(v.rating)), price: Math.max(0, num(v.cost)), availDef: a.avail ?? '' })
  const fx = x.effects ?? [], out = []
  for (const [low, name] of [[false, x.name], [true, `${x.name} (conditional)`]]) {
    const changes = fx.filter(e => !!e.low === low).flatMap(hostChanges).map(c => ({ ...c, mode: 2 }))
    if (changes.length) out.push(ours({ name, transfer: false, disabled: low, changes }))
  }
  if (out.length) doc.effects = out
  return icon(doc, x, ctx)
}

const RITUAL_FEATURES = ['anchored', 'material_link', 'minion', 'spell', 'spotter']
/**
 * A spell, ritual, adept power, complex form, metamagic or echo (x.pick: its kind) -> Eden item data. ctx.complexForms:
 * Eden's own complex form table as Foundry loaded it ({ [normKey(name)]: { skill, oppAttr1, oppAttr2, threshold } },
 * foundry/apply.js edenComplexForms), for a form's test (never copied into the module).
 */
export function pickItem(x, ctx) {
  const a = x.attrs ?? {}, v = x.values ?? {}
  const type = { spells: 'spell', rituals: 'ritual', adeptpowers: 'adeptpower', complexforms: 'complexform', metamagics: 'metamagic', echoes: 'echo' }[x.pick]
  const doc = base(x, type, ctx, effectLines(x))
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
    const cf = ctx.complexForms?.[normKey(x.name)]
    if (cf) Object.assign(doc.system, { skill: cf.skill ?? '', oppAttr1: cf.oppAttr1 ?? '', oppAttr2: cf.oppAttr2 ?? '', threshold: num(cf.threshold) })
  }
  return icon(withEffects(doc, x, ctx), x, ctx)
}

// Eden's quality has no karma field: the printed karma (a range when the book prints several, attrs.karmaMax) is text
const karmaLine = (a = {}) => a.karma && `Karma: ${a.karma}${a.karmaMax && a.karmaMax !== a.karma ? `–${a.karmaMax}` : ''}`
/** A quality ({ positive, free?, level?, note? } on a runner; a book's entry sets positive from attrs.kind) -> Eden item data. */
export function qualityItem(q, ctx) {
  const doc = base(q, 'quality', ctx, [q.free && 'Metatype trait.', karmaLine(q.attrs), ...effectLines(q)])
  Object.assign(doc.system, { category: q.positive ? 'ADVANTAGE' : 'DISADVANTAGE', level: yes(q.attrs?.perLevel), value: num(q.level), explain: q.note ?? '' })
  return icon(withEffects(doc, q, ctx), q, ctx)
}
/** A critter power the book lists as a weakness (attrs.weakness): Eden has no field for it, so its description says so. */
export const weaknessLine = e => yes(e?.attrs?.weakness) && 'Weakness.'
/** A critter power entry's Eden fields (Eden's critterpower sheet: type, action, range, duration). */
export function critterPowerFields(e) {
  const a = e.attrs ?? {}
  return { type: /^\s*m/i.test(a.type ?? '') ? 'mana' : 'physical', action: activationKey(a.action), range: rangeKey(a.range), duration: durationKey(a.duration) }
}

/**
 * A Matrix program (a book entry or a runner's purchase) -> Eden's `software` item. That data model checks system.product
 * against Eden's own book list and wants page >= 1: product is Eden's code or left out (the description names the source),
 * page 0 is null. A runner's program bought into a device is installed in it (flags.host, foundry/apply.js).
 */
export function programItem(x, ctx) {
  const a = x.attrs ?? {}, v = x.values ?? {}, s = softwareType(a.type)
  if (!s.known) unknown(ctx, x, `program type "${a.type ?? ''}" not known → ${s.type}`)
  const doc = dataModelSource(base(x, 'software', ctx))
  Object.assign(doc.system, { type: s.type, rating: Math.max(0, num(v.rating)), price: Math.max(0, num(v.cost)), availDef: a.avail ?? '' })
  return icon(doc, x, ctx)
}
/** A random genesisID, as Eden's own create button makes one for a new style (SR6ActorSheet _create_UUID). */
export const randomGenesisId = () => globalThis.crypto.randomUUID()
/**
 * A martial art style -> Eden martialartstyle, its printed categories as Eden's flags. Eden lists a style's techniques
 * on the sheet by system.style === the style's genesisID (techniqueItem), so a style gets a random one, as Eden's own
 * create button gives it (ctx.newGenesisId; a re-import keeps the one the entry already has: foundry/books.js).
 */
export function martialArtItem(x, ctx) {
  const a = x.attrs ?? {}, doc = base(x, 'martialartstyle', ctx, [a.signature && `Signature technique: ${a.signature}`])
  Object.assign(doc.system, { genesisID: (ctx.newGenesisId ?? randomGenesisId)(), category: martialCategories(a.categories) })
  return icon(doc, x, ctx)
}
/** A martial art technique -> Eden martialarttech; style: the genesisID of its style ('' when the book ties it to none). */
export function techniqueItem(x, ctx, style = '') {
  const doc = base(x, 'martialarttech', ctx, [x.attrs?.category && `Category: ${x.attrs.category}`])
  Object.assign(doc.system, { style, choice: '' })
  return icon(doc, x, ctx)
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

  // An accessory fitted to its host: a program in its device (software), a weapon's, armor's or electronic device's
  // accessory as Eden's mod (eden.js modType), anything else (a cyberlimb's) a gear item that says where it's fitted.
  // flags.host: the host's uid, which foundry/apply.js turns into embeddedInUuid. Its bonuses are its host's: no effect.
  const addLine = (p, parent) => {
    let doc
    if (!parent) doc = lineItem(p, ctx)
    else {
      const type = p.kind === 'programs' ? null : modType(parent.kind, p.attrs?.category)
      doc = p.kind === 'programs' ? lineItem(p, ctx) : type ? modItem(p, ctx, type) : lineItem(p, { ...ctx, host: parent })
      if (p.kind === 'programs' || type) doc.flags[MODULE_ID].host = parent.uid
      else doc.system.description += sanitize([`Fitted to ${parent.name}.`, p.bonuses?.length && `On its host: ${bonusText(p.bonuses)}`].filter(Boolean).join(' '))
    }
    items.push(doc)
    for (const a of p.accessories ?? []) addLine(a, p)
    // Eden's own accessories line on the host (its sheet's text field)
    if (p.accessories?.length && doc.type === 'gear') doc.system.accessories = p.accessories.map(a => a.name).join(', ')
  }
  for (const p of r.purchases ?? []) addLine(p)
  // the first access device of each kind is the one Eden's persona uses (usedForPool); the player switches on the sheet
  const inUse = new Set()
  for (const d of items.filter(i => i.type === 'gear' && ACCESS_DEVICES.includes(i.system.subtype) && !i.flags[MODULE_ID].host))
    if (!inUse.has(d.system.subtype)) { inUse.add(d.system.subtype); d.system.usedForPool = true }

  const TYPES = { academic: 'Academic', corporate: 'Corporate', criminal: 'Criminal', engineering: 'Engineering', government: 'Government',
    magic: 'Magic', matrix: 'Matrix', media: 'Media', medical: 'Medical', street: 'Street' }
  for (const c of r.contacts ?? [])
    items.push(icon({ name: c.name, type: 'contact', flags: flag(c.uid),
      system: { genesisID: '', rating: num(c.connection), loyalty: num(c.loyalty), type: c.archetype ?? '',
        description: c.types?.length ? sanitize(`Contact types: ${c.types.map(t => TYPES[t] ?? t).join(', ')}`) : '' } }, c, ctx))
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
  const { exportedAt, appVersion, sanitize = escapeText, icons = null, specs = {}, complexForms = {} } = opts
  const name = r.streetName || r.realName || 'Runner', lines = []
  const ctx = { exportedAt, appVersion, sanitize, icons: iconSet(icons), specs, complexForms, say: t => lines.push(t) }
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
    // the full career ledger in our flags (Eden ignores them), for a ledger tab later
    name, type: 'Player', flags: { [MODULE_ID]: { ...flag(r.id)[MODULE_ID], ledger: structuredClone(r.ledger ?? []) } }, prototypeToken: { actorLink: true },
    system: {
      name: r.realName ?? '', metatype: r.metatype?.name ?? '', mortype: MOR[m.kind] ?? 'mundane',
      // karma: what the runner has now; karma_total: what it has earned in play (the ledger's earn entries)
      nuyen: Math.max(0, Math.trunc(num(r.nuyen))), karma: Math.max(0, Math.trunc(num(r.karma))),
      karma_total: Math.max(0, Math.trunc((r.ledger ?? []).filter(l => l.type === 'earn').reduce((t, l) => t + num(l.karma), 0))),
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
  // the boxes beyond Eden's own formula (Built Tough's): Eden's stored monitor modifiers
  if (d?.monitorBonus) { actor.system.physical = { mod: num(d.monitorBonus.physical) }; actor.system.stun = { mod: num(d.monitorBonus.stun) } }
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
    const doc = e ? base({ ...e, name: p, uid: `power:${p}` }, powerType, ctx, [optional, weaknessLine(e)])
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

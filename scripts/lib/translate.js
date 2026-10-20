// One Chummer SR6 runner (chummer-anarchy2 docs/sr6-export-format.md) -> shadowrun6-eden 4.x document data. Pure: no Foundry calls.
// Raw inputs only (attribute bases, skill points, items with their fields): Eden derives pools, monitors, initiative and essence.
import { chummerFlags } from './chummer-id.js'
import { MODULE_ID } from './constants.js'
import { iconFor, itemIconKey, npcIconKey, withIcon } from './icons.js'
import {
  ACCESS_DEVICES, ATTRS, MOR, SKILLS, SPELL_CATEGORIES, activationKey, armorSubtype, augmentType, autosoftSubtype, deviceFields, durationKey, edenBook,
  actorChanges, electronicsSubtype, gearType, hostChanges, lifestyleKey, martialCategories, modType, normKey, rangeKey, sinQuality, skillKey,
  softwareType, specKey, spellFields, spiritKey, spriteKey, testSkills, vehicleType, vehicleVtype, weaponBorne, weaponChanges, weaponType,
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
// the physical Defense Rating's mod (Eden's own Dermal Deposits effect). Monitor boxes: Eden's monitor mods.
// A skill bonus ({ target: 'skill', id, name }): the skill's modifier, Eden's key by the skill's name (an Eden skill only).
const skillOf = b => skillKey(b.name) ?? skillKey(String(b.id ?? '').replace(/^[a-z0-9-]+\./, ''))
const MONITOR = { physical: 'system.physical.mod', stun: 'system.stun.mod', overflow: 'system.overflow.mod' }
const BONUS_KEY = b => (b.target === 'initDice' ? 'system.initiative.physical.diceMod' : b.target === 'edg' ? 'system.edge.max'
  : b.target === 'defense' ? 'system.defenserating.physical.mod' : MONITOR[b.target]
  ?? (b.target === 'skill' ? (skillOf(b) ? `system.skills.${skillOf(b)}.modifier` : null)
    : ATTRS.includes(b.target) ? `system.attributes.${b.target}.mod` : null))
const howOf = x => ({ switch: x.switch, when: x.when, spec: x.spec, affects: x.affects, gen: x.gen })
const bonusRows = bonuses => (bonuses ?? []).flatMap(b => { const key = BONUS_KEY(b); return key ? [{ key, value: num(b.value), ...howOf(b) }] : [] })
export const bonusChanges = bonuses => bonusRows(bonuses).map(r => ({ key: r.key, value: r.value, mode: 2 }))
const BONUS_LABEL = { initDice: 'Initiative dice', defense: 'Defense Rating' }
const bonusText = bonuses => (bonuses ?? []).map(b => `${b.target === 'skill' ? b.name ?? b.id : BONUS_LABEL[b.target] ?? String(b.target).toUpperCase()} ${num(b.value) >= 0 ? '+' : ''}${num(b.value)}`).join(', ')
/** The flag that marks an Active Effect as this module's: a re-import or Replace swaps only these, never a user's own. */
export const OUR_EFFECT = { [MODULE_ID]: { chummer: true } }
const ours = e => ({ ...e, flags: { ...e.flags, ...OUR_EFFECT } })

// What Chummer's bonuses already hold (an `add` on an attribute, Defense Rating, initiative dice, monitor boxes, a skill or
// a test type's skills): on a runner's purchase or pick (it has `bonuses`, evaluated by rating and count) those effects
// are not counted again.
const BONUS_DERIVED = ['defense', 'initiative-dice', 'physical-monitor', 'stun-monitor', 'overflow']
const inBonuses = e => {
  const [kind, name = ''] = String(e.target ?? '').split(':')
  return e.op === 'add' && (kind === 'attr' ? [...ATTRS, 'edg'].includes(name) : kind === 'skill' || (kind === 'test' ? testSkills(name).length > 0
    : kind === 'derived' && BONUS_DERIVED.includes(name)))
}
/** An entry's links (grants, works as) -> the linked entries' effects, found in the same import (ctx.entries) by id, else
 *  by kind and name; a link's condition goes on its effects. Two levels deep, as Chummer reads them. A link marked `copied`
 *  (the importer put its effects on the entry itself, each with `from`) is skipped: they are already the entry's own. */
export function linkedEffects(x, ctx = {}, depth = 0) {
  if (depth >= 2) return []
  return (x.links ?? []).filter(l => !l.copied).flatMap(l => {
    const fits = e => e !== x && (!l.kind || e.kind === l.kind)
    const e = (l.id && ctx.entries?.find(e => fits(e) && e.id === l.id)) || ctx.entries?.find(e => fits(e) && normKey(e.name) === normKey(l.name))
    return e ? [...e.effects ?? [], ...linkedEffects(e, ctx, depth + 1)].map(f => (l.when ? { ...f, when: l.when } : f)) : []
  })
}
/**
 * An item's effects (its own and its links') -> { rows: Active Effect changes with how they turn on, notes: what stays
 * text }. A note, never applied: a low-confidence effect, one Eden has no field for, a formula. Left out: what the item's
 * bonuses already hold, and armor's Defense Rating (Eden counts the armor's own). On an accessory (ctx.host) all are its
 * host's: notes. A quality counts each effect once per level (as Chummer does); R is the item's rating or level.
 * Each row has a scope: `actor` (transferred to the actor), `item` (not transferred: Eden applies it to this item, a
 * weapon's own attack bonus or wild die), `host` (a fitted mod's, on the item it fits), `target` (for a spell's or form's
 * target, never the owner's: foundry/targets.js copies it to the targets). ctx.mod: a fitted mod; ctx.hostAr: its host
 * weapon's attack rating bands; ctx.device: false when its host is no Matrix access device; ctx.weapon: its host is a weapon.
 * ctx.audit: a Map each effect is recorded in (actor, item, host, target, note, covered), for the coverage test.
 */
// an effect for someone else (others, a spell's target): never the owner's or the host's
const foreign = e => e.affects === 'others' || e.affects === 'target'
// the kinds with an "Apply to targets" control (foundry/targets.js): their effects for others go to the targeted tokens
const TARGETABLE = new Set(['spells', 'rituals', 'complexforms', 'critterpowers'])
// a value only the table knows (net hits, Force): the control asks for it; the stored change holds 0 until then
const PROMPT = /^(-?)(hits|R)$/i
function plan(x, e, ctx, rating) {
  if (e.low || ctx.host) return null
  if (foreign(e)) {
    if (ctx.mod || !TARGETABLE.has(x.kind)) return null
    const p = PROMPT.exec(String(e.value ?? '').trim()), changes = actorChanges(p ? { ...e, value: '0' } : e, rating)
    return changes.length ? { scope: 'target', changes, prompt: p ? { what: /^hits$/i.test(p[2]) ? 'hits' : 'Force', sign: p[1] ? -1 : 1 } : null } : null
  }
  if (ctx.mod) {
    const changes = hostChanges(e, rating, { bands: ctx.hostAr, device: ctx.device !== false, weapon: !!ctx.weapon })
    return changes.length ? { scope: 'host', changes } : null
  }
  if (x.kind === 'weapons' && weaponBorne(e)) { const changes = weaponChanges(e, rating); return changes.length ? { scope: 'item', changes } : null }  // (never the actor's skill)
  const changes = actorChanges(e, rating)
  return changes.length ? { scope: 'actor', changes } : null
}
function readEffects(x, ctx = {}) {
  const rows = [], notes = [], quality = x.kind === 'qualities'
  const rating = quality ? 1 : num(x.values?.rating) || num(x.level) || 1, times = quality ? num(x.level) || 1 : 1
  for (const e of [...x.effects ?? [], ...linkedEffects(x, ctx)]) {
    const seen = out => ctx.audit?.set(e, { id: x.id, kind: x.kind, out })
    if ((Array.isArray(x.bonuses) && inBonuses(e) && !e.low) || (x.kind === 'armor' && e.target === 'derived:defense')) { seen('covered'); continue }
    const p = plan(x, e, ctx, rating)
    if (!p) { seen('note'); notes.push(effectText(e)); continue }
    seen(p.scope)
    // perRating: exactly R, once, on one change (groupEffects: Eden's @item.system.rating when the item can carry it)
    const perRating = times === 1 && String(e.value).trim() === 'R'
    rows.push(...p.changes.map(c => ({ ...c, value: typeof c.value === 'number' ? c.value * times : c.value, scope: p.scope, perRating, prompt: p.prompt, ...howOf(e) })))
  }
  return { rows, notes }
}
const SWITCH = { wireless: 'Wireless', activated: 'Activated', sustained: 'Sustained', conditional: 'Conditional' }
/**
 * Changes with how they turn on -> Active Effects. Always on: one enabled effect named after the item. Switchable or
 * conditional: a disabled effect for each way it turns on, named for it ("Wireless: Smartlink"), for the player to switch
 * on. A spell's or complex form's: on its caster, a disabled effect (on while sustained); on its target (or others), an
 * effect not transferred to the caster and disabled (Eden applies an item's own non-transfer effects to the item itself,
 * item.mjs:601-607, so a live one would write the target's keys into the spell), flagged forTargets for foundry/targets.js
 * to copy to the targeted tokens (flags.prompt: the value it asks for). A weapon's own (scope item) and a mod's (host) are
 * not transferred either. ctx.stored: keys whose always-on value the actor already holds (its monitor boxes), left out
 * here. ctx.perRating: a per-rating row is Eden's @item.system.rating (actor.js:329-338), not the baked number. A row from a
 * Commlink6 override (gen: 'cl6') is its own effect, named "... (CommLink6)" and flagged gen: 'cl6', so the owner sees it;
 * it applies like the others.
 */
function groupEffects(rows, name, ctx = {}) {
  const out = new Map()
  for (const r of rows) {
    const scope = r.scope ?? 'actor', target = scope === 'target' || r.affects === 'target', on = !target && !r.switch && !r.when && !r.spec && r.affects !== 'caster'
    if (on && ctx.stored?.includes(r.key)) continue
    const cl6 = r.gen === 'cl6'
    const label = (target ? `${r.affects === 'others' ? 'Others get' : 'On the target'}: ${name}` : on ? name
      : `${SWITCH[r.switch] ?? (r.affects === 'caster' ? 'Sustained' : 'Conditional')}: ${name}${r.spec ? ` (${r.spec})` : ''}${r.when ? ` (${r.when})` : ''}`) + (cl6 ? ' (CommLink6)' : '')
    const id = `${scope}|${label}`
    if (!out.has(id)) {
      const e = ours({ name: label, transfer: scope === 'actor' && !target, disabled: !on, changes: [] })
      const flags = { ...e.flags[MODULE_ID], ...cl6 ? { gen: 'cl6' } : {}, ...scope === 'target' ? { forTargets: true } : {} }  // (a new object: OUR_EFFECT is shared)
      e.flags = { ...e.flags, [MODULE_ID]: flags }
      out.set(id, e)
    }
    const e = out.get(id)
    e.changes.push({ key: r.key, value: ctx.perRating && r.perRating && scope !== 'target' && scope !== 'host' ? '@item.system.rating' : r.value, mode: r.mode ?? 2 })
    if (r.prompt) { const f = e.flags[MODULE_ID]; f.prompt = { ...f.prompt, [r.key]: r.prompt } }
  }
  return [...out.values()].sort((a, b) => (b.name === name) - (a.name === name))  // the always-on one first
}

const ATTR_NAME = { bod: 'Body', agi: 'Agility', rea: 'Reaction', str: 'Strength', wil: 'Willpower', log: 'Logic', int: 'Intuition',
  cha: 'Charisma', edg: 'Edge', mag: 'Magic', res: 'Resonance', ess: 'Essence' }
const words = t => String(t ?? '').replace(/^[a-z-]+:/, '').replace(/-/g, ' ')
const title = t => words(t).replace(/\b\w/g, c => c.toUpperCase())
// the target kinds whose words need more than their name (the rest: `Firewall`, `Defense Rating`, a skill's name)
const KIND_WORDS = { 'attr-max': t => `maximum ${ATTR_NAME[words(t)] ?? title(t)}`, 'skill-max': t => `${words(t) === 'choice' ? 'a chosen skill' : title(t)}’s maximum`,
  pricemod: t => `${title(t)} prices`, pool: t => `the ${title(t)} pool’s Edge`, 'complex-form': t => `the ${title(t)} complex form`, action: t => `the ${title(t)} action`,
  'action-max': t => `the ${title(t)} action’s maximum bonus` }
const named = t => { const k = String(t ?? '').split(':')[0]; return KIND_WORDS[k]?.(t) ?? ATTR_NAME[String(t ?? '').replace(/^attr:/, '')] ?? (words(t) === 'choice' ? `a chosen ${k === 'matrix' ? 'Matrix attribute' : k === 'skill' ? 'skill' : 'attribute'}` : title(t)) }
const minus = v => /^[-–−]/.test(v)
const value = v => (v === 'N' ? 'native' : /^x\d+(?:\.\d+)?$/.test(v) ? `× ${v.slice(1)}` : /^rank:[a-z-]+$/.test(v) ? `${title(v.slice(5))} ranks` : /^[a-z]{3}\/\d+\+\d+$/.test(v) ? v.replace(/^([a-z]{3})\/(\d+)\+(\d+)$/, (_, a, n, k) => `${ATTR_NAME[a] ?? a} ÷ ${n} + ${k}`) : /^0\.\d+$/.test(v) ? `${Math.round(Number(v) * 100)}%`
  : /^R(?:\*\d+)?-\d+$/.test(v) ? v.replace(/^R(?:\*(\d+))?-(\d+)$/, (_, n, k) => `${n ? `${n} × ` : ''}(rating − ${k})`)
  : /^R\[.*\]$/.test(v) ? `${v.slice(2, -1).split(',').join('/')} by rating` : v.includes(',') ? v.split(',').map(x => (x === 'x' ? '— (removed)' : x)).join('/')
  : /^-?[a-z][a-z-]*\/\d+(?: R[DU])?$/.test(v) ? v.replace(/^(-?)([a-z][a-z-]*)\/(\d+)(?: (R[DU]))?$/, (_, m, a, n, r) => `${m}${ATTR_NAME[a] ?? a.replace(/-/g, ' ')} ÷ ${n}${r ? ` (round ${r === 'RD' ? 'down' : 'up'})` : ''}`) : v)
const signed = v => (minus(v) || v.includes(',') || /%$/.test(value(v)) ? value(v) : `+${value(v)}`)
/** One effect as words: "Wireless: +1 Reaction.", "Edge boosts and actions on Firearms tests cost 1 less.", "Low Light Vision." */
export function effectText(e) {
  const v = String(e.value ?? ''), t = `${named(e.target)}${e.spec ? ` (${e.spec})` : ''}`, tests = `${t} tests`
  if (String(e.target).startsWith('sense:')) return `${e.low ? 'Not applied (unsure): ' : ''}${t}${e.when ? ` (${e.when})` : ''}.`
  const text = { set: `${t} ${value(v)}`, edge: `${signed(v)} Edge on ${tests}`,
    'edge-cost': `Edge boosts and actions on ${tests} cost ${v.replace(/^[-–−]/, '')} ${minus(v) ? 'less' : 'more'}`,
    'edge-cost-set': `${tests} cost ${v} Edge`, 'no-edge': `No Edge spent on ${tests}`, 'no-edge-gain': `No Edge gained on ${tests}`,
    'wild-die': `A wild die on ${tests}`, hits: `${signed(v)} hits on ${tests}`, threshold: `Threshold ${signed(v)} on ${tests}`,
    'threshold-set': `${t} test threshold ${v}` }[e.op]
    ?? (/^rank:/.test(v) ? `+${value(v)} to ${t}` : null)
    ?? `${signed(v)} ${String(e.target).startsWith('test:') ? tests : t}`
  const how = e.affects === 'target' ? 'On the target: ' : e.affects === 'others' ? 'Others get: ' : SWITCH[e.switch] && e.switch !== 'conditional' ? `${SWITCH[e.switch]}: ` : ''
  return `${e.low ? 'Not applied (unsure): ' : ''}${how}${text}${e.when ? ` (${e.when})` : ''}.`
}
const linkText = l => `${l.rel === 'as' ? 'Works as' : 'Grants'} ${l.name}${l.level ? ` ${l.level}` : ''}${l.when ? ` (${l.when})` : ''}.`
/** The text lines for what Eden can't hold of the entry's effects, its links, and the tests the entry calls for. */
export const effectLines = (x, ctx = {}) => [...readEffects(x, ctx).notes, ...(x.links ?? []).map(linkText),
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
// a runner's bonuses (ctx.host: an accessory's are its host's, never the runner's: no effect) and the catalog's
// effects (what the book's text says the entry does), on a book entry and a runner's item alike, as Active Effects
// ctx.rated (a runner's items): a gear or focus item with a rating (Eden's template.json gear and focus have system.rating) follows it
export const withEffects = (doc, x, ctx = {}) => {
  const perRating = !!ctx.rated && ['gear', 'focus'].includes(doc.type) && doc.system.rating > 0
  const effects = groupEffects([...ctx.host ? [] : bonusRows(x.bonuses), ...readEffects(x, ctx).rows], x.name, { ...ctx, perRating })
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
  const extra = [p.grade && `Grade: ${p.grade}`, a.slots && `Mod slots: ${a.slots}`, p.note, ...effectLines(p, ctx)]
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
    case 'armor': gear = { type: 'ARMOR', subtype: armorSubtype(a.category), defense: num(v.defense), social: num(v.social), usedForPool: !!p.worn }; break
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

// the mod types whose host is no Matrix access device (modType): a matrix: effect on them is a note
const NOT_DEVICE = new Set(['weapon_mod', 'accessory_weapon', 'armor_mod'])
/**
 * An accessory as Eden's `mod` item (type: eden.js modType): fitted to its host by system.embeddedInUuid, which
 * foundry/apply.js sets from flags.host (the host's uid) once the host has its id. Its
 * item: effects (the catalog's) change the host (transfer off: Eden applies a fitted mod's effects to its host); a
 * runner's hand-entered bonuses on an accessory are its host's, so they are text.
 */
export function modItem(x, ctx, type) {
  const a = x.attrs ?? {}, v = x.values ?? {}
  const mctx = { ...ctx, mod: true, device: !NOT_DEVICE.has(type), weapon: /^(?:weapon_mod|accessory_weapon)$/.test(type) }
  const doc = dataModelSource(base(x, 'mod', ctx, [a.slots && `Mod slots: ${a.slots}`, x.note,
    x.bonuses?.length && `On its host: ${bonusText(x.bonuses)}`, ...effectLines(x, mctx)]))
  Object.assign(doc.system, { type, rating: Math.max(0, num(v.rating)), price: Math.max(0, num(v.cost)), availDef: a.avail ?? '' })
  const out = groupEffects(readEffects(x, mctx).rows, x.name)  // (scope host: not transferred, Eden applies a fitted mod's effects to its host)
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
  const doc = base(x, type, ctx, effectLines(x, ctx))
  if (type === 'spell') {
    Object.assign(doc.system, spellFields(a, v))
    if (!SPELL_CATEGORIES.includes(String(a.category ?? '').toLowerCase())) unknown(ctx, x, `spell category "${a.category ?? ''}" not known → health`)
  } else if (type === 'ritual') {
    const kw = String(a.keywords ?? '').split(',').map(normKey)
    Object.assign(doc.system, { threshold: num(v.threshold), features: Object.fromEntries(RITUAL_FEATURES.map(f => [f, kw.includes(f)])) })
  } else if (type === 'adeptpower') {
    Object.assign(doc.system, { hasLevel: yes(a.perLevel), level: num(x.level), cost: num(v.powerCost), activation: activationKey(a.activation) })
  } else if (type === 'metamagic') {
    // the catalog's user: who may take it (absent: any initiate); perLevel: it can be taken again (x.level: times taken)
    Object.assign(doc.system, { hasLevel: yes(a.perLevel), level: num(x.level) || 1, adepts: a.user !== 'magician', mages: a.user !== 'adept' })
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
  const doc = base(q, 'quality', ctx, [q.free && 'Metatype trait.', karmaLine(q.attrs), ...effectLines(q, ctx)])
  Object.assign(doc.system, { category: q.positive ? 'ADVANTAGE' : 'DISADVANTAGE', level: yes(q.attrs?.perLevel), value: num(q.level), explain: q.note ?? '' })
  return icon(withEffects(doc, q, ctx), q, ctx)
}
/** A critter power the book lists as a weakness (attrs.weakness): Eden has no field for it, so its description says so. */
export const weaknessLine = e => yes(e?.attrs?.weakness) && 'Weakness.'
/** A critter or sprite power (a book entry, or the one a being lists) as Eden item data, with its effects as every item's. */
export function powerItem(x, type, ctx, extra = []) {
  const doc = base(x, type, ctx, [...extra, weaknessLine(x), ...effectLines(x, ctx)])
  if (type === 'critterpower') Object.assign(doc.system, critterPowerFields(x))
  return withEffects(doc, x, ctx)
}
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
  const doc = dataModelSource(base(x, 'software', ctx, effectLines(x, ctx)))
  Object.assign(doc.system, { type: s.type, rating: Math.max(0, num(v.rating)), price: Math.max(0, num(v.cost)), availDef: a.avail ?? '' })
  // an autosoft's kind, by its name: the one Eden's Vehicle actor rolls with (Targeting, Maneuver, …)
  const sub = s.type === 'AUTOSOFT' ? autosoftSubtype(x.name) : null
  if (sub) doc.system.subtype = sub
  return icon(withEffects(doc, x, ctx), x, ctx)
}
/** A random genesisID, as Eden's own create button makes one for a new style (SR6ActorSheet _create_UUID). */
export const randomGenesisId = () => globalThis.crypto.randomUUID()
/**
 * A martial art style -> Eden martialartstyle, its printed categories as Eden's flags. Eden lists a style's techniques
 * on the sheet by system.style === the style's genesisID (techniqueItem), so a style gets a random one, as Eden's own
 * create button gives it (ctx.newGenesisId; a re-import keeps the one the entry already has: foundry/books.js).
 */
export function martialArtItem(x, ctx) {
  const a = x.attrs ?? {}, doc = base(x, 'martialartstyle', ctx, [a.signature && `Signature technique: ${a.signature}`, ...effectLines(x, ctx)])
  Object.assign(doc.system, { genesisID: (ctx.newGenesisId ?? randomGenesisId)(), category: martialCategories(a.categories) })
  return icon(withEffects(doc, x, ctx), x, ctx)
}
/** A martial art technique -> Eden martialarttech; style: the genesisID of its style ('' when the book ties it to none). */
// a technique's printed prerequisites (Chummer's requires: { kind, name, met? }); met: false on a runner that lacks it
const REQUIRES = { adeptpower: 'adept power', technique: 'technique', quality: 'quality', augmentation: 'augmentation' }
const requiresLine = rs => rs?.length && `Requires: ${rs.map(r => `${r.name}${REQUIRES[r.kind] ? ` (${REQUIRES[r.kind]})` : ''}${r.met === false ? ' — missing' : ''}`).join('; ')}`
export function techniqueItem(x, ctx, style = '') {
  const doc = base(x, 'martialarttech', ctx, [x.attrs?.category && `Category: ${x.attrs.category}`, requiresLine(x.requires), ...effectLines(x, ctx)])
  Object.assign(doc.system, { style, choice: '' })
  return icon(withEffects(doc, x, ctx), x, ctx)
}

// Everything a runner file holds as items, for runners and NPCs alike (an NPC's build is usually blank).
// Eden's Vehicle actor vtype: its piloting specialization keys (actor.js maps the gear item's GROUND/WATER/AIR to them)
const ACTOR_VTYPE = { GROUND: 'ground_craft', WATER: 'watercraft', AIR: 'aircraft' }
// The Vehicle actor's own numbers (the same keys as the vehicle gear item's, eden.js hostChanges): a fitted mod's item:
// effects on them become effects on the mod that Eden applies to the actor. A weapon's or device's keys are not the vehicle's.
const VEHICLE_KEYS = new Set(['system.handlOn', 'system.handlOff', 'system.accOn', 'system.accOff', 'system.spdiOn', 'system.spdiOff',
  'system.tspd', 'system.bod', 'system.arm', 'system.pil', 'system.sen', 'system.sea'])
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
/**
 * A vehicle or drone (a book entry or a runner's purchase) as Eden's Vehicle actor: its handling, acceleration, speed
 * interval, top speed, body, armor, pilot, sensor and seats; a drone runs autonomous (its Pilot and autosofts), a vehicle
 * manual. On a runner its mods, mounts, mounted weapons (saying their mount) and autosofts (the purchase's accessories)
 * are its own items; a mod's always-on changes to its numbers are effects Eden applies to it (the printed numbers stay the
 * base). Its own build (the export's vehicle block: the mods built in, slot shifts, seats taken out, a Designer design) is
 * in its notes. vehicle.belongs (the owner's actor id) is set by foundry/apply.js once the runner exists.
 */
export function vehicleActor(p, ctx) {
  const g = lineItem({ ...p, accessories: [], bonuses: undefined }, ctx), s = g.system, b = p.vehicle ?? {}
  const fits = p.accessories ?? [], nameOf = uid => fits.find(a => a.uid === uid)?.name
  const items = fits.map(a => {
    const d = lineItem({ ...a, accessories: [] }, { ...ctx, host: p })
    d.system.description += ctx.sanitize([`Fitted to ${p.name}.`, a.mount && nameOf(a.mount) && `In its ${nameOf(a.mount)}.`,
      a.diy && 'Installed by its owner (half price).'].filter(Boolean).join(' '))
    if (a.mount) d.flags[MODULE_ID].mount = a.mount
    // (the vehicle's own numbers only; an effect for others or a target is the description's, never the owner's vehicle)
    const rows = (a.effects ?? []).filter(e => !e.low && !foreign(e)).flatMap(e => {
      const ch = hostChanges(e, Math.max(1, num(a.values?.rating)), { device: false }).filter(c => c.mode === 2 && VEHICLE_KEYS.has(c.key))
      if (ch.length) ctx.audit?.set(e, { id: a.id, kind: a.kind, out: 'host' })
      return ch.map(c => ({ ...c, ...howOf(e), affects: undefined, scope: 'actor' }))
    })
    const fx = groupEffects(rows, a.name)
    if (fx.length) d.effects = fx
    return d
  })
  const drone = b.drone ?? /^DRONE/.test(s.type)
  const notes = [...(b.builtin ?? []).map(t => `Built in: ${t}.`),
    b.slotShifts?.length && `Mod slots shifted: ${b.slotShifts.map(x => `2 ${x.from} for 1 ${x.to}`).join(', ')}.`,
    b.seatsRemoved && `${plural(b.seatsRemoved, 'seat')} taken out for cargo.`, b.design && 'Bought from a Designer design.']
  const actor = { name: p.name, type: 'Vehicle', img: g.img,
    flags: { [MODULE_ID]: { ...g.flags[MODULE_ID] } },
    system: { handlOn: s.handlOn, handlOff: s.handlOff, accOn: s.accOn, accOff: s.accOff, spdiOn: s.spdiOn, spdiOff: s.spdiOff,
      tspd: s.tspd, bod: s.bod, arm: s.arm, pil: s.pil, sen: s.sen, sea: s.sea, vtype: ACTOR_VTYPE[s.vtype] ?? 'ground_craft',
      vehicle: { opMode: drone ? 'autonomous' : 'manual' }, description: s.description, notes: ctx.sanitize(notes.filter(Boolean).join('\n\n')) } }
  if (!actor.img) delete actor.img
  return { actor, items }
}

const CRITTER_CLASS = { mundane: 'Mundane pet', exotic: 'Exotic pet', wild: 'Wild pet', awakened: 'Awakened', emerged: 'Emerged' }
const QUALITY_HOW = { tamed: 'From its taming.', bonded: 'Bonded (Critter Bond).' }
// trained commands and special training: a count, or (a later file) the named ones
const trained = v => (Array.isArray(v) ? v.map(x => x?.name ?? x).join(', ') || 'none' : String(num(Number(v))))
/**
 * A runner's critter (a critters purchase with its npc stat block and critter block) as Eden's Critter actor
 * (beingActor): its stats, skills and innate powers (no Karma); its companion qualities as quality items; its
 * critterware and gear (the purchase's accessories) as its items, their bonuses its own (Eden works out the Essence they
 * take); its class, taming and training in its notes. Its token is linked and friendly. Eden's Critter has no owner
 * field: flags.runner (set by translateRunner) ties it to the runner.
 */
export function critterActor(p, ctx) {
  const c = p.critter ?? {}, own = base(p, 'Critter', ctx)
  const being = beingActor({ stats: [], lines: [], ...p.npc, kind: 'critter' }, { name: p.name, flags: own.flags, sanitize: ctx.sanitize, icons: ctx.icons })
  for (const l of being.lines) ctx.say(`${p.name}: ${l}`)
  const qualities = (c.qualities ?? []).map(q => qualityItem({ uid: q.uid, id: q.id, kind: 'qualities', name: q.name ?? q.id, canon: false, attrs: {},
    positive: q.positive !== false, level: q.level, note: QUALITY_HOW[q.how] }, { ...ctx, ref: () => '' }))
  const gear = (p.accessories ?? []).map(a => lineItem({ ...a, accessories: [] }, { ...ctx, stored: [] }))
  const { actor } = being, s = actor.system
  const facts = [CRITTER_CLASS[c.class] ?? 'Critter', c.tamed && 'Tamed from the wild (no price).',
    `Trained commands: ${trained(c.commands)}`, `Special training: ${trained(c.training)}`, p.note]
  s.notes = '<h3>Companion</h3>' + ctx.sanitize(facts.filter(Boolean).join('\n\n')) + s.notes
  s.description = own.system.description
  actor.prototypeToken = { ...actor.prototypeToken, actorLink: true, disposition: 1 }  // (CONST.TOKEN_DISPOSITIONS.FRIENDLY)
  return { actor, items: [...being.items, ...qualities, ...gear] }
}

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
      doc = p.kind === 'programs' ? lineItem(p, ctx) : type ? modItem(p, { ...ctx, hostAr: parent.kind === 'weapons' ? parent.values?.ar : null }, type) : lineItem(p, { ...ctx, host: parent })
      if (p.kind === 'programs' || type) doc.flags[MODULE_ID].host = parent.uid
      else doc.system.description += sanitize([`Fitted to ${parent.name}.`, p.bonuses?.length && `On its host: ${bonusText(p.bonuses)}`].filter(Boolean).join(' '))
    }
    items.push(doc)
    for (const a of p.accessories ?? []) addLine(a, p)
    // Eden's own accessories line on the host (its sheet's text field)
    if (p.accessories?.length && doc.type === 'gear') doc.system.accessories = p.accessories.map(a => a.name).join(', ')
  }
  // (a critter is its own Critter actor, critterActor: Eden's Player has nowhere to hold one)
  for (const p of r.purchases ?? []) if (p.kind !== 'critters') addLine(p)
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
  // martial arts: each style (a random genesisID, as Eden's create button gives it) and the techniques learned under it
  for (const m of r.martialArts ?? []) {
    const style = martialArtItem(m, ctx)
    items.push(style, ...(m.techniques ?? []).map(t => techniqueItem(t, ctx, style.system.genesisID)))
  }
  // each SIN's lifestyles, Eden's lifestyle.system.sin naming the SIN (a text field); a file written before SINs held
  // their lifestyles has only the runner's one lifestyle
  const lifestyle = (l, sin) => {
    const key = lifestyleKey(l.name)
    if (!key) ctx.say(`Lifestyle ${l.name}: not a shadowrun6-eden lifestyle → middle`)
    const f = flag(l.uid ?? l.id)
    Object.assign(f[MODULE_ID], { catalogId: l.id ?? null, ...sin ? { sin: sin.uid } : {} })
    return icon({ name: l.name, type: 'lifestyle', flags: f,
      system: { genesisID: '', type: key ?? 'middle', paid: num(l.months), cost: num(l.cost), sin: sin?.name ?? '' } }, l, ctx)
  }
  // a placeholder SIN (Chummer gave an older runner's lifestyle an unnamed one to sit on) shows as such
  const sins = (r.sins ?? []).map(s => (s.placeholder ? { ...s, name: s.name || 'Unnamed SIN (placeholder)' } : s))
  if (sins.some(s => Array.isArray(s.lifestyles))) for (const s of sins) for (const l of s.lifestyles ?? []) items.push(lifestyle(l, s))
  else if (r.lifestyle) items.push(lifestyle(r.lifestyle, sins[0]))
  for (const s of sins)
    items.push(icon({ name: s.name, type: 'sin', flags: flag(s.uid),
      system: { genesisID: '', quality: sinQuality(s.kind, s.rating),
        description: sanitize([s.placeholder && 'A placeholder: name it or replace it in Chummer.', s.gender && `Gender: ${s.gender}`,
          ...(s.licences ?? []).map(l => `Licence: ${l.name} (rating ${l.rating})`)]
          .filter(Boolean).join('\n\n')) } }, s, ctx))
  return items
}
// everything a runner file's runner holds, its accessories and techniques too: where its items' links are found
const runnerEntries = r => {
  const all = (list = []) => list.flatMap(x => [x, ...all(x.accessories), ...all(x.techniques)])
  return all([...r.qualities ?? [], ...r.picks ?? [], ...r.purchases ?? [], ...r.martialArts ?? []])
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
  // stored: the always-on monitor boxes Chummer counted, which the actor holds (below), so not an effect too
  const ctx = { exportedAt, appVersion, sanitize, icons: iconSet(icons), specs, complexForms, say: t => lines.push(t), entries: runnerEntries(r), rated: true,
    stored: r.derived?.monitorBonus ? [MONITOR.physical, MONITOR.stun] : [] }
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

  // Chummer's numbers, with the switchable and conditional effects on in brackets when they differ (derivedOn): "9 (11)"
  const d = r.derived, on = r.derivedOn ?? d, init = i => (i ? `${i.base}${i.dice != null ? ` + ${i.dice}D6` : ''}` : '')
  const both = g => { const a = g(d), b = g(on); return b !== a && b != null && b !== '' ? `${a} (${b})` : a }
  const facts = d ? [`Initiative ${both(x => init(x.initiative))}${d.astralInit ? `, astral ${both(x => init(x.astralInit))}` : ''}`,
    `Condition monitors: physical ${both(x => x.monitors?.physical ?? '—')}, stun ${both(x => x.monitors?.stun ?? '—')}, overflow ${both(x => x.monitors?.overflow ?? '—')}`,
    `Defense Rating ${both(x => x.defenseRating)}`] : []
  const m = r.magic ?? {}
  const actor = {
    // the full career ledger in our flags (Eden ignores them), for a ledger tab later
    name, type: 'Player', flags: { [MODULE_ID]: { ...flag(r.id)[MODULE_ID], ledger: structuredClone(r.ledger ?? []) } }, prototypeToken: { actorLink: true },
    system: {
      name: r.realName ?? '', gender: r.gender ?? '', metatype: r.metatype?.name ?? '', mortype: MOR[m.kind] ?? 'mundane',
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
  // its vehicles and drones also as Vehicle actors (Eden's tokens), its critters as Critter actors, tied to it by
  // flags.runner and (a vehicle) linked to it by foundry/apply.js
  const owned = (kind, make) => (r.purchases ?? []).filter(p => p.kind === kind).map(p => {
    const v = make(p, ctx)
    v.actor.flags[MODULE_ID].runner = r.id
    return v
  })
  const vehicles = owned('vehicles', vehicleActor), critters = owned('critters', critterActor)
  // (a vehicle's mod is a runner item and a Vehicle actor's: its report line once)
  return { actor, items, vehicles, critters, textOnly: [...new Set(lines)].map(t => `${name}: ${t}`) }
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

const PICK_KINDS = new Set(['adeptpowers', 'spells', 'complexforms'])
const isPower = x => x.kind === 'critterpowers' || PICK_KINDS.has(x.kind)
// how a stat block thing found its catalog entry, when it isn't by its own name
const matchNote = x => {
  const m = x.line?.match
  return m?.how === 'fuzzy' ? `the catalog's ${x.name} by a name ${Math.round(m.score * 100)}% alike`
    : m?.how === 'standard' ? `${x.name}, the catalog's standard item for it (a default pick)`
      : m?.how === 'ammo' ? `regular ammunition for it, one full load` : ''
}
/**
 * An NPC's stat-block things (the export's npc.items: Chummer's npc.ts npcThings) as its items: weapons, attacks, armor,
 * gear and augmentations as a runner's purchases are (lineItem; accessories fitted, armor worn so Eden's Defense Rating
 * counts it), powers as critter (or sprite) powers, adept powers, spells or complex forms under their printed names (an
 * optional one says so). Each says its printed line, and keeps flags.npcLine (the earlier line items' flag). A weapon
 * takes its DV text as printed. The stat block prints an attack's whole Attack Rating, and Eden adds Strength to a close
 * combat item's close band (item.mjs calculatedAttackRating): that band is stored less the NPC's Strength (str), so the
 * sheet rolls the printed number. Eden's weapon roll then takes its pool from the item's skill (actor.js rollItem). A
 * weapon with a magazine comes loaded with regular rounds (Eden refuses to fire one with fewer rounds than it shoots,
 * RollTypes.js); its spare load is an ammunition item (the export's `<weapon uid>:ammo`). An item found by a name only
 * alike, or as the standard item of a generic name, says so with its score (flags.match: Chummer's line.match).
 */
export function statBlockItems(things, ctx, powerType, str) {
  const all = list => list.flatMap(x => [x, ...all(x.accessories ?? [])])
  const noted = x => ({ ...x, note: [`Stat block: ${x.line?.printed ?? x.name}`, matchNote(x)].filter(Boolean).join(' — '),
    accessories: (x.accessories ?? []).map(noted) })
  const byUid = new Map(all(things).map(x => [x.uid, x]))
  const items = runnerItems({ purchases: things.filter(x => !isPower(x)).map(noted) }, { ...ctx, entries: all(things), rated: true })
  for (const d of items) {
    const x = byUid.get(d.flags[MODULE_ID].id), line = x?.line
    if (!line) continue
    d.flags[MODULE_ID].npcLine = line.printed
    if (line.match) d.flags[MODULE_ID].match = line.match
    if (!/^WEAPON_/.test(d.system.type ?? '')) continue
    if (line.dv) d.system.dmgDef = line.dv
    if (d.system.ammocap > 0) Object.assign(d.system, { ammocount: d.system.ammocap, ammoLoaded: 'regular' })
    if (d.system.skill === 'close_combat' && line.values?.ar?.[0] != null && str != null) d.system.attackRating[0] -= str
  }
  for (const x of things.filter(isPower)) {
    const p = noted({ ...x, name: x.line?.printed ?? x.name }), optional = x.line?.part === 'optionalPowers' && 'Optional power.'
    const doc = x.kind === 'critterpowers' ? icon(powerItem(p, powerType, ctx, [optional, p.note]), p, ctx)
      : pickItem({ ...p, pick: x.kind }, ctx)
    doc.flags[MODULE_ID].npcLine = x.line?.printed
    if (x.line?.match) doc.flags[MODULE_ID].match = x.line.match
    items.push(doc)
  }
  return items
}

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
  // a file with the stat block's things as items (Chummer 0.17's npc.items): those; an older file: its powers lines
  if (Array.isArray(npc.items)) items.push(...statBlockItems(npc.items, ctx, powerType, int('str')))
  else for (const part of ['powers', 'optionalPowers']) for (const l of (npc.lines ?? []).filter(l => l.part === part)) for (const p of splitTop(l.text)) {
    const e = powers[normKey(p)] ?? powers[normKey(p.replace(/\s*\(.*$/, ''))]
    const optional = part === 'optionalPowers' && 'Optional power.'
    const doc = e ? powerItem({ ...e, name: p, uid: `power:${p}` }, powerType, ctx, [optional])
      : { name: p, type: powerType, flags: { [MODULE_ID]: { id: `power:${p}`, exportedAt: f.exportedAt, appVersion: f.appVersion } },
        system: { genesisID: '', description: optional ? sanitize(optional) : '' } }
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
  const items = runnerItems(r, { exportedAt, appVersion, sanitize, icons: iconSet(icons), say: t => own.push(t), entries: runnerEntries(r) })
  const b = beingActor(r.npc, { name, flags: { [MODULE_ID]: { id: r.id, exportedAt, appVersion } }, sanitize, icons })
  const s = b.actor.system
  s.description = sanitize(r.background)
  s.notes = sanitize(r.notes) + s.notes + sanitize(own.join('\n\n'))
  if (r.npc.kind === 'grunt' && r.metatype?.name) s.metatype = r.metatype.name
  // npc: an older file's stat block lines and where it came from, for its gear and weapon items from the world's
  // compendiums (foundry/apply.js npcLineItems); a file with npc.items has them already (beingActor)
  return { actor: b.actor, items: [...b.items, ...items], textOnly: [...b.lines, ...own].map(t => `${name}: ${t}`),
    npc: { lines: Array.isArray(r.npc.items) ? [] : r.npc.lines ?? [], from: r.npc.from ?? null } }
}

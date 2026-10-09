// One Chummer SR6 book (chummer-anarchy2 docs/sr6-export-format.md "Book") -> compendium document data, by type pack and category.
// Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { chummerFlags, chummerKey } from './chummer-id.js'
import { LINE_KINDS, matchThing, npcThings, overrideStats, thingTie } from './npc-lines.js'
import { lifestyleKey, modType, normKey } from './eden.js'
import { itemIconKey, withIcon } from './icons.js'
import {
  base, beingActor, critterPowerFields, escapeText, lineItem, martialArtItem, modItem, pickItem, programItem, qualityItem, techniqueItem,
  translateNpc, vehicleActor, weaknessLine,
} from './translate.js'

// One world compendium per TYPE, every book merged into it (a GM's compendium: its own set, lib/books.js planTypePacks).
// type key -> [label, document type], in write order. Eden's item and actor types, its big gear type split the way
// Commlink6 splits it (weapons, armor, cyberware, bioware, …).
export const TYPES = { weapons: ['Weapons', 'Item'], armor: ['Armor', 'Item'], cyberware: ['Cyberware', 'Item'], bioware: ['Bioware', 'Item'],
  geneware: ['Geneware & nanoware', 'Item'], electronics: ['Electronics', 'Item'], programs: ['Matrix programs', 'Item'],
  gear: ['Gear', 'Item'], mods: ['Mods & accessories', 'Item'], drugs: ['Drugs & toxins', 'Item'],
  vehicles: ['Vehicles & drones (items)', 'Item'], vehicleactors: ['Vehicles & drones (actors)', 'Actor'],
  qualities: ['Qualities', 'Item'], spells: ['Spells', 'Item'], rituals: ['Rituals', 'Item'], adeptpowers: ['Adept powers', 'Item'],
  complexforms: ['Complex forms', 'Item'], echoes: ['Echoes', 'Item'], metamagics: ['Metamagics', 'Item'], foci: ['Foci', 'Item'],
  critterpowers: ['Critter powers', 'Item'], spritepowers: ['Sprite powers', 'Item'], martialarts: ['Martial arts', 'Item'],
  lifestyles: ['Lifestyles', 'Item'], contacts: ['Contacts', 'Item'],
  npcs: ['NPCs', 'Actor'], critters: ['Critters', 'Actor'], spirits: ['Spirits', 'Actor'], sprites: ['Sprites', 'Actor'],
  rules: ['Rules', 'JournalEntry'], reference: ['Reference', 'JournalEntry'] }
// Every kind Eden has no document type for goes in the book's Reference compendium: one journal per kind, one page per
// entry (its printed stats, lines, text, source and page, and chummerID). Labels for the kinds Chummer knows; another
// kind (a newer Chummer's) is titled from its key.
export const REFERENCE = { priorities: 'Priorities', metatypes: 'Metatypes', attributes: 'Attributes', skills: 'Skills',
  grades: 'Augmentation grades', traditions: 'Traditions', lifemodules: 'Life modules', actions: 'Actions', packs: 'Gear packs',
  vehicledesign: 'Vehicle design', ammotypes: 'Ammunition types', mentorspirits: 'Mentor spirits', datastructures: 'Data structures',
  qualitypaths: 'Quality paths', spellfeatures: 'Spell features', contacttypes: 'Contact types', qualitysets: 'Quality sets',
  licencetypes: 'Licence types', magictypes: 'Magic types', ruleoptions: 'Optional rules', senses: 'Senses',
  trueelements: 'True elements', categories: 'Categories' }
const titled = k => String(k).replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase())
export const PORTRAIT = /^data:image\/(png|jpe?g);base64,/i
// World pack names may only hold [A-Za-z0-9-_] (BasePackage.validateId).
export const packName = s => s.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

// Our packs' names: world.<prefix>chummer-sr6-<type>, a GM compendium's world.<prefix>chummer-sr6-c-<id>-<type>. Never
// the 0.3 per-book names (world.<prefix>sr6-<book>-<topic>), which the import ignores and never touches.
export const PACK_PREFIX = 'chummer-sr6-'
export const typePackName = (key, prefix = '', compendium = null) => packName(`${prefix}${PACK_PREFIX}${compendium ? `c-${compendium}-` : ''}${key}`)
/** A world pack's collection id -> { key, compendium } when it is one of our type packs (with this prefix), else null. */
export function typeOfPack(collection, prefix = '') {
  const start = `world.${packName(`${prefix}${PACK_PREFIX}`)}`
  if (!String(collection).startsWith(start)) return null
  const rest = collection.slice(start.length), compendium = rest.startsWith('c-')
  const key = Object.keys(TYPES).find(k => (compendium ? rest.endsWith(`-${k}`) : rest === k))
  return key ? { key, compendium } : null
}

/**
 * The type packs importBooks writes for translated books (translateBook): every book's documents of a type merged into
 * that type's pack; a GM's compendium (source.compendium) gets its own pack per type, grouped by compendium. Only types
 * with documents: never an empty compendium. Merged packs first, in TYPES order, then each compendium's.
 * Returns [{ key, name, label, type, compendium: { id, name } | null, docs }].
 */
export function planTypePacks(ts, prefix = '') {
  const plans = new Map(), order = Object.keys(TYPES), comps = []
  for (const t of ts) for (const key of order) {
    const docs = t.packs[key]
    if (!docs?.length) continue
    const c = t.source.compendium === true ? t.source : null, name = typePackName(key, prefix, c?.id)
    if (c && !comps.includes(c.id)) comps.push(c.id)
    if (!plans.has(name)) plans.set(name, { key, name, type: TYPES[key][1], label: c ? `${TYPES[key][0]} — ${c.id} (House)` : TYPES[key][0],
      compendium: c ? { id: c.id, name: c.name } : null, docs: [] })
    plans.get(name).docs.push(...docs)
  }
  const rank = p => (p.compendium ? 1 + comps.indexOf(p.compendium.id) : 0) * order.length + order.indexOf(p.key)
  return [...plans.values()].sort((x, y) => rank(x) - rank(y))
}

// a translated document -> its type pack (TYPES key)
const GEAR_PACK = { ARMOR: 'armor', CYBERWARE: 'cyberware', BIOWARE: 'bioware', GENETICS: 'geneware', NANOWARE: 'geneware',
  ELECTRONICS: 'electronics', SOFTWARE: 'programs', CHEMICALS: 'drugs', AMMUNITION: 'weapons', VEHICLES: 'vehicles', DRONES: 'vehicles' }
const ITEM_PACK = { quality: 'qualities', spell: 'spells', ritual: 'rituals', adeptpower: 'adeptpowers', complexform: 'complexforms',
  echo: 'echoes', metamagic: 'metamagics', focus: 'foci', critterpower: 'critterpowers', spritepower: 'spritepowers',
  martialartstyle: 'martialarts', martialarttech: 'martialarts', lifestyle: 'lifestyles', contact: 'contacts', software: 'programs', mod: 'mods' }
const ACTOR_PACK = { NPC: 'npcs', Critter: 'critters', Spirit: 'spirits', sprite: 'sprites', Sprite: 'sprites', Vehicle: 'vehicleactors' }
export const MOD_CATEGORY = /\bmod(ification)?s?\b|accessor/i
/**
 * The type pack of a translated item or actor (a book's entry or a runner's item): its Eden type; a gear item by its
 * Eden gear type (weapons and ammunition: Weapons; drones and vehicles: Vehicles & drones); a modification or accessory
 * Eden has no mod for (a vehicle mod) with the mods, except an augmentation's (a cyberlimb accessory stays cyberware).
 * category: the entry's (default its flags.category). Journals are the caller's (rules, reference).
 */
export function typeKey(doc, category = doc?.flags?.[MODULE_ID]?.category) {
  if (ACTOR_PACK[doc.type]) return ACTOR_PACK[doc.type]
  if (doc.type !== 'gear') return ITEM_PACK[doc.type] ?? 'gear'
  const t = String(doc.system?.type ?? '')
  if (/^WEAPON/.test(t)) return 'weapons'
  if (/^DRONE/.test(t)) return 'vehicles'
  if (doc.flags?.[MODULE_ID]?.kind !== 'augmentations' && MOD_CATEGORY.test(category ?? '')) return 'mods'
  return GEAR_PACK[t] ?? 'gear'
}

// A folder name: the first letter capitalised, the rest as printed (Chummer's categories are lower case: "heavy pistols").
const sentence = s => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t && t[0].toUpperCase() + t.slice(1) }
const stem = s => normKey(s).replace(/s$/, '')
// never a folder: a category that says nothing ("Other", "General") or only names its kind or pack ("armor" in Armor)
export const GENERIC = /^(others?|general|misc\.?|miscellaneous|various|uncategori[sz]ed|none|unknown)$/i
// an Eden subtype as words: CYBER_EYEWARE -> Eyeware, PISTOLS_HEAVY -> Heavy pistols
const subtypeLabel = st => {
  let w = String(st ?? '').toLowerCase().split('_').filter(Boolean)
  if (w.length > 1 && ['cyber', 'bioware', 'nanites'].includes(w[0])) w = w.slice(1)
  else if (w.length === 2 && ['armor', 'pistols', 'rifle'].includes(w[0])) w = [w[1], w[0]]
  return sentence(w.join(' '))
}
const ACTIVATION = { major_action: 'Major action', minor_action: 'Minor action', passive: 'Passive' }
/**
 * The folder an entry goes in inside its type pack: Chummer's category (the table or section it is printed in), never
 * "Other" or "General". A technique: "<category> techniques"; a style: "Styles". Without a usable category, by the
 * entry's own data: a quality positive or negative, a program its type, a ritual its first keyword, an adept power its
 * activation, a complex form its duration, a metamagic who takes it, a critter power mana or physical, a lifestyle its
 * Eden level, a contact its archetype, an NPC its group or Professional Rating, an item its Eden subtype; rules and
 * reference journals, and whatever has none of these: its book's name.
 * e: the book entry ({ kind, attrs, npc? }), doc: its translated document, key: its type pack, book: the source's name.
 */
export function categoryOf(e, doc, key, book) {
  const a = e?.attrs ?? {}, s = doc?.system ?? {}, own = sentence(a.category)
  if (doc?.type === 'martialarttech') return own ? `${own} techniques` : 'Techniques'
  if (doc?.type === 'martialartstyle') return 'Styles'
  const usable = own && !GENERIC.test(own) && ![e?.kind, TYPES[key]?.[0], key].some(x => x && stem(x) === stem(own))
  if (usable && key !== 'rules' && key !== 'reference') return own.slice(0, 255)
  const rating = a.rating ?? e?.npc?.rating
  const derived = {
    qualities: () => (s.category === 'DISADVANTAGE' ? 'Negative' : 'Positive'),
    programs: () => sentence(a.type) || subtypeLabel(s.type),
    rituals: () => sentence(String(a.keywords ?? '').split(',')[0]),
    adeptpowers: () => ACTIVATION[s.activation],
    complexforms: () => sentence(s.duration),
    metamagics: () => ({ adept: 'Adepts', magician: 'Magicians' }[a.user] ?? 'All initiates'),
    critterpowers: () => (s.type === 'mana' ? 'Mana' : 'Physical'),
    lifestyles: () => sentence(s.type),
    contacts: () => sentence(a.archetype),
    npcs: () => sentence(a.group ?? e?.npc?.group) || (rating != null && rating !== '' ? `Professional rating ${rating}` : ''),
  }[key]
  const item = doc?.type === 'gear' || doc?.type === 'mod' ? subtypeLabel(s.subtype) || subtypeLabel(s.type) : ''
  return (derived?.() || item || sentence(book)).slice(0, 255)
}

/** Per book: how many of a pack's documents were created and replaced (flags.source). */
export function bookCounts(updates = [], creates = []) {
  const out = {}, src = d => d?.flags?.[MODULE_ID]?.source ?? '?'
  for (const u of updates) (out[src(u.doc)] ??= { created: 0, replaced: 0 }).replaced++
  for (const d of creates) (out[src(d)] ??= { created: 0, replaced: 0 }).created++
  return out
}
/** list in pieces of n (the last one shorter): one Foundry call per piece. */
export const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n))

/**
 * A martial art style found in the world (planUpsert's updates: { doc, hit }, the hit's index carrying system.genesisID)
 * keeps the genesisID it has there (Eden ties a runner's techniques to it), and the incoming techniques follow it.
 * Changes the docs in place; a new style keeps the random one translate.js gave it.
 */
export function keepStyleIds(updates, docs) {
  const remap = new Map()
  for (const u of updates) {
    const old = u.hit?.system?.genesisID, g = u.doc.system?.genesisID
    if (u.doc.type === 'martialartstyle' && old && old !== g) { remap.set(g, old); u.doc.system.genesisID = old }
  }
  for (const d of docs) if (d.type === 'martialarttech' && remap.has(d.system?.style)) d.system.style = remap.get(d.system.style)
}

const LINES = ['weapons', 'armor', 'augmentations', 'electronics', 'gear', 'vehicles']
const PICKS = ['spells', 'rituals', 'adeptpowers', 'complexforms', 'metamagics', 'echoes']
const BEING = { npcs: 'grunt', critters: 'critter', spirits: 'spirit', sprites: 'sprite' }
const SORT = 100000  // Foundry's CONST.SORT_INTEGER_DENSITY
const int = v => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0 }
/**
 * The kind of the item an accessory fits: its host's (attrs.accessoryOf, an entry id), else what its category says
 * (`Weapon accessories`, `Armor modifications`, `Vision enhancements`); null: not an accessory Eden has a mod for.
 */
export function accessoryHostKind(e, kindOf) {
  const host = String(e.attrs?.accessoryOf ?? '').split(/[\s,]+/).find(id => kindOf(id))
  if (host) return kindOf(host)
  const c = String(e.attrs?.category ?? '').toLowerCase()
  if (/(weapon|firearm|gun).*(accessor|\bmods?\b|modification)/.test(c)) return 'weapons'
  if (/armou?r.*(accessor|\bmods?\b|modification)/.test(c)) return 'armor'
  if (/(vision|visual|optic|audio|hearing).*enhancement|electronic.*accessor/.test(c)) return 'electronics'
  return null
}

/**
 * sanitize: plain text -> safe HTML, as for translateRunner. Book text goes in only when descriptions is true and the
 * entry has it; otherwise the description says "See <SOURCE> p.N".
 * Returns { source, packs: { [key]: docs[] }, portraits: { [chummerID]: dataUrl }, tokens: { [chummerID]: dataUrl }, textOnly: string[] }.
 */
export function translateBook(book, { exportedAt, appVersion, descriptions = false, sanitize = escapeText, icons = null, specs = {}, complexForms = {}, newGenesisId }) {
  const src = book.source, textOnly = [], packs = {}, portraits = {}, tokens = {}, iconSet = icons ? new Set(icons) : null
  const comp = src.compendium === true ? { compendium: true } : {}
  const see = x => `See ${x.source ?? src.id}${x.page ? ` p.${x.page}` : ''}`
  // specs, complexForms: Eden's own
  // tables as Foundry loaded them (foundry/apply.js)
  const ctx = { exportedAt, appVersion, sanitize, icons: iconSet, ref: see, say: l => textOnly.push(l), specs, complexForms, ...newGenesisId ? { newGenesisId } : {} }
  // a document into its type pack (typeKey; a journal: the key given), its category folder in flags.category (categoryOf)
  const add = (e, doc, key = typeKey(doc, e?.attrs?.category)) => {
    doc.flags[MODULE_ID].category = categoryOf(e, doc, key, src.name || src.id)
    ;(packs[key] ??= []).push(doc)
  }
  // the book's flags, with our identity (lib/chummer-id.js): chummerID <source>:<kind>:<id> and its earlier keys. No
  // _id anywhere: Foundry picks it, and a re-import finds the entry by chummerID (foundry/books.js).
  const bookFlags = (e, kind = e.kind) => ({ id: e.id, exportedAt, appVersion, ...chummerFlags(src.id, kind, e.id, e.aliases),
    source: src.id, page: e.page ?? null, canon: e.canon ?? src.canon, ...comp })
  // an item built by translate.js with the book's flags (flags.icon kept)
  const own = (kind, e, doc) => ({ ...doc, flags: { [MODULE_ID]: { ...doc.flags[MODULE_ID], ...bookFlags(e, kind) } } })
  const icon = (doc, e) => withIcon(doc, itemIconKey(doc), e.source ?? src.id, iconSet)
  const text = e => (descriptions && e.description ? e.description : undefined)
  // a journal (kind and id: its chummerID's, <source>:<kind>:<id>): a rules chapter, or a tradition (Eden has no
  // tradition item, only the actor's system.tradition); one page per entry in file order, at its heading level, each
  // page with its entry's chummerID (a re-import keeps the page's _id: foundry/books.js)
  const journal = (kind, id, name, page, list) => ({ name, flags: { [MODULE_ID]: bookFlags({ id, page }, kind) },
    pages: list.map((r, i) => ({ name: r.name || r.id, type: 'text', sort: (i + 1) * SORT,
      title: { show: true, level: Math.min(4, Math.max(1, int(r.attrs?.level) || 1)) }, flags: { [MODULE_ID]: bookFlags(r) },
      text: { content: sanitize(text(r) ?? see(r)), format: 1 } })) })

  const entries = book.entries ?? []
  // the book's critter powers, by name, for the fields of a being's powers (beingActor)
  const powers = Object.fromEntries(entries.filter(e => e.kind === 'critterpowers').map(e => [normKey(e.name), e]))
  // a style's signature technique (attrs.signature, by name) -> that style's id, for the technique's Eden style link
  const styleOf = {}
  const skipped = {}
  const kindById = new Map(entries.map(e => [e.id, e.kind])), kindOf = id => kindById.get(id) ?? null

  // an item entry (weapons … vehicles, programs) as its Eden document: a mod when it is an accessory Eden has a mod for
  // (hostKind: the kind of the item it fits, when known), else gear, focus or software
  const itemDoc = (e, hostKind = LINES.includes(e.kind) ? accessoryHostKind(e, kindOf) : null) => {
    const mod = hostKind && modType(hostKind, e.attrs?.category)
    return own(e.kind, e, mod ? modItem({ ...e, bonuses: undefined }, ctx, mod)
      : e.kind === 'programs' ? programItem(e, ctx) : lineItem({ ...e, qty: 1, bonuses: undefined }, ctx))
  }
  const ITEM_KINDS = [...LINES, 'programs']
  // A being's gear, weapon and augmentation lines as this book's items (lib/npc-lines.js): matched by name in the book,
  // the stat block's own values kept over the entry's, its "w/" accessories with it (a mod says what it's fitted to: a
  // pack actor's items get their ids only when written). Unmatched: the line stays text; tied: text and a report line.
  const thingItems = (being, npc) => {
    const out = []
    for (const th of npcThings(npc)) {
      const r = matchThing(th.name, entries.filter(x => ITEM_KINDS.includes(x.kind)), LINE_KINDS[th.part], being.page)
      if (r?.candidates) textOnly.push(`${being.name}: ${thingTie(th, r.candidates)}`)
      if (!r?.entry) continue
      const doc = itemDoc({ ...r.entry, description: text(r.entry) })
      const id = `line:${th.part}:${th.printed}`
      doc.flags[MODULE_ID] = { ...doc.flags[MODULE_ID], id, npcLine: th.printed }
      doc.system = overrideStats(doc.system, th.stats)
      out.push(doc)
      for (const acc of th.accessories) {
        const a = matchThing(acc, entries.filter(x => ITEM_KINDS.includes(x.kind)), null, being.page)
        if (a?.candidates) textOnly.push(`${being.name}: ${thingTie({ printed: acc }, a.candidates)}`)
        if (!a?.entry) continue
        const m = itemDoc({ ...a.entry, description: text(a.entry) }, r.entry.kind)
        m.flags[MODULE_ID] = { ...m.flags[MODULE_ID], id: `${id}:w/${acc}`, host: id, npcLine: th.printed }
        m.system.description += sanitize(`Fitted to ${doc.name}.`)
        out.push(m)
      }
    }
    return out
  }

  for (const raw of entries) {
    const kind = raw.kind, e = { ...raw, description: text(raw) }
    try {
      if (LINES.includes(kind)) {
        add(e, itemDoc(e))
        // a vehicle or drone is also a Vehicle actor, in the book's actor compendium (its chummerID's kind: vehicleactors)
        if (kind === 'vehicles') {
          const v = vehicleActor({ ...e, qty: 1 }, ctx)
          add(e, { ...v.actor, flags: { [MODULE_ID]: { ...v.actor.flags[MODULE_ID], ...bookFlags(e, 'vehicleactors') } }, items: [] })
        }
      }
      else if (PICKS.includes(kind)) add(e, own(kind, e, pickItem({ ...e, pick: kind, bonuses: undefined }, ctx)))
      else if (kind === 'programs') add(e, own(kind, e, programItem(e, ctx)))
      else if (kind === 'martialarts') {
        const doc = own(kind, e, martialArtItem(e, ctx))
        if (e.attrs?.signature) styleOf[normKey(e.attrs.signature)] = doc.system.genesisID
        add(e, doc)
      }
      else if (kind === 'martialtechniques') add(e, own(kind, e, techniqueItem(e, ctx, styleOf[normKey(e.name)])))
      else if (kind === 'qualities') add(e, own(kind, e, qualityItem({ ...e, positive: !/^\s*neg/i.test(e.attrs?.kind ?? '') }, ctx)))
      else if (kind === 'critterpowers') {
        // a power the book files as a sprite's: Eden's sprite power (no critter power fields)
        const sprite = /sprite/i.test(e.attrs?.category ?? ''), doc = base(e, sprite ? 'spritepower' : 'critterpower', ctx, [weaknessLine(e)])
        if (!sprite) Object.assign(doc.system, critterPowerFields(e))
        add(e, own(kind, e, icon(doc, e)))
      } else if (kind === 'lifestyles') {
        const key = lifestyleKey(e.name), doc = base(e, 'lifestyle', ctx)
        if (!key) ctx.say(`Lifestyle ${e.name}: not a shadowrun6-eden lifestyle → middle`)
        Object.assign(doc.system, { type: key ?? 'middle', paid: 0, cost: int(e.values?.cost ?? e.attrs?.cost) })
        add(e, own(kind, e, icon(doc, e)))
      } else if (kind === 'contacts') {
        const a = e.attrs ?? {}, v = e.values ?? {}, doc = base(e, 'contact', ctx)
        Object.assign(doc.system, { rating: int(v.connection ?? a.connection), loyalty: int(v.loyalty ?? a.loyalty), type: a.archetype ?? '' })
        add(e, own(kind, e, icon(doc, e)))
      } else if (BEING[kind]) {
        const npc = e.npc ?? { kind: BEING[kind], stats: [], lines: [], pools: [] }
        if (!e.npc) ctx.say(`${e.name}: no NPC block in the file → an empty ${BEING[kind]}`)
        const b = beingActor(npc, { name: e.name, flags: { [MODULE_ID]: bookFlags(e) }, sanitize, icons: iconSet, powers })
        b.actor.system.description = sanitize(e.description ?? see(e))
        add(e, { ...b.actor, items: [...b.items, ...thingItems(e, npc)] })
        textOnly.push(...b.lines.map(l => `${e.name}: ${l}`))
      } else if (kind !== 'rules') (skipped[kind] ??= []).push(raw)
    } catch (err) { textOnly.push(`${e.name ?? e.id}: not imported (${err?.message ?? err})`) }
  }
  // the kinds Eden has no document for: a Reference journal each, a page per entry
  const esc = v => String(v ?? '')
  const stats = e => [...Object.entries(e.attrs ?? {}).map(([k, v]) => `${k}: ${esc(v)}`), ...(e.parts ?? []).filter(x => x.text).map(x => `${x.tag}: ${x.text}`)]
  for (const [kind, list] of Object.entries(skipped)) {
    add({ kind }, { name: REFERENCE[kind] ?? titled(kind), flags: { [MODULE_ID]: bookFlags({ id: kind, page: list[0].page }, 'reference') },
      pages: list.map((e, i) => ({ name: e.name || e.id, type: 'text', sort: (i + 1) * SORT, title: { show: true, level: 1 },
        flags: { [MODULE_ID]: bookFlags(e) },
        text: { content: sanitize(stats(e).join('\n\n')) + sanitize(text(e) ?? '') + sanitize(see(e)), format: 1 } })) }, 'reference')
    if (!REFERENCE[kind]) textOnly.push(`${list.length} ${kind}: a kind this module doesn't know → Reference journal "${titled(kind)}"`)
  }

  // a GM's compendium: its NPCs (runners with npc) in their kind's pack, portrait and token uploaded by importBooks
  for (const r of book.npcs ?? []) {
    const name = r?.streetName || r?.id
    try {
      if (!r.npc) { textOnly.push(`${name}: not an NPC → not imported`); continue }
      const t = translateNpc(r, { exportedAt: r.exportedAt ?? exportedAt, appVersion, sanitize, icons: iconSet })
      const key = chummerKey(src.id, 'npc', r.id)
      add({ kind: 'npcs', attrs: {}, npc: r.npc }, { ...t.actor, flags: { [MODULE_ID]: { ...t.actor.flags[MODULE_ID], chummerID: key, chummerAliases: [], source: src.id, canon: src.canon, ...comp } },
        items: t.items })
      if (PORTRAIT.test(r.portrait ?? '')) portraits[key] = r.portrait
      if (PORTRAIT.test(r.token ?? '')) tokens[key] = r.token
      textOnly.push(...t.textOnly)
    } catch (err) { textOnly.push(`${name}: not imported (${err?.message ?? err})`) }
  }

  // one journal per chapter (Foundry refuses a nameless journal: "Rules" when the file has none), its rules as pages in
  // file order at their heading level
  const chapters = new Map()
  for (const r of entries.filter(e => e.kind === 'rules')) {
    const ch = r.attrs?.chapter || 'Rules'
    chapters.set(ch, [...chapters.get(ch) ?? [], r])
  }
  for (const [chapter, rules] of chapters)
    add({ kind: 'rules' }, journal('rules-chapter', chapter, chapter, rules[0].page, rules), 'rules')
  return { source: src, packs, portraits, tokens, textOnly }
}

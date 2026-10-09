// One Chummer SR6 book (chummer-anarchy2 docs/sr6-export-format.md "Book") -> compendium document data, one pack per topic.
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

// pack key -> [label, document type], in write order
export const PACKS = { qualities: ['Qualities', 'Item'], weapons: ['Weapons', 'Item'], armor: ['Armor', 'Item'],
  augmentations: ['Augmentations', 'Item'], electronics: ['Electronics', 'Item'], programs: ['Programs', 'Item'], gear: ['Gear', 'Item'],
  vehicles: ['Vehicles & drones', 'Item'], vehicleactors: ['Vehicles & drones (actors)', 'Actor'], spells: ['Spells', 'Item'], rituals: ['Rituals', 'Item'], adeptpowers: ['Adept powers', 'Item'],
  complexforms: ['Complex forms', 'Item'], metamagics: ['Metamagics', 'Item'], echoes: ['Echoes', 'Item'],
  martialarts: ['Martial arts', 'Item'], martialtechniques: ['Martial art techniques', 'Item'],
  critterpowers: ['Critter powers', 'Item'], lifestyles: ['Lifestyles', 'Item'], contacts: ['Contacts', 'Item'],
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

/**
 * The packs importBook writes for a translated book: one per pack key with at least one document, in PACKS order.
 * Never an empty compendium: a book with nothing Eden uses plans nothing, and importBook then makes no folder either.
 */
export const planBookPacks = (t, prefix = '') => Object.keys(PACKS).filter(k => t.packs[k]?.length)
  .map(k => ({ key: k, docs: t.packs[k], type: PACKS[k][1], name: packName(`${prefix}sr6-${t.source.id}-${k}`),
    label: `${PACKS[k][0]} — ${t.source.id}${t.source.compendium ? ' (House)' : ''}` }))

const LINES = ['weapons', 'armor', 'augmentations', 'electronics', 'gear', 'vehicles']
const PICKS = ['spells', 'rituals', 'adeptpowers', 'complexforms', 'metamagics', 'echoes']
const BEING = { npcs: 'grunt', critters: 'critter', spirits: 'spirit', sprites: 'sprite' }
const PACK_OF_KIND = { grunt: 'npcs', critter: 'critters', spirit: 'spirits', sprite: 'sprites' }
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
  const add = (pack, doc) => (packs[pack] ??= []).push(doc)
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
        add(kind, itemDoc(e))
        // a vehicle or drone is also a Vehicle actor, in the book's actor compendium (its chummerID's kind: vehicleactors)
        if (kind === 'vehicles') {
          const v = vehicleActor({ ...e, qty: 1 }, ctx)
          add('vehicleactors', { ...v.actor, flags: { [MODULE_ID]: { ...v.actor.flags[MODULE_ID], ...bookFlags(e, 'vehicleactors') } }, items: [] })
        }
      }
      else if (PICKS.includes(kind)) add(kind, own(kind, e, pickItem({ ...e, pick: kind, bonuses: undefined }, ctx)))
      else if (kind === 'programs') add(kind, own(kind, e, programItem(e, ctx)))
      else if (kind === 'martialarts') {
        const doc = own(kind, e, martialArtItem(e, ctx))
        if (e.attrs?.signature) styleOf[normKey(e.attrs.signature)] = doc.system.genesisID
        add(kind, doc)
      }
      else if (kind === 'martialtechniques') add(kind, own(kind, e, techniqueItem(e, ctx, styleOf[normKey(e.name)])))
      else if (kind === 'qualities') add(kind, own(kind, e, qualityItem({ ...e, positive: !/^\s*neg/i.test(e.attrs?.kind ?? '') }, ctx)))
      else if (kind === 'critterpowers') {
        const doc = base(e, 'critterpower', ctx, [weaknessLine(e)])
        Object.assign(doc.system, critterPowerFields(e))
        add(kind, own(kind, e, icon(doc, e)))
      } else if (kind === 'lifestyles') {
        const key = lifestyleKey(e.name), doc = base(e, 'lifestyle', ctx)
        if (!key) ctx.say(`Lifestyle ${e.name}: not a shadowrun6-eden lifestyle → middle`)
        Object.assign(doc.system, { type: key ?? 'middle', paid: 0, cost: int(e.values?.cost ?? e.attrs?.cost) })
        add(kind, own(kind, e, icon(doc, e)))
      } else if (kind === 'contacts') {
        const a = e.attrs ?? {}, v = e.values ?? {}, doc = base(e, 'contact', ctx)
        Object.assign(doc.system, { rating: int(v.connection ?? a.connection), loyalty: int(v.loyalty ?? a.loyalty), type: a.archetype ?? '' })
        add(kind, own(kind, e, icon(doc, e)))
      } else if (BEING[kind]) {
        const npc = e.npc ?? { kind: BEING[kind], stats: [], lines: [], pools: [] }
        if (!e.npc) ctx.say(`${e.name}: no NPC block in the file → an empty ${BEING[kind]}`)
        const b = beingActor(npc, { name: e.name, flags: { [MODULE_ID]: bookFlags(e) }, sanitize, icons: iconSet, powers })
        b.actor.system.description = sanitize(e.description ?? see(e))
        add(kind, { ...b.actor, items: [...b.items, ...thingItems(e, npc)] })
        textOnly.push(...b.lines.map(l => `${e.name}: ${l}`))
      } else if (kind !== 'rules') (skipped[kind] ??= []).push(raw)
    } catch (err) { textOnly.push(`${e.name ?? e.id}: not imported (${err?.message ?? err})`) }
  }
  // the kinds Eden has no document for: a Reference journal each, a page per entry
  const esc = v => String(v ?? '')
  const stats = e => [...Object.entries(e.attrs ?? {}).map(([k, v]) => `${k}: ${esc(v)}`), ...(e.parts ?? []).filter(x => x.text).map(x => `${x.tag}: ${x.text}`)]
  for (const [kind, list] of Object.entries(skipped)) {
    add('reference', { name: REFERENCE[kind] ?? titled(kind), flags: { [MODULE_ID]: bookFlags({ id: kind, page: list[0].page }, 'reference') },
      pages: list.map((e, i) => ({ name: e.name || e.id, type: 'text', sort: (i + 1) * SORT, title: { show: true, level: 1 },
        flags: { [MODULE_ID]: bookFlags(e) },
        text: { content: sanitize(stats(e).join('\n\n')) + sanitize(text(e) ?? '') + sanitize(see(e)), format: 1 } })) })
    if (!REFERENCE[kind]) textOnly.push(`${list.length} ${kind}: a kind this module doesn't know → Reference journal "${titled(kind)}"`)
  }

  // a GM's compendium: its NPCs (runners with npc) in their kind's pack, portrait and token uploaded by importBook
  for (const r of book.npcs ?? []) {
    const name = r?.streetName || r?.id
    try {
      if (!r.npc) { textOnly.push(`${name}: not an NPC → not imported`); continue }
      const t = translateNpc(r, { exportedAt: r.exportedAt ?? exportedAt, appVersion, sanitize, icons: iconSet })
      const pack = PACK_OF_KIND[r.npc.kind] ?? 'npcs', key = chummerKey(src.id, 'npc', r.id)
      add(pack, { ...t.actor, flags: { [MODULE_ID]: { ...t.actor.flags[MODULE_ID], chummerID: key, chummerAliases: [], source: src.id, canon: src.canon, ...comp } },
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
    add('rules', journal('rules-chapter', chapter, chapter, rules[0].page, rules))
  return { source: src, packs, portraits, tokens, textOnly }
}

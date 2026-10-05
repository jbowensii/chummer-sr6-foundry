// One Chummer SR6 book (chummer-anarchy2 docs/sr6-export-format.md "Book") -> compendium document data, one pack per topic.
// Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { docId } from './ids.js'
import { lifestyleKey, normKey } from './eden.js'
import { itemIconKey, withIcon } from './icons.js'
import {
  base, beingActor, critterPowerFields, escapeText, lineItem, martialArtItem, pickItem, programItem, qualityItem, techniqueItem, translateNpc,
  weaknessLine,
} from './translate.js'

// pack key -> [label, document type], in write order
export const PACKS = { qualities: ['Qualities', 'Item'], weapons: ['Weapons', 'Item'], armor: ['Armor', 'Item'],
  augmentations: ['Augmentations', 'Item'], electronics: ['Electronics', 'Item'], programs: ['Programs', 'Item'], gear: ['Gear', 'Item'],
  vehicles: ['Vehicles & drones', 'Item'], spells: ['Spells', 'Item'], rituals: ['Rituals', 'Item'], adeptpowers: ['Adept powers', 'Item'],
  complexforms: ['Complex forms', 'Item'], metamagics: ['Metamagics', 'Item'], echoes: ['Echoes', 'Item'],
  martialarts: ['Martial arts', 'Item'], martialtechniques: ['Martial art techniques', 'Item'], traditions: ['Traditions', 'JournalEntry'],
  critterpowers: ['Critter powers', 'Item'], lifestyles: ['Lifestyles', 'Item'], contacts: ['Contacts', 'Item'],
  npcs: ['NPCs', 'Actor'], critters: ['Critters', 'Actor'], spirits: ['Spirits', 'Actor'], sprites: ['Sprites', 'Actor'],
  rules: ['Rules', 'JournalEntry'] }
export const UNUSED = ['priorities', 'metatypes', 'attributes', 'skills', 'lifemodules']  // Eden has fixed skills and no metatype item
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
 * sanitize: plain text -> safe HTML, as for translateRunner. Book text goes in only when descriptions is true and the
 * entry has it; otherwise the description says "See <SOURCE> p.N".
 * Returns { source, packs: { [key]: docs[] }, portraits: { [_id]: dataUrl }, tokens: { [_id]: dataUrl }, textOnly: string[] }.
 */
export function translateBook(book, { exportedAt, appVersion, descriptions = false, sanitize = escapeText, icons = null }) {
  const src = book.source, textOnly = [], packs = {}, portraits = {}, tokens = {}, iconSet = icons ? new Set(icons) : null
  const comp = src.compendium === true ? { compendium: true } : {}
  const see = x => `See ${x.source ?? src.id}${x.page ? ` p.${x.page}` : ''}`
  const ctx = { exportedAt, appVersion, sanitize, icons: iconSet, ref: see, say: l => textOnly.push(l) }
  const add = (pack, doc) => (packs[pack] ??= []).push(doc)
  const bookFlags = e => ({ id: e.id, exportedAt, appVersion, source: src.id, page: e.page ?? null, canon: e.canon ?? src.canon, ...comp })
  // an item built by translate.js: our _id, the book's flags (flags.icon kept)
  const own = (kind, e, doc) => ({ _id: docId(`${src.id}:${kind}:${e.id}`), ...doc,
    flags: { [MODULE_ID]: { ...doc.flags[MODULE_ID], ...bookFlags(e) } } })
  const icon = (doc, e) => withIcon(doc, itemIconKey(doc), e.source ?? src.id, iconSet)
  const text = e => (descriptions && e.description ? e.description : undefined)
  // a journal (key: its _id seed; flags.id the entry id, else the key): a rules chapter, or a tradition (Eden has no
  // tradition item, only the actor's system.tradition); one page per entry in file order, at its heading level
  const journal = (key, name, page, list, id = key) => ({ _id: docId(key), name, flags: { [MODULE_ID]: bookFlags({ id, page }) },
    pages: list.map((r, i) => ({ _id: docId(`${src.id}:${r.kind}:${r.id}`), name: r.name || r.id, type: 'text', sort: (i + 1) * SORT,
      title: { show: true, level: Math.min(4, Math.max(1, int(r.attrs?.level) || 1)) }, flags: { [MODULE_ID]: bookFlags(r) },
      text: { content: sanitize(text(r) ?? see(r)), format: 1 } })) })

  const entries = book.entries ?? []
  // the book's critter powers, by name, for the fields of a being's powers (beingActor)
  const powers = Object.fromEntries(entries.filter(e => e.kind === 'critterpowers').map(e => [normKey(e.name), e]))
  // a style's signature technique (attrs.signature, by name) -> that style's id, for the technique's Eden style link
  const styleOf = Object.fromEntries(entries.filter(e => e.kind === 'martialarts' && e.attrs?.signature).map(e => [normKey(e.attrs.signature), e.id]))
  const skipped = {}

  for (const raw of entries) {
    const kind = raw.kind, e = { ...raw, description: text(raw) }
    try {
      if (LINES.includes(kind)) add(kind, own(kind, e, lineItem({ ...e, qty: 1, bonuses: undefined }, ctx)))
      else if (PICKS.includes(kind)) add(kind, own(kind, e, pickItem({ ...e, pick: kind, bonuses: undefined }, ctx)))
      else if (kind === 'programs') add(kind, own(kind, e, programItem(e, ctx)))
      else if (kind === 'martialarts') add(kind, own(kind, e, martialArtItem(e, ctx)))
      else if (kind === 'martialtechniques') add(kind, own(kind, e, techniqueItem(e, ctx, styleOf[normKey(e.name)])))
      else if (kind === 'traditions') add(kind, journal(`${src.id}:traditions:${e.id}`, e.name, e.page, [e], e.id))
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
        add(kind, { _id: docId(`${src.id}:${kind}:${e.id}`), ...b.actor, items: b.items })
        textOnly.push(...b.lines.map(l => `${e.name}: ${l}`))
      } else if (kind !== 'rules') (skipped[kind] ??= []).push(e)
    } catch (err) { textOnly.push(`${e.name ?? e.id}: not imported (${err?.message ?? err})`) }
  }
  for (const [kind, list] of Object.entries(skipped))
    textOnly.push(UNUSED.includes(kind) ? `${list.length} ${kind}: not used by Eden` : `${list.length} ${kind}: kind not known → not imported`)

  // a GM's compendium: its NPCs (runners with npc) in their kind's pack, portrait and token uploaded by importBook
  for (const r of book.npcs ?? []) {
    const name = r?.streetName || r?.id
    try {
      if (!r.npc) { textOnly.push(`${name}: not an NPC → not imported`); continue }
      const t = translateNpc(r, { exportedAt: r.exportedAt ?? exportedAt, appVersion, sanitize, icons: iconSet })
      const pack = PACK_OF_KIND[r.npc.kind] ?? 'npcs', _id = docId(`${src.id}:npc:${r.id}`)
      add(pack, { _id, ...t.actor, flags: { [MODULE_ID]: { ...t.actor.flags[MODULE_ID], source: src.id, canon: src.canon, ...comp } }, items: t.items })
      if (PORTRAIT.test(r.portrait ?? '')) portraits[_id] = r.portrait
      if (PORTRAIT.test(r.token ?? '')) tokens[_id] = r.token
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
    add('rules', journal(`${src.id}:rules-chapter:${chapter}`, chapter, rules[0].page, rules))
  return { source: src, packs, portraits, tokens, textOnly }
}

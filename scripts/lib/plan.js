// Pure import decisions: what to do with a runner already in the world, and what Replace may overwrite.
import { MODULE_ID } from './constants.js'
import { replaceable } from './icons.js'
import { docId } from './ids.js'

const time = x => Date.parse(x?.exportedAt ?? '') || 0

// none in the world -> create; the world copy came from a newer file -> skip; otherwise replace.
export const defaultChoice = (existing, incoming) =>
  !existing ? 'create' : time(incoming) < time(existing) ? 'skip' : 'replace'

// Fixed month names: ICU's en-GB 'short' month is "Sept" on newer runtimes. Local date: what the GM's calendar says.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function newVersionName(streetName, exportedAt) {
  const d = new Date(exportedAt)
  return `${streetName} (${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()})`
}
const DATED = new RegExp(` \\(\\d{1,2} (${MONTHS.join('|')}) \\d{4}\\)$`)

// Eden play state (system paths): set on create (apply.js fills edge.value) or in play, never in a Replace update. The
// translation writes none but edge.value's sibling edge.max; the rest are dropped here too, so Replace can't reset them.
// (physical.mod and stun.mod are the translation's: the extra boxes; damage stays)
const START_ONLY = ['edge.value', 'physical.dmg', 'physical.value', 'stun.dmg', 'stun.value', 'overflow', 'heat', 'reputation', 'matrixIni', 'persona']
const unset = (o, path) => { const ks = path.split('.'), last = ks.pop(); const p = ks.reduce((x, k) => x?.[k], o); if (p) delete p[last] }

/**
 * The Replace update for a translated actor: its name, image, flags and the system fields the translation produces,
 * less START_ONLY. Play state (damage, Edge spent, heat, reputation, ownership, token settings and a custom token image)
 * is never in it. A world copy named like a new version ("Mara (2 Oct 2026)") keeps its dated name. The image changes
 * only while the world copy's is replaceable (lib/icons.js): art the user chose is never overwritten.
 */
export function replaceUpdate(translated, existingName = '', existingImg = '') {
  const system = structuredClone(translated.system)
  for (const k of START_ONLY) unset(system, k)
  const u = { name: DATED.test(existingName) ? existingName : translated.name, flags: structuredClone(translated.flags), system }
  if (translated.img && replaceable(existingImg)) u.img = translated.img
  return u
}

// A new token image (the file's token, else its portrait or icon): set only while the token shows replaceable art
// (empty, a stock default, the module's or an uploaded portrait/token). A token image the GM chose stays.
export const tokenUpdate = (existing, img) => img && replaceable(existing?.prototypeToken?.texture?.src)
  ? { 'prototypeToken.texture.src': img } : {}

const flagId = d => d?.flags?.[MODULE_ID]?.id
// Recreated flagged items take the old item's image (matched by flag id) when the user chose it (not replaceable).
export function keepItemArt(oldItems, newItems) {
  const chosen = new Map([...oldItems ?? []].filter(i => flagId(i) != null && !replaceable(i.img)).map(i => [flagId(i), i.img]))
  return newItems.map(i => chosen.has(flagId(i)) ? { ...i, img: chosen.get(flagId(i)) } : i)
}

// A replaced pack entry keeps the image (and token image) the user chose, and a replaced actor's recreated items keep theirs.
export function keepArt(old, doc) {
  const d = replaceable(old?.img) ? { ...doc } : { ...doc, img: old.img }
  const tok = old?.prototypeToken?.texture?.src
  if (tok && !replaceable(tok)) d.prototypeToken = { ...doc.prototypeToken, texture: { ...doc.prototypeToken?.texture, src: tok } }
  if (Array.isArray(doc.items)) d.items = keepItemArt(old?.items, doc.items)
  return d
}

// Re-import by id: incoming entries already in the pack are replaced (deleted, then created with the same id), the
// rest are created. Pack entries not in the file are never touched. An id the file has twice keeps its last entry
// (`docs` is what to write); the dropped earlier ones are listed in `duplicates` for the report.
export function planPack(existingIds, incoming) {
  const byId = new Map(), duplicates = []
  for (const d of incoming) {
    if (byId.has(d._id)) duplicates.push(byId.get(d._id))
    byId.set(d._id, d)
  }
  const docs = [...byId.values()], replace = [], create = []
  for (const { _id } of docs) (existingIds.has(_id) ? replace : create).push(_id)
  return { replace, create, docs, duplicates }
}

// Replacing a journal: its pages are rebuilt from the file; only the old pages without this module's flag (the GM's
// own) are kept, after the imported ones. A stale or renamed imported page does not linger.
export const mergeJournalPages = (existingPages, incomingPages) =>
  [...incomingPages, ...(existingPages ?? []).filter(p => !p.flags?.[MODULE_ID])]

// Replacing a pack actor (a book pregen): its Chummer items are rebuilt from the file; the items the GM added
// (no module flags) are kept, after the imported ones.
export const mergeActorItems = (existingItems, incomingItems) =>
  [...incomingItems, ...(existingItems ?? []).filter(i => !i.flags?.[MODULE_ID])]

/**
 * Fitted items on one actor: each item whose flags.host names another item's uid (flags.id) gets that host's document id
 * in system.embeddedInUuid (Eden's mod and software link: Actor.<id>.Item.<id>), and each host a fresh _id (newId) so the
 * link holds when they are created together with keepId. A host that isn't among the items: no link (the item stays
 * loose, as if unfitted). Returns new item data; the inputs are untouched.
 */
export function fitItems(items, actorId, newId) {
  const out = items.map(i => structuredClone(i)), byUid = new Map()
  const hosts = new Set(out.map(i => i.flags?.[MODULE_ID]?.host).filter(Boolean))
  for (const i of out) {
    const uid = i.flags?.[MODULE_ID]?.id
    if (uid != null && hosts.has(uid) && !byUid.has(uid)) { i._id ??= newId(); byUid.set(uid, i._id) }
  }
  for (const i of out) {
    const host = byUid.get(i.flags?.[MODULE_ID]?.host)
    if (host) i.system.embeddedInUuid = `Actor.${actorId}.Item.${host}`
  }
  return out
}

/**
 * Where a runner's item came from in this module's world compendiums (lib/books.js: pack sr6-<source>-<kind>, document
 * docId(<source>:<kind>:<catalog id>)): { pack: the world pack's collection id, id, uuid }, or null for a custom item.
 * The caller links it (_stats.compendiumSource) only when that pack holds the document.
 */
export function compendiumRef(item, prefix = '') {
  const f = item.flags?.[MODULE_ID] ?? {}
  if (!f.catalogId || !f.source || !f.kind) return null
  const name = `${prefix}sr6-${f.source}-${f.kind}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-'), id = docId(`${f.source}:${f.kind}:${f.catalogId}`)
  return { pack: `world.${name}`, id, uuid: `Compendium.world.${name}.Item.${id}` }
}

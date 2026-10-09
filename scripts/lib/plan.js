// Pure import decisions: what to do with a runner already in the world, and what Replace may overwrite.
import { MODULE_ID } from './constants.js'
import { replaceable } from './icons.js'

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

// Replacing a pack actor (a book pregen): its Chummer items are rebuilt from the file; the items the GM added
// (no module flags) are kept, after the imported ones.
export const mergeActorItems = (existingItems, incomingItems) =>
  [...incomingItems, ...(existingItems ?? []).filter(i => !i.flags?.[MODULE_ID])]

/**
 * Fitting items to their hosts once Foundry has given them ids: each created item whose flags.host names another
 * created item's uid (flags.id) gets that host in system.embeddedInUuid (Eden's mod and software link,
 * Actor.<id>.Item.<id>). created: the actor's items as created ({ id, flags }). Returns the updates
 * ([{ _id, 'system.embeddedInUuid' }]); a host that isn't on the actor: no update (the item stays loose).
 */
export function fitUpdates(created, actorId) {
  const byUid = new Map(created.filter(i => i.flags?.[MODULE_ID]?.id != null).map(i => [i.flags[MODULE_ID].id, i.id ?? i._id]))
  return created.flatMap(i => {
    const host = byUid.get(i.flags?.[MODULE_ID]?.host)
    return host ? [{ _id: i.id ?? i._id, 'system.embeddedInUuid': `Actor.${actorId}.Item.${host}` }] : []
  })
}

// Icon choice for imported documents. Pure: no Foundry calls. Paths in the index are relative to the module root.
import { MODULE_ID } from './constants.js'

export const MODULE_ICON_ROOT = `modules/${MODULE_ID}/`

// lowercase, non-alphanumerics -> '-', trimmed (Chummer's id rule)
export const slugName = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * The module path of the best icon, or null. index: icons/index.json (array or Set). Order: book-specific item file,
 * item file by name, the full-key default, the category default.
 */
export function iconFor(key, name, book, index) {
  const has = index instanceof Set ? index : new Set(index ?? [])
  const slug = slugName(name), b = slugName(book), cat = String(key ?? '').split('/')[0]
  const hit = [b && slug && `icons/items/${b}.${slug}.webp`, slug && `icons/items/${slug}.webp`,
    key && `icons/defaults/${key}.webp`, cat && `icons/defaults/${cat}.webp`].find(p => p && has.has(p))
  return hit ? MODULE_ICON_ROOT + hit : null
}

// Replace only empty images, Foundry's stock svg defaults, shadowrun6-eden's defaults, the module's own art and the
// portraits and tokens the importer uploads (worlds/<world>/chummer/portraits|tokens, foundry/apply.js uploadPortrait).
// Anything else the user chose.
export function replaceable(img) {
  const p = String(img ?? '').trim().replace(/^\/+/, '')
  return !p || p.startsWith('icons/svg/') || p.startsWith('systems/shadowrun6-eden/') || p.startsWith(MODULE_ICON_ROOT)
    || /^worlds\/[^/]+\/chummer\/(portraits|tokens)\//.test(p)
}

// Stores flags.icon (always) and sets img when an icon resolves (icons: the index as a Set, or null for none).
export function withIcon(doc, key, book, icons) {
  doc.flags[MODULE_ID].icon = { key, name: doc.name, book: book ?? null }
  const img = icons && iconFor(key, doc.name, book, icons)
  if (img) doc.img = img
  return doc
}

const DRONE = { DRONE_MICRO: 'micro', DRONE_MINI: 'mini', DRONE_SMALL: 'small', DRONE_MEDIUM: 'medium', DRONE_LARGE: 'large' }
const ELECTRONICS = { COMMLINK: 'electronics/commlink', CYBERDECK: 'electronics/cyberdeck' }
const lower = s => String(s ?? '').toLowerCase()
/** An Eden item's data (as translate.js builds it) -> its icon key (tools/icon-defaults.json). */
export function itemIconKey(it) {
  const s = it.system ?? {}, t = s.type ?? ''
  switch (it.type) {
    case 'gear':
      if (t.startsWith('WEAPON')) return s.subtype ? `weapon/${lower(s.subtype)}` : 'weapon'
      if (t === 'ARMOR') return 'armor'
      if (t === 'CYBERWARE' || t === 'NANOWARE') return 'augmentation/cyberware'
      if (t === 'BIOWARE' || t === 'GENETICS') return 'augmentation/bioware'
      if (t === 'ELECTRONICS') return ELECTRONICS[s.subtype] ?? 'electronics'
      if (t === 'VEHICLES') return s.subtype ? `vehicle/${lower(s.subtype)}` : 'vehicle'
      if (DRONE[t]) return `drone/${DRONE[t]}`
      if (t === 'DRONES') return 'drone'
      return 'gear'
    case 'spell': return s.category ? `spell/${s.category}` : 'spell'
    case 'quality': return `quality/${s.category === 'DISADVANTAGE' ? 'negative' : 'positive'}`
    case 'skill': return `skill/${s.genesisID === 'language' ? 'language' : 'knowledge'}`
    // a fitted accessory: its host's look
    case 'mod': return /weapon/.test(t) ? 'weapon' : t === 'armor_mod' ? 'armor' : 'electronics'
    default: return it.type  // focus, ritual, adeptpower, complexform, metamagic, echo, critterpower, spritepower, contact, lifestyle, sin
  }
}
/** An NPC block's kind -> its actor icon key. */
export const npcIconKey = kind => (kind === 'critter' || kind === 'spirit' || kind === 'sprite' ? `npc/${kind}` : 'npc')

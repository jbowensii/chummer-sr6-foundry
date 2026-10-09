// An NPC's or critter's gear, weapon and augmentation lines from its printed stat block, to real compendium items: each
// line split into things (a top-level comma list), each thing's name, its bracketed stats and its "w/" accessories,
// matched by name (the same matching as a runner's items, a line having no chummerID): the kinds its part names, the
// first of those kinds winning a tie, then the NPC's own book, then its own page. Still tied: no item, and the report
// lists the candidates; unmatched: the line stays text (the notes). Pure: no Foundry calls.
import { splitTop } from './translate.js'

const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
/** A stat block part -> the catalog kinds its things are, in tie-break order. */
export const LINE_KINDS = { weapons: ['weapons'], gear: ['gear', 'electronics', 'armor', 'programs', 'vehicles'], augmentations: ['augmentations'] }

/**
 * One printed thing: `Made-up Zapper [Pistol, DV 2S, AR 9/7/—/—/—, SA, w/ laser sight]`, `Glitter Rope`,
 * `Test Link (R3)`. Returns { name, printed, stats: { dv?, stun?, dvText?, ar?, modes?, ammo?, rating? }, accessories: [names] }.
 */
export function parseThing(text) {
  const printed = String(text ?? '').trim()
  // the bracket the thing ends with, from its first opening: nested brackets (`6(m)`) stay inside
  const close = printed.slice(-1), open = { ']': '[', ')': '(' }[close], at = open ? printed.indexOf(open) : -1
  const name = (at > 0 ? printed.slice(0, at) : printed).trim(), inner = at > 0 ? splitTop(printed.slice(at + 1, -1)) : []
  const stats = {}, accessories = []
  for (const raw of inner) {
    const t = raw.trim()
    let x
    if ((x = t.match(/^(?:w\/|with\s+)\s*(.+)$/i))) accessories.push(...x[1].split(/\s+(?:and|&)\s+|\s*\+\s*/i).map(s => s.trim()).filter(Boolean))
    else if ((x = t.match(/^DV\s*(\d+)\s*([PS])?/i))) Object.assign(stats, { dv: Number(x[1]), stun: /s/i.test(x[2] ?? ''), dvText: t.replace(/^DV\s*/i, '') })
    else if ((x = t.match(/^AR\s*([\d—–-]+(?:\s*\/\s*[\d—–-]+){0,4})$/i))) stats.ar = x[1].split('/').map(v => (/^\s*\d+\s*$/.test(v) ? Number(v) : 0))
    else if ((x = t.match(/^(?:R|Rating)\s*(\d+)$/i))) stats.rating = Number(x[1])
    else if ((x = t.match(/^(\d+)\s*\(\w+\)$/))) stats.ammo = Number(x[1])
    else if (/^(SS|SA|BF|FA)(\s*\/\s*(SS|SA|BF|FA))*$/i.test(t)) stats.modes = t.toUpperCase().split(/\s*\/\s*/)
  }
  return { name, printed, stats, accessories }
}

/** The NPC's lines of the parts that hold things (LINE_KINDS), split into things. */
export const npcThings = npc => (npc?.lines ?? []).filter(l => LINE_KINDS[l.part])
  .flatMap(l => splitTop(l.text).map(t => ({ part: l.part, ...parseThing(t) })))

/**
 * A thing's catalog entry. entries: the entries to look in ({ kind, name, page, source, … }: a book's own, or every book's
 * in this world's type packs); kinds: LINE_KINDS[part] (or any kind for an accessory); page and source: the NPC's page
 * and book, preferred in a tie (the book first). Returns { entry }, { candidates }, or null.
 */
export function matchThing(name, entries, kinds, page, source = null) {
  let list = entries.filter(e => (!kinds || kinds.includes(e.kind)) && norm(e.name) === norm(name))
  if (list.length > 1 && kinds) { const first = kinds.find(k => list.some(e => e.kind === k)); list = list.filter(e => e.kind === first) }
  if (list.length > 1 && source) { const same = list.filter(e => e.source === source); if (same.length) list = same }
  if (list.length > 1 && page != null) { const same = list.filter(e => e.page === page); if (same.length) list = same }
  return list.length === 1 ? { entry: list[0] } : list.length > 1 ? { candidates: list } : null
}

/** The stat block's own values over a weapon's or gear item's (Eden gear fields), where it prints them. */
export function overrideStats(system, stats) {
  const s = { ...system }
  if (stats.dv != null) Object.assign(s, { dmg: stats.dv, stun: stats.stun, dmgDef: stats.dvText ?? String(stats.dv) })
  if (stats.ar) s.attackRating = [0, 1, 2, 3, 4].map(i => stats.ar[i] ?? 0)
  if (stats.modes) s.modes = Object.fromEntries(['SS', 'SA', 'BF', 'FA'].map(m => [m, stats.modes.includes(m)]))
  if (stats.ammo != null) s.ammocap = stats.ammo
  if (stats.rating != null) Object.assign(s, { rating: stats.rating, needsRating: true })
  return s
}

/** The report line for a thing left as text because several entries tie. */
export const thingTie = (thing, candidates) => `${thing.printed}: ${candidates.length} compendium entries match (${
  candidates.map(c => `${c.name}${c.kind ? ` [${c.kind}]` : ''}${c.source ? ` ${c.source}` : ''}${c.page != null ? ` p.${c.page}` : ''}`).join(', ')}) → notes`

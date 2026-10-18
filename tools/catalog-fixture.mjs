// Makes test/fixtures/catalog-effects.json: every catalog entry that carries an effect, from a Nova Prime Chummer books
// export, with the book's words taken out. Names become "Entry N", ids <source>.eN, conditions "condition N" (a fire mode list
// and "flying", which the module reads, stay); printed text, parts, descriptions and prices are dropped; the numbers, targets,
// operations, values, switches, links and the few attrs the module reads stay. Hosts of accessories and linked entries come
// along, so a mod finds its weapon's bands and a link its effects. Re-runnable: it only reads its argument.
//   node tools/catalog-fixture.mjs <books-export.json> [more.json ...]   (a file { books: [...] } or an array of books)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const books = process.argv.slice(2).flatMap(f => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j) ? j : j.books })
if (!books.length) throw new Error('usage: node tools/catalog-fixture.mjs <books-export.json> ...')

// the same entry in several city editions of a book: the first
const seen = new Set(), all = []
for (const b of books) for (const e of b.entries) {
  const k = `${b.source.id}:${e.kind}:${e.id}`
  if (!seen.has(k)) { seen.add(k); all.push({ ...e, source: b.source.id }) }
}
const byId = new Map(all.map(e => [e.id, e])), byName = new Map(all.map(e => [`${e.kind}|${String(e.name).toLowerCase()}`, e]))
const linkTarget = (e, l) => (l.id && byId.get(l.id)) || byName.get(`${l.kind}|${String(l.name).toLowerCase()}`)

// kept: what carries an effect, its accessory hosts and its link targets (two levels, as the module reads them)
const keep = new Set(all.filter(e => e.effects?.length))
const grow = () => {
  let n = keep.size
  for (const e of [...keep]) {
    for (const id of String(e.attrs?.accessoryOf ?? '').split(/[\s,]+/)) if (byId.has(id)) keep.add(byId.get(id))
    for (const l of e.links ?? []) { const t = linkTarget(e, l); if (t) keep.add(t) }
  }
  return keep.size !== n
}
while (grow());

const ids = new Map()
let n = 0
for (const e of all) if (keep.has(e)) ids.set(e.id, `${e.source.toLowerCase()}.e${++n}`)
const idOf = raw => ids.get(raw) ?? null
const names = new Map([...keep].map(e => [e, `Entry ${ids.get(e.id).split('.e')[1]}`]))

const ATTRS = ['category', 'type', 'ware', 'array', 'programs', 'skill', 'dv', 'ar', 'modes', 'ammo', 'duration', 'range', 'damage', 'tags', 'opposed', 'essence',
  'keywords', 'user', 'perLevel', 'weakness', 'action', 'slots', 'kind', 'group', 'ratingRange']
const conditions = new Map()
const FIRE = { 'semi-auto': 'semi-auto', 'semi auto': 'semi-auto', semiautomatic: 'semi-auto', 'semi-automatic': 'semi-auto', 'burst fire': 'burst fire', 'full auto': 'full auto',
  'full-auto': 'full auto', 'full automatic': 'full auto', 'single shot': 'single shot', sa: 'semi-auto', bf: 'burst fire', fa: 'full auto', ss: 'single shot' }
function when(e, text) {
  if (!text) return undefined
  if (e.target === 'item:ar') { const modes = [...new Set([...text.toLowerCase().matchAll(/semi[- ]?auto(?:matic)?|burst fire|full[- ]auto(?:matic)?|single shot|\b(?:sa|bf|fa|ss)\b/g)].map(m => FIRE[m[0].replace(/\s+/, ' ')] ?? FIRE[m[0]]).filter(Boolean))]; if (modes.length) return modes.join(', ') }
  if (/\b(?:fly|flying|flight|flies)\b/i.test(text)) return 'while flying'
  if (!conditions.has(text)) conditions.set(text, `condition ${conditions.size + 1}`)
  return conditions.get(text)
}
const effect = x => Object.fromEntries(Object.entries({
  target: x.target, op: x.op, value: x.value, low: x.low, switch: x.switch, when: when(x, x.when), spec: x.spec, affects: x.affects,
  from: x.from ? idOf(x.from) ?? 'x:table' : undefined, gen: x.gen,
}).filter(([, v]) => v !== undefined))
const link = (e, l) => { const t = linkTarget(e, l); return { rel: l.rel, name: t ? names.get(t) : 'Entry', ...l.kind ? { kind: l.kind } : {}, ...t ? { id: idOf(t.id) } : {},
  ...l.level ? { level: l.level } : {}, ...l.when ? { when: when({}, l.when) } : {}, ...l.copied ? { copied: true } : {} } }
const entry = e => ({
  id: idOf(e.id), kind: e.kind, name: names.get(e), source: e.source, page: 1, canon: true,
  attrs: Object.fromEntries([...ATTRS.filter(k => e.attrs?.[k] != null).map(k => [k, e.attrs[k]]),
    ...String(e.attrs?.accessoryOf ?? '').split(/[\s,]+/).filter(i => idOf(i)).length ? [['accessoryOf', String(e.attrs.accessoryOf).split(/[\s,]+/).filter(i => idOf(i)).map(idOf).join(' ')]] : []]),
  parts: [], values: e.values ?? {},
  ...e.effects?.length ? { effects: e.effects.map(effect) } : {},
  ...e.links?.length ? { links: e.links.map(l => link(e, l)) } : {},
})
const bySource = new Map()
for (const e of all) if (keep.has(e)) bySource.set(e.source, [...bySource.get(e.source) ?? [], entry(e)])
const out = { note: 'Entries of a Nova Prime Chummer books export that carry effects, anonymized by tools/catalog-fixture.mjs. Invented names; the numbers, targets and operations are the catalog\'s.',
  books: [...bySource].map(([id, entries]) => ({ source: { id, name: id, publisher: 'x', canon: true }, entries })) }
fs.writeFileSync(path.join(root, 'test/fixtures/catalog-effects.json'), JSON.stringify(out))
console.log(`${keep.size} entries, ${[...keep].reduce((t, e) => t + (e.effects?.length ?? 0), 0)} effects, ${out.books.length} books`)

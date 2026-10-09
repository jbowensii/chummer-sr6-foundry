// Write translated books (lib/books.js translateBook) into world compendiums, one per TYPE with every book merged into
// it (lib/books.js planTypePacks), each entry in its category's folder inside the pack. Foundry globals only inside
// functions (node --check clean). Never throws: a failing pack is reported in `failed` and the other packs carry on.
// Only this module's type packs (world.<prefix>chummer-sr6-…) are read or written; 0.3's per-book packs
// (world.sr6-<book>-<topic>) are never touched.
import { MODULE_ID } from '../lib/constants.js'
import { bookCounts, chunks, keepStyleIds, planTypePacks, relinkUpdates, typeOfPack } from '../lib/books.js'
import { INDEX_FIELDS, keysOf, mergeByKey, planUpsert } from '../lib/chummer-id.js'
import { keepArt, keepUserEffects, mergeActorItems } from '../lib/plan.js'
import { replaceable } from '../lib/icons.js'
import { COMPENDIUM_FOLDER, dedupeUnarmed, ensureFolder, FOLDER, itemData, uploadPortrait } from './apply.js'

const CHUNK = 100
// let the window repaint between chunks
const breathe = () => new Promise(r => setTimeout(r, 0))

// The world pack `name`, created in `folder` when missing (the server fills path, system and package: 'world').
// { pack, made }: made when this call created it.
async function getPack(name, label, type, folder) {
  const found = game.packs.get(`world.${name}`)
  if (found?.documentName === type) return { pack: found, made: false }
  if (found) {
    const kind = game.i18n.localize(CONFIG[found.documentName]?.documentClass?.metadata?.labelPlural ?? found.documentName)
    throw new Error(game.i18n.format('SR6I.PackTypeClash', { id: found.collection, type: kind }))
  }
  const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({ name, label, type })
  if (!pack?.collection) throw new Error(`Could not create the compendium ${label}`)
  try { await pack.setFolder(folder) } catch (e) { await dropPack(pack); throw e }
  return { pack, made: true }
}
const dropPack = async pack => { try { await pack.deleteCompendium() } catch (e) { console.error(`${MODULE_ID} | ${pack.title}: deleting the empty compendium failed`, e) } }

// A Compendium sidebar folder made only when needed (ensureFolder), remembering whether this run made it so an unused
// one can go again.
const lazyFolder = (name, parent, made) => {
  let f
  return async () => {
    if (f) return f
    const p = parent && await parent()
    const had = game.folders.find(x => x.type === 'Compendium' && x.name === name && (x.folder?.id ?? null) === (p?.id ?? null))
    f = had ?? await ensureFolder(name, p, 'Compendium')
    if (!had) made.push(f)
    return f
  }
}
// Folders this run made that hold nothing (no pack was written into them) are deleted, innermost first.
async function dropEmptyFolders(made) {
  for (const f of made.reverse()) {
    try { if (!f.getSubfolders().length && !game.packs.some(p => p.folder?.id === f.id)) await f.delete() } catch {}
  }
}

// A compendium's NPC portraits (img) and tokens (token image; without one the token shows the portrait), uploaded only
// once their pack is written: Foundry has no call to delete an uploaded file, so a failed write must never have uploaded
// one. A failed upload keeps the default artwork. The file name is fixed per NPC and export, so a re-import overwrites
// it. An image or token image the user chose (kept by writePack) is never replaced.
export const portraitsAfter = (portraits = {}, tokens = {}, say) => async (docs, op) => {
  for (const d of docs) {
    const key = keysOf(d).chummerID, url = portraits[key], tok = tokens[key], f = d.flags[MODULE_ID]
    if (!url && !tok) continue
    try {
      const up = { _id: d._id }, id = `${f.source}-${f.id}`
      if (url && replaceable(d.img)) up.img = await uploadPortrait(url, id, f.exportedAt)
      if (replaceable(d.prototypeToken?.texture?.src)) {
        const src = tok ? await uploadPortrait(tok, id, f.exportedAt, 'tokens') : up.img
        if (src) up['prototypeToken.texture.src'] = src
      }
      if (Object.keys(up).length > 1) await Actor.updateDocuments([up], op)
    } catch (e) {
      console.error(`${MODULE_ID} | ${d.name}: portrait`, e)
      say(`${d.name}: portrait or token not uploaded (${e?.message ?? e}) → default artwork`)
    }
  }
}

// The pack's category folders (top level, by name, any case) for the documents about to be created: the missing ones
// made in one call per chunk, alphabetical. Returns { id(name), made: [Folder] }.
async function categoryFolders(pack, docs) {
  const have = new Map(), lc = s => String(s ?? '').toLowerCase()
  for (const f of pack.folders ?? []) if (!f.folder) have.set(lc(f.name), f.id)
  const missing = [...new Set(docs.map(d => d.flags?.[MODULE_ID]?.category).filter(c => c && !have.has(lc(c))))]
    .filter((c, i, all) => all.findIndex(x => lc(x) === lc(c)) === i)
  const made = []
  for (const c of chunks(missing, CHUNK))
    made.push(...await Folder.createDocuments(c.map(name => ({ name, type: pack.documentName, folder: null, sorting: 'a' })), { pack: pack.collection }))
  for (const f of made) have.set(lc(f.name), f.id)
  return { id: name => have.get(lc(name)) ?? null, made }
}

// A re-import updates in place (lib/chummer-id.js planUpsert, run by importBooks over every one of our packs): the entry
// keeps its _id, sort and ownership, other modules' flags, the image the user chose (lib/plan.js keepArt), a journal's
// pages by chummerID (and the GM's own) and an actor's GM items; it gets our chummerID flag and goes to its category's
// folder (always: a re-filed entry moves, even out of a folder the GM put it in). Every other entry is created, in its
// category's folder, and Foundry picks its id. Entries not in the file are never touched.
const OURS = ['name', 'type', 'img', 'system', 'effects', 'prototypeToken', 'items', 'pages', 'text', 'title']
function updateData(old, doc) {
  const k = keepArt(old, doc), u = { _id: old._id, flags: { ...old.flags, [MODULE_ID]: doc.flags?.[MODULE_ID] } }
  for (const f of OURS) if (f in k) u[f] = k[f]
  if (Array.isArray(doc.pages)) u.pages = mergeByKey(old.pages, k.pages)
  if (Array.isArray(doc.items)) u.items = mergeActorItems(old.items, k.items)
  // our effects are swapped, a user's kept (lib/plan.js keepUserEffects)
  u.effects = keepUserEffects(old.effects, k.effects ?? [])
  return u
}
// Updates first, then creates, CHUNK documents per Foundry call, the window told after each (progress(done, of)). If a
// create fails, what this call created (entries, and category folders no updated entry went into) is deleted again (the
// updated entries keep their new data), so a failure never leaves half a write behind. after(docs, op): run once everything is written, while the
// pack is still unlocked, with the written documents' data ({ _id, flags, img, prototypeToken }); then an actor pack's
// new actors lose Eden's duplicate Unarmed items (apply.js dedupeUnarmed).
async function writePack(pack, updates, creates, { after, progress } = {}) {
  const Doc = pack.documentClass, op = { pack: pack.collection }, of = updates.length + creates.length
  let done = 0
  const step = async n => { progress?.(done += n, of); await breathe() }
  // V14 refuses writes to a locked pack, even a world pack the GM locked: unlock for this write and lock it again after.
  const locked = pack.locked
  if (locked) await pack.configure({ locked: false })
  try {
    const old = []
    for (const c of chunks(updates, CHUNK)) old.push(...(await pack.getDocuments({ _id__in: c.map(u => u._id) })).map(d => d.toObject()))
    const was = new Map(old.map(d => [d._id, d])), cat = d => d.flags?.[MODULE_ID]?.category
    const folders = await categoryFolders(pack, [...creates, ...updates.map(u => u.doc)])
    const ups = updates.filter(u => was.has(u._id)).map(u => {
      const f = folders.id(cat(u.doc))
      return { ...updateData(was.get(u._id), u.doc), ...f ? { folder: f } : {} }
    })
    for (const c of chunks(ups, CHUNK)) { await Doc.updateDocuments(c, { ...op, recursive: false, diff: false }); await step(c.length) }
    const made = []
    try {
      for (const c of chunks(creates, CHUNK)) {
        made.push(...await Doc.createDocuments(c.map(d => ({ ...d, folder: folders.id(cat(d)) })), op))
        await step(c.length)
      }
    } catch (e) {
      try { if (made.length) await Doc.deleteDocuments(made.map(d => d.id), op) } catch {}
      const empty = folders.made.filter(f => !ups.some(u => u.folder === f.id)).map(f => f.id)
      try { if (empty.length) await Folder.deleteDocuments(empty, op) } catch {}
      throw e
    }
    const written = [...ups.map(u => ({ ...u, img: u.img ?? was.get(u._id)?.img, prototypeToken: u.prototypeToken ?? was.get(u._id)?.prototypeToken })),
      ...made.map((d, i) => ({ ...creates[i], _id: d.id }))]
    await after?.(written, op)
    if (pack.documentName === 'Actor') for (const d of made) await dedupeUnarmed(d)  // Eden's Unarmed, once per actor
    return { replaced: ups.length, migrated: updates.filter(u => u.how === 'legacy').length, ids: made.map(d => d.id) }
  } finally {
    if (locked) await pack.configure({ locked: true })
  }
}

// effects in Foundry's shape: a pack item's own (the catalog's effects, lib/translate.js catalogEffects) and a pack actor's items'
const withItemData = d => (d.items ? { ...d, items: d.items.map(itemData) } : itemData(d))
const fail = (pack, name, error) => { console.error(`${MODULE_ID} | ${name}`, error); return { pack, name, error } }

// An entry moving to another type pack: its new data on the old document's (as updateData), ownership kept, no _id.
const moveData = (old, doc) => { const { _id, ...d } = updateData(old, doc); return { ...d, ownership: old.ownership } }

// Every link in the world to a moved entry (an actor's _stats.compendiumSource, its items', a world item's) re-pointed at
// its new UUID. moved: old UUID -> new UUID. Returns Map(old UUID -> links re-pointed); a failure is a note.
async function relinkWorld(moved, say) {
  const n = new Map(), tally = list => { for (const r of list) n.set(r.from, (n.get(r.from) ?? 0) + 1) }
  const run = async (list, write, what) => {
    if (!list.length) return
    try { await write(list.map(r => r.update)); tally(list) } catch (e) {
      console.error(`${MODULE_ID} | ${what}: re-pointing compendium links`, e)
      say(`${what}: compendium links not re-pointed (${e?.message ?? e})`)
    }
  }
  for (const a of game.actors ?? []) {
    await run(relinkUpdates(a.items, moved), u => a.updateEmbeddedDocuments('Item', u), a.name)
    await run(relinkUpdates([a], moved), ([u]) => a.update(u), a.name)
  }
  await run(relinkUpdates(game.items, moved), u => Item.updateDocuments(u), 'World items')
  return n
}
const groupBy = (list, key) => list.reduce((m, x) => m.set(key(x), [...m.get(key(x)) ?? [], x]), new Map())

/**
 * ts: translateBook outputs (the books ticked in the window). Each type pack (lib/books.js planTypePacks) goes in the
 * Compendium folder topFolder ("Chummer SR6"); a GM compendium's in "<name> (<id>)" inside compendiumFolder
 * ("Chummer SR6 compendiums"). Pack names get `prefix` (Quench). One upsert over every one of our packs of a document
 * type (by chummerID, then alias), so a book not in the file leaves its entries alone. An entry found in another type
 * pack than its own now (its type changed) MOVES: created in its type pack from the old one's data (user art, effects,
 * pages, GM items, ownership kept), every link in the world to the old one re-pointed at it, and the old copy deleted
 * only when it is ours (it has our chummerID flag). Actor packs upload the compendium NPCs' portraits and tokens after
 * their write. onProgress({ label, n, total, done, of }): before each pack and after each chunk.
 * Returns { counts: { [pack collection]: { label, created, replaced, moved, migrated, books: { [source]: { created,
 * replaced, moved } }, moves: [{ name, from, links, deleted }], duplicates: [entry name] } }, failed: [{ pack, name,
 * error }], notes: [portrait and move lines] }.
 */
export async function importBooks(ts, { onProgress, prefix = '', topFolder = FOLDER, compendiumFolder = COMPENDIUM_FOLDER } = {}) {
  const counts = {}, failed = [], made = [], notes = []
  const plans = planTypePacks(ts, prefix).map(p => ({ ...p, docs: p.docs.map(withItemData) }))
  if (!plans.length) return { counts, failed, notes }
  const portraits = Object.assign({}, ...ts.map(t => t.portraits)), tokens = Object.assign({}, ...ts.map(t => t.tokens))

  // every one of our packs' index (one read per pack), with the fields the planner and a style's genesisID need
  const existing = []
  for (const pack of game.packs.filter(p => typeOfPack(p.collection, prefix))) {
    try {
      const index = await pack.getIndex({ fields: [...INDEX_FIELDS, 'system.genesisID'] })
      for (const i of index.values()) existing.push({ ...i, pack: pack.collection, documentName: pack.documentName })
    } catch (error) { failed.push(fail(pack.collection, pack.title, error)) }
  }

  // one write per type pack: the entries already in it updated, the new ones created, the ones found elsewhere moved in
  const jobs = new Map(plans.map(p => [`world.${p.name}`, { plan: p, updates: [], creates: [], moves: [], duplicates: [] }]))
  const planOf = new Map(plans.flatMap(p => p.docs.map(d => [d, p]))), jobOf = d => jobs.get(`world.${planOf.get(d).name}`)
  for (const type of ['Item', 'Actor', 'JournalEntry']) {
    const incoming = plans.filter(p => p.type === type).flatMap(p => p.docs)
    if (!incoming.length) continue
    const { updates, creates, duplicates } = planUpsert(existing.filter(e => e.documentName === type), incoming)
    keepStyleIds(updates, incoming)
    for (const u of updates) { const j = jobOf(u.doc); (u.hit.pack === `world.${j.plan.name}` ? j.updates : j.moves).push(u) }
    for (const d of creates) jobOf(d).creates.push(d)
    for (const d of duplicates) jobOf(d).duplicates.push(d.name ?? keysOf(d).chummerID)
  }

  const top = lazyFolder(topFolder, null, made), compTop = lazyFolder(compendiumFolder, null, made), compFolders = new Map()
  const folderOf = c => {
    if (!c) return top()
    if (!compFolders.has(c.id)) compFolders.set(c.id, lazyFolder(`${c.name} (${c.id})`, compTop, made))
    return compFolders.get(c.id)()
  }
  const moved = new Map(), movedIn = []  // old UUID -> new UUID; [{ m: the move, old: its old UUID, id: the pack it went to }]
  const oldKey = h => `${h.pack}.${h._id}`
  const todo = [...jobs.entries()].filter(([, j]) => j.updates.length || j.creates.length || j.moves.length)
  for (const [i, [id, j]] of todo.entries()) {
    const label = j.plan.label, progress = (done, of) => onProgress?.({ label, n: i + 1, total: todo.length, done, of })
    progress(0, j.updates.length + j.creates.length + j.moves.length)
    let created = false, pack = game.packs.get(id)
    try {
      // the moved entries' old documents (one that vanished since the index was read is simply created)
      const olds = new Map()
      for (const [from, ms] of groupBy(j.moves, m => m.hit.pack)) for (const c of chunks(ms, CHUNK))
        for (const d of await game.packs.get(from).getDocuments({ _id__in: c.map(m => m.hit._id) })) olds.set(`${from}.${d.id ?? d._id}`, d.toObject())
      const moves = j.moves.filter(m => olds.has(oldKey(m.hit)))
      const creates = [...j.creates, ...j.moves.filter(m => !olds.has(oldKey(m.hit))).map(m => m.doc)]
      const moving = moves.map(m => moveData(olds.get(oldKey(m.hit)), m.doc))
      // a pack of ours by that name holding another document type: getPack refuses it (PackTypeClash)
      if (!pack || pack.documentName !== j.plan.type) ({ pack, made: created } = await getPack(j.plan.name, j.plan.label, j.plan.type, await folderOf(j.plan.compendium)))
      const after = pack.documentName === 'Actor' ? portraitsAfter(portraits, tokens, l => notes.push(l)) : undefined
      const r = await writePack(pack, j.updates, [...creates, ...moving], { after, progress })
      moves.forEach((m, k) => {
        const old = m.hit.uuid ?? game.packs.get(m.hit.pack).getUuid(m.hit._id)
        moved.set(old, pack.getUuid(r.ids[creates.length + k]))
        movedIn.push({ m, old, id })
      })
      counts[id] = { label: pack.title, created: creates.length, replaced: r.replaced, moved: moves.length, migrated: r.migrated,
        books: bookCounts(j.updates, creates, moves), moves: [], duplicates: j.duplicates }
    } catch (error) {
      if (created) await dropPack(pack)
      failed.push(fail(id, label, error))
    }
  }

  // the moved entries: every link re-pointed, then the old copies that are ours deleted (a locked pack locked again)
  if (moved.size) {
    const links = await relinkWorld(moved, l => notes.push(l)), gone = new Set()
    for (const [from, xs] of groupBy(movedIn.filter(x => keysOf(x.m.hit).chummerID), x => x.m.hit.pack)) {
      const pack = game.packs.get(from), locked = pack.locked
      try {
        if (locked) await pack.configure({ locked: false })
        for (const c of chunks(xs, CHUNK)) { await pack.documentClass.deleteDocuments(c.map(x => x.m.hit._id), { pack: from }); c.forEach(x => gone.add(x)) }
      } catch (e) {
        console.error(`${MODULE_ID} | ${pack.title}: deleting moved entries`, e)
        notes.push(`${pack.title}: moved entries not deleted there (${e?.message ?? e})`)
      } finally { if (locked) await pack.configure({ locked: true }) }
    }
    for (const x of movedIn) counts[x.id].moves.push({ name: x.m.doc.name, from: game.packs.get(x.m.hit.pack)?.title ?? x.m.hit.pack,
      links: links.get(x.old) ?? 0, deleted: gone.has(x) })
  }
  await dropEmptyFolders(made)
  return { counts, failed, notes }
}

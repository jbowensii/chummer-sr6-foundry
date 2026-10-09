// Write a translated book (lib/books.js translateBook) into world compendiums. Foundry globals only inside functions
// (node --check clean). Never throws: a failing pack is reported in `failed` and the other packs carry on.
import { MODULE_ID } from '../lib/constants.js'
import { planBookPacks } from '../lib/books.js'
import { INDEX_FIELDS, keysOf, mergeByKey, planUpsert } from '../lib/chummer-id.js'
import { keepArt, keepUserEffects, mergeActorItems } from '../lib/plan.js'
import { replaceable } from '../lib/icons.js'
import { COMPENDIUM_FOLDER, dedupeUnarmed, ensureFolder, FOLDER, itemData, uploadPortrait } from './apply.js'

const CHUNK = 100

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

// Write docs into the pack, creating it only now that there is something to write. A pack this call created is
// deleted again when the write fails, so a failure never leaves an empty compendium behind.
async function writeNew(name, label, type, folder, docs, after) {
  const { pack, made } = await getPack(name, label, type, folder)
  try { return await writePack(pack, docs, after) } catch (e) {
    if (made) await dropPack(pack)
    throw e
  }
}

// A folder made only when needed (ensureFolder), remembering whether this run made it so an unused one can go again.
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

// A re-import updates in place, never deletes (lib/chummer-id.js planUpsert): an incoming entry found in the pack by its
// chummerID, an alias, or (migration from 0.2.x) the id 0.2.x computed for it, is updated in place, keeping its _id, its
// folder, sort and ownership, other modules' flags, the image the user chose (lib/plan.js keepArt), a journal's pages
// by chummerID (and the GM's own) and an actor's GM items; it gets our chummerID flag. Every other entry is created and
// Foundry picks its id. Entries not in the file are never touched.
// Updates go first, then creates in chunks; if a create fails, what this run created is deleted again (the updated
// entries keep their new data), so a failure never leaves half a chunk behind.
// after(docs, op): run once everything is written, while the pack is still unlocked, with the written documents' data
// ({ _id, flags, img, prototypeToken }); then an actor pack's duplicate Unarmed items go (apply.js dedupeUnarmed).
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
async function writePack(pack, incoming, after) {
  const Doc = pack.documentClass, op = { pack: pack.collection }
  const index = await pack.getIndex({ fields: INDEX_FIELDS })
  const { updates, creates, duplicates } = planUpsert([...index.values()], incoming)
  // V14 refuses writes to a locked pack, even a world pack the GM locked: unlock for this write and lock it again after.
  const locked = pack.locked
  if (locked) await pack.configure({ locked: false })
  try {
    const old = updates.length ? (await pack.getDocuments({ _id__in: updates.map(u => u._id) })).map(d => d.toObject()) : []
    const was = new Map(old.map(d => [d._id, d]))
    const ups = updates.map(u => updateData(was.get(u._id), u.doc))
    for (let i = 0; i < ups.length; i += CHUNK) await Doc.updateDocuments(ups.slice(i, i + CHUNK), { ...op, recursive: false, diff: false })
    const made = []
    try {
      for (let i = 0; i < creates.length; i += CHUNK) made.push(...await Doc.createDocuments(creates.slice(i, i + CHUNK), op))
    } catch (e) {
      try { if (made.length) await Doc.deleteDocuments(made.map(d => d.id), op) } catch {}
      throw e
    }
    const written = [...ups.map(u => ({ ...u, img: u.img ?? was.get(u._id)?.img, prototypeToken: u.prototypeToken ?? was.get(u._id)?.prototypeToken })),
      ...made.map((d, i) => ({ ...creates[i], _id: d.id }))]
    await after?.(written, op)
    if (pack.documentName === 'Actor') for (const d of made) await dedupeUnarmed(d)  // Eden's Unarmed, once per actor
    return { label: pack.title, created: creates.length, replaced: updates.length,
      migrated: updates.filter(u => u.how === 'legacy').length, duplicates: duplicates.map(d => d.name ?? keysOf(d).chummerID) }
  } finally {
    if (locked) await pack.configure({ locked: true })
  }
}

/**
 * A book's martial art styles keep the genesisID they already have in the world's pack (Eden ties a runner's techniques
 * to it), and the book's techniques follow: new styles keep the random one translate.js gave them. Changes t in place.
 */
async function keepStyleIds(t, name) {
  const styles = t.packs.martialarts ?? [], pack = game.packs.get(`world.${name}`)
  if (!styles.length || !pack) return
  const index = await pack.getIndex({ fields: [...INDEX_FIELDS, 'system.genesisID'] })
  const remap = new Map()
  for (const u of planUpsert([...index.values()], styles).updates) {
    const old = index.get(u._id)?.system?.genesisID
    if (old && old !== u.doc.system.genesisID) { remap.set(u.doc.system.genesisID, old); u.doc.system.genesisID = old }
  }
  for (const tech of t.packs.martialtechniques ?? []) if (remap.has(tech.system.style)) tech.system.style = remap.get(tech.system.style)
}

// effects in Foundry's shape: a pack item's own (the catalog's effects, lib/translate.js catalogEffects) and a pack actor's items'
const withItemData = d => (d.items ? { ...d, items: d.items.map(itemData) } : itemData(d))
const fail = (pack, name, error) => { console.error(`${MODULE_ID} | ${name}`, error); return { pack, name, error } }

/**
 * t: translateBook output. onProgress({ key, n, total }), key = the pack key before each pack is written. Packs go in
 * `<book name> (<source id>)` inside topFolder (by default FOLDER, COMPENDIUM_FOLDER for a GM's compendium); pack names
 * get `prefix` (Quench). Actor packs upload the compendium NPCs' portraits and tokens after their write.
 * Returns { source, counts: { [pack name]: { label, created, replaced, duplicates: [entry name] } }, failed: [{ pack, name, error }], notes: [portrait lines] }.
 */
export async function importBook(t, { onProgress, prefix = '', topFolder = t.source.compendium ? COMPENDIUM_FOLDER : FOLDER } = {}) {
  const src = t.source, counts = {}, failed = [], made = [], notes = []
  // nothing to write: no pack and no folder
  const packs = planBookPacks(t, prefix)
  const styles = packs.find(p => p.key === 'martialarts')
  if (styles) { try { await keepStyleIds(t, styles.name) } catch (e) { console.error(`${MODULE_ID} | martial art styles`, e) } }
  const folder = lazyFolder(`${src.name} (${src.id})`, lazyFolder(topFolder, null, made), made)
  for (const [i, p] of packs.entries()) {
    onProgress?.({ key: p.key, n: i + 1, total: packs.length })
    try {
      const after = p.type === 'Actor' ? portraitsAfter(t.portraits, t.tokens, l => notes.push(l)) : undefined
      counts[p.name] = await writeNew(p.name, p.label, p.type, await folder(), p.docs.map(withItemData), after)
    } catch (error) { failed.push(fail(p.name, p.label, error)) }
  }
  await dropEmptyFolders(made)
  return { source: src, counts, failed, notes }
}

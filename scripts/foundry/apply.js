// Apply one translated runner or NPC to the world. Foundry globals are only touched inside functions (node --check clean).
import { MODULE_ID } from '../lib/constants.js'
import { missingTargets, normKey } from '../lib/eden.js'
import { INDEX_FIELDS, resolveEntry, tieLine } from '../lib/chummer-id.js'
import { fitUpdates, isOurEffect, keepItemArt, newVersionName, planItems, replaceUpdate, tokenUpdate } from '../lib/plan.js'

export const FOLDER = 'Chummer SR6'
export const NPC_FOLDER = 'Chummer SR6 NPCs'  // NPCs from a runners file (flags npc)
export const COMPENDIUM_FOLDER = 'Chummer SR6 compendiums'  // Compendium folder for GMs' compendiums (source.compendium)
const flagOf = d => d?.flags?.[MODULE_ID]
const time = f => Date.parse(f?.exportedAt ?? '') || 0
const newest = docs => docs.sort((a, b) => time(flagOf(b)) - time(flagOf(a)))[0] ?? null

// The world copy of a runner or NPC: flagged with its id; newest export wins. Book copies (dragged out of a compendium)
// carry `source` and are never a runner's world copy.
export const findExisting = runnerId => newest(game.actors.filter(a => flagOf(a)?.id === runnerId && !flagOf(a).source))

export async function ensureFolder(name, parent = null, type = 'Actor') {
  const found = game.folders.find(f => f.type === type && f.name === name && (f.folder?.id ?? null) === (parent?.id ?? null))
  return found ?? Folder.create({ name, type, folder: parent?.id ?? null })
}

// data URL -> world file in worlds/<world>/chummer/<sub> (portraits or tokens: lib/icons.js replaceable); returns its path.
// Browse, and on failure create each level, swallowing "already exists"; a real problem surfaces as the upload failing.
export async function uploadPortrait(dataUrl, runnerId, exportedAt, sub = 'portraits') {
  const FP = foundry.applications.apps.FilePicker.implementation
  const base = `worlds/${game.world.id}/chummer`, dir = `${base}/${sub}`
  try { await FP.browse('data', dir) } catch {
    for (const d of [base, dir]) { try { await FP.createDirectory('data', d, {}) } catch { /* may already exist */ } }
  }
  const blob = await (await fetch(dataUrl)).blob()
  const ext = /jpe?g/i.test(blob.type) ? 'jpg' : 'png'
  const file = new File([blob], `${String(runnerId).replace(/[^\w-]/g, '-')}-${String(exportedAt).replace(/\D/g, '')}.${ext}`, { type: blob.type })
  const res = await FP.upload('data', dir, file, {}, { notify: false })
  if (!res?.path) throw new Error(`${sub === 'tokens' ? 'Token' : 'Portrait'} upload failed for ${runnerId}`)
  return res.path
}

/**
 * One effect from translate.js ({ name, transfer, disabled, changes: [{ key, value, mode }] }) -> ActiveEffect data.
 * Foundry 13: changes at the top level with a numeric mode. Foundry 14: system.changes with a change type (Eden's
 * changes-v14.hbs: key, type, value, phase, priority). ponytail: the 14 shape is pinned by the Quench "effects" batch.
 */
export function effectData(e) {
  const { changes = [], ...rest } = e
  if ((game.release?.generation ?? 13) >= 14)
    return { ...rest, system: { changes: changes.map(c => ({ key: c.key, type: 'add', value: c.value })) } }
  return { ...rest, changes: changes.map(c => ({ key: c.key, value: c.value, mode: CONST.ACTIVE_EFFECT_MODES.ADD })) }
}
// an item from translate.js with its effects as ActiveEffect data (world actors and pack actors alike)
export const itemData = i => (i.effects ? { ...i, effects: i.effects.map(effectData) } : i)

// Eden's own Unarmed weapon (genesisID 'unarmed', never flagged by this module). Eden's Actor _onCreate adds one to every
// new Player/NPC on every connected client, check-then-create without waiting, so two can land. Keep the oldest, delete
// the rest. Idempotent, touches nothing else, never throws (a failure is logged). Returns how many it deleted.
// ponytail: runs once after our writes; an Unarmed from another client landing later stays until the next import.
export const isEdenUnarmed = i => !flagOf(i) && i.system?.genesisID === 'unarmed'
export async function dedupeUnarmed(actor) {
  const age = i => i._stats?.createdTime ?? 0
  const extra = (actor.items?.filter(isEdenUnarmed) ?? []).sort((a, b) => age(a) - age(b)).slice(1).map(i => i.id)
  if (!extra.length) return 0
  try { await actor.deleteEmbeddedDocuments('Item', extra); return extra.length } catch (e) {
    console.error(`${MODULE_ID} | ${actor.name}: removing a duplicate Unarmed item failed`, e)
    return 0
  }
}

/** Eden's specialization labels as Foundry loaded them: { [skill]: { [specKey]: label } } (never shipped: Eden is GPL-3). */
export const edenSpecLabels = () => game.i18n.translations.shadowrun6?.special ?? game.i18n._fallback?.shadowrun6?.special ?? {}

/**
 * Eden's own complex form table (CONFIG.SR6.COMPLEX_FORMS.list: the test each form calls for), keyed by normKey of its key
 * and of its translated name, as lib/translate.js pickItem reads it. Read at import time, never shipped.
 */
export function edenComplexForms() {
  const out = {}
  for (const [key, cf] of Object.entries(CONFIG.SR6?.COMPLEX_FORMS?.list ?? {})) {
    const row = { skill: cf?.skill ?? '', oppAttr1: cf?.opposedAttr1 ?? '', oppAttr2: cf?.opposedAttr2 ?? '', threshold: cf?.threshold ?? 0 }
    if (!row.skill) continue
    out[normKey(key)] = row
    const label = game.i18n.localize(`shadowrun6.compendium.complexform.${key}`)
    if (label && !label.startsWith('shadowrun6.')) out[normKey(label)] = row
  }
  return out
}

/** Eden's effect editor lists the change keys it knows (CONFIG.SR6.ACTIVE_EFFECT_OPTIONS, rebuilt at its own ready); the
 *  ones this module writes that it lacks (the social Defense Rating, …) are added, labelled "Chummer: <path>". */
export function registerEffectTargets() {
  const options = CONFIG.SR6?.ACTIVE_EFFECT_OPTIONS
  if (!options) return
  for (const [key, path] of Object.entries(missingTargets(options))) options[key] = `Chummer: ${path}`
}

/** Our identity fields in every compendium's index (lib/chummer-id.js INDEX_FIELDS), so a pack finds an entry by
 *  chummerID without loading its documents. Called at init (main.js). */
export function addIndexFields() {
  for (const doc of ['Item', 'Actor', 'JournalEntry']) {
    const c = CONFIG[doc]
    if (!c) continue
    c.compendiumIndexFields = [...new Set([...c.compendiumIndexFields ?? [], ...INDEX_FIELDS])]
  }
}

// One book's world compendiums (lib/books.js: sr6-<source>-<key>, in any of its kinds' packs) as index entries for
// lib/chummer-id.js resolveEntry, loaded once per import.
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9_-]/g, '-')
async function bookEntries(source, prefix) {
  const start = `world.${slug(`${prefix}sr6-${source}`)}-`, out = []
  for (const pack of game.packs.filter(p => p.documentName === 'Item' && p.collection.startsWith(start))) {
    const index = await pack.getIndex({ fields: INDEX_FIELDS })
    for (const i of index.values()) {
      const f = i.flags?.[MODULE_ID] ?? {}
      out.push({ uuid: i.uuid ?? pack.getUuid(i._id), type: i.type, name: i.name, chummerID: f.chummerID ?? null,
        aliases: f.chummerAliases ?? [], kind: f.kind ?? null, page: f.page ?? null })
    }
  }
  return out
}

/**
 * _stats.compendiumSource for a runner's items: the real UUID of the entry each came from in that world's compendiums
 * for its book, found by chummerID, then its aliases, then type and name inside that one book's compendiums (ties: the
 * same kind, then the same page). Still tied: no link, and a report line lists the candidates. Never a search by name
 * across every compendium; a custom item (no book) is never linked. Returns { items, notes }.
 */
export async function linkCompendium(items, prefix = '') {
  const books = new Map(), notes = []
  const out = []
  for (const i of items) {
    const source = flagOf(i)?.source
    if (!source || !flagOf(i)?.catalogId) { out.push(i); continue }
    if (!books.has(source)) books.set(source, await bookEntries(source, prefix))
    const r = resolveEntry(i, books.get(source))
    if (r?.uuid) out.push({ ...i, _stats: { ...i._stats, compendiumSource: r.uuid } })
    else { if (r?.candidates) notes.push(tieLine(i, r.candidates)); out.push(i) }
  }
  return { items: out, notes }
}

// Create an actor's items (Foundry picks their ids), then fit the mods and software to their hosts by the ids they got
// (lib/plan.js fitUpdates). Returns the created items.
async function createItems(doc, items) {
  if (!items.length) return []
  const made = await doc.createEmbeddedDocuments('Item', items)
  const fits = fitUpdates(made, doc.id)
  if (fits.length) await doc.updateEmbeddedDocuments('Item', fits)
  return made
}

// Replace in place (lib/plan.js planItems): the actor's translated fields, then each of our items matched by its uid updated
// in place (same _id; Chummer's fields refreshed, play state the system keeps in other fields left alone, other
// modules' flags kept) with only its effects of ours swapped, so effects a user added stay; new items created; our
// items the file no longer has deleted; the user's own items never touched. Art the user chose stays (keepItemArt).
// Then every fitted mod and program is pointed at its host again. If deleting the dropped items fails, the items this
// call created are removed again. Throws on failure.
async function replaceDoc(doc, actor, items, token) {
  const fresh = keepItemArt(doc.items, items)
  const { update, create, remove } = planItems([...doc.items], fresh)
  await doc.update({ ...replaceUpdate(actor, doc.name, doc.img), ...tokenUpdate(doc, token ?? actor.img) })
  if (update.length) await doc.updateEmbeddedDocuments('Item', update.map(({ old, item }) => ({ _id: old.id, name: item.name,
    ...item.img ? { img: item.img } : {}, system: item.system, flags: { ...old.flags, [MODULE_ID]: item.flags[MODULE_ID] },
    ...item._stats?.compendiumSource ? { '_stats.compendiumSource': item._stats.compendiumSource } : {} })))
  for (const { old, item } of update) {
    const live = doc.items.get(old.id) ?? old
    const ourOld = [...live.effects ?? []].filter(isOurEffect).map(e => e.id ?? e._id)
    if (ourOld.length) await live.deleteEmbeddedDocuments('ActiveEffect', ourOld)
    if (item.effects?.length) await live.createEmbeddedDocuments('ActiveEffect', item.effects)
  }
  const made = create.length ? await doc.createEmbeddedDocuments('Item', create) : []
  try { if (remove.length) await doc.deleteEmbeddedDocuments('Item', remove) } catch (e) {
    try { if (made.length) await doc.deleteEmbeddedDocuments('Item', made.map(i => i.id)) } catch {}
    throw e
  }
  const fits = fitUpdates([...update.map(({ old, item }) => ({ id: old.id, flags: item.flags })), ...made], doc.id)
  if (fits.length) await doc.updateEmbeddedDocuments('Item', fits)
}

/**
 * choice: 'create' | 'new' | 'replace' | 'skip'. portrait / token: image data URLs (the actor's img, its prototype token's
 * image; without a token the token shows the img). folder: the root Actors folder, by name or a Folder (the Quench tests
 * pass their own); by default FOLDER for a runner, NPC_FOLDER for an NPC. Items go in after the actor (Eden's
 * preCreateItem runs per item), their effects inside each item's data. Never throws: a failure deletes the actor this
 * call created and returns { actor: null, action: 'failed', error } so the caller reports it and carries on. notes: the
 * compendium link lines for the report (linkCompendium).
 */
export async function applyRunner(t, choice, { portrait, token, exportedAt, folder = flagOf(t.actor)?.npc ? NPC_FOLDER : FOLDER } = {}) {
  const runnerId = flagOf(t.actor).id
  if (choice === 'skip') return { actor: findExisting(runnerId), action: 'skip' }
  let created = null
  try {
    const { items, notes } = await linkCompendium(t.items.map(itemData))
    const actor = structuredClone(t.actor)
    const at = exportedAt ?? flagOf(t.actor).exportedAt
    if (portrait) actor.img = await uploadPortrait(portrait, runnerId, at)
    const tokenImg = token ? await uploadPortrait(token, runnerId, at, 'tokens') : null

    if (choice === 'replace') {
      const doc = findExisting(runnerId)
      if (!doc) throw new Error(`${t.actor.name}: nothing to replace`)
      await replaceDoc(doc, actor, items, tokenImg)
      await dedupeUnarmed(doc)
      return { actor: doc, action: 'replace', notes }
    }

    const root = typeof folder === 'string' ? await ensureFolder(folder) : folder
    const name = choice === 'new' ? newVersionName(actor.name, flagOf(t.actor).exportedAt) : actor.name
    if (actor.system.edge?.max != null) actor.system.edge.value = actor.system.edge.max  // Edge starts full
    const src = tokenImg ?? actor.img
    created = await Actor.create({ ...actor, name, folder: root?.id ?? null,
      prototypeToken: { ...actor.prototypeToken, ...src ? { texture: { src } } : {} } })
    await createItems(created, items)
    await dedupeUnarmed(created)
    return { actor: created, action: choice === 'new' ? 'new' : 'create', notes }
  } catch (error) {
    // A replaced actor cleans up its own new items (replaceDoc); ponytail: its update already applied stays, and
    // re-running the import finishes the job.
    if (created) { try { await created.delete() } catch {} }
    console.error(`${MODULE_ID} | ${t.actor.name}`, error)
    return { actor: null, action: 'failed', error }
  }
}

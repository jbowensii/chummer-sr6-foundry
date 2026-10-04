// Apply one translated runner or NPC to the world. Foundry globals are only touched inside functions (node --check clean).
import { MODULE_ID } from '../lib/constants.js'
import { keepItemArt, newVersionName, replaceUpdate, tokenUpdate } from '../lib/plan.js'

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

// Replace in place: rebuild the translated fields and every flagged embedded item; unflagged items and play state stay,
// and so does art the user chose, on the actor and its rebuilt items (lib/plan.js replaceUpdate, keepItemArt).
// One actor update (translated fields and token together), then new items, old items deleted last: three writes. If deleting the old ones fails, the new items are removed again,
// so a failure never leaves the actor without its Chummer items or with them twice. Throws on failure.
async function replaceDoc(doc, actor, items, token) {
  const old = doc.items.filter(i => flagOf(i)).map(i => i.id)
  const fresh = keepItemArt(doc.items, items)
  await doc.update({ ...replaceUpdate(actor, doc.name, doc.img), ...tokenUpdate(doc, token ?? actor.img) })
  const made = fresh.length ? await doc.createEmbeddedDocuments('Item', fresh) : []
  try { if (old.length) await doc.deleteEmbeddedDocuments('Item', old) } catch (e) {
    try { await doc.deleteEmbeddedDocuments('Item', made.map(i => i.id)) } catch {}
    throw e
  }
}

/**
 * choice: 'create' | 'new' | 'replace' | 'skip'. portrait / token: image data URLs (the actor's img, its prototype token's
 * image; without a token the token shows the img). folder: the root Actors folder, by name or a Folder (the Quench tests
 * pass their own); by default FOLDER for a runner, NPC_FOLDER for an NPC. Items go in after the actor (Eden's
 * preCreateItem runs per item), their effects inside each item's data. Never throws: a failure deletes the actor this
 * call created and returns { actor: null, action: 'failed', error } so the caller reports it and carries on.
 */
export async function applyRunner(t, choice, { portrait, token, exportedAt, folder = flagOf(t.actor)?.npc ? NPC_FOLDER : FOLDER } = {}) {
  const runnerId = flagOf(t.actor).id
  if (choice === 'skip') return { actor: findExisting(runnerId), action: 'skip' }
  let created = null
  try {
    const actor = structuredClone(t.actor), items = t.items.map(itemData)
    const at = exportedAt ?? flagOf(t.actor).exportedAt
    if (portrait) actor.img = await uploadPortrait(portrait, runnerId, at)
    const tokenImg = token ? await uploadPortrait(token, runnerId, at, 'tokens') : null

    if (choice === 'replace') {
      const doc = findExisting(runnerId)
      if (!doc) throw new Error(`${t.actor.name}: nothing to replace`)
      await replaceDoc(doc, actor, items, tokenImg)
      await dedupeUnarmed(doc)
      return { actor: doc, action: 'replace' }
    }

    const root = typeof folder === 'string' ? await ensureFolder(folder) : folder
    const name = choice === 'new' ? newVersionName(actor.name, flagOf(t.actor).exportedAt) : actor.name
    if (actor.system.edge?.max != null) actor.system.edge.value = actor.system.edge.max  // Edge starts full
    const src = tokenImg ?? actor.img
    created = await Actor.create({ ...actor, name, folder: root?.id ?? null,
      prototypeToken: { ...actor.prototypeToken, ...src ? { texture: { src } } : {} } })
    if (items.length) await created.createEmbeddedDocuments('Item', items)
    await dedupeUnarmed(created)
    return { actor: created, action: choice === 'new' ? 'new' : 'create' }
  } catch (error) {
    // A replaced actor cleans up its own new items (replaceDoc); ponytail: its update already applied stays, and
    // re-running the import finishes the job.
    if (created) { try { await created.delete() } catch {} }
    console.error(`${MODULE_ID} | ${t.actor.name}`, error)
    return { actor: null, action: 'failed', error }
  }
}

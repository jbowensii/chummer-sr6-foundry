// "Apply to targets": a spell, complex form or critter power has effects meant for someone else, its target or the others it
// touches (translate.js: scope target, written disabled and not transferred, flagged forTargets). Eden would apply an item's
// own non-transferred effects to the item itself, so they sit disabled on the item; this copies them, enabled, to the actors of
// the user's targeted tokens, origin = the item, and takes them away again when the spell stops being sustained
// (system.isSustained false), the item or its actor is deleted, or (a GM's sweep at ready) the item no longer exists. A value
// only the table knows (net hits, Force: flags.prompt) is asked for once. A target the user doesn't own gets its effects from
// a GM's client over the module socket, and only if a GM is online. A spell that isn't sustained is refused: nothing would
// ever take its effects away.
// Foundry globals are only touched inside functions (node --check clean). Foundry's Collections (game.actors, game.scenes, a
// scene's tokens, an actor's effects) have find/filter/map/some but no flatMap/flat/slice: they are walked with Array.from.
import { MODULE_ID } from '../lib/constants.js'
import { effectData } from './apply.js'

export const SOCKET = `module.${MODULE_ID}`
const NUMBER_LIMIT = 30  // a net hits or Force beyond this is a typo (the socket's one input a player controls)
const flagOf = e => e?.flags?.[MODULE_ID]
const log = e => console.error(`${MODULE_ID} | apply to targets`, e)
const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key))

/** The item's effects for targets (ours, flagged forTargets). */
export const forTargets = item => Array.from(item?.effects ?? []).filter(e => flagOf(e)?.forTargets)
/** An effect's changes, whichever shape the Foundry version stores (13: changes with a mode; 14: system.changes with a type). */
export const changesOf = e => (e.system?.changes ?? e.changes ?? []).map(c => ({ key: c.key, value: c.value, mode: c.type === 'override' || c.mode === 5 ? 5 : 2 }))

/** The data of the effect on a target: the item's effect, enabled, from the item, its asked-for numbers put in (what: Force or hits). */
export function copyData(item, effect, numbers = {}) {
  const prompt = flagOf(effect).prompt ?? {}
  const changes = changesOf(effect).map(c => (prompt[c.key] ? { ...c, value: prompt[c.key].sign * numbers[prompt[c.key].what] } : c))
  return effectData({ name: effect.name, img: item.img, origin: item.uuid, disabled: false, transfer: false, changes,
    flags: { [MODULE_ID]: { appliedFrom: item.uuid } } })
}
/** The numbers an item's effects ask for: one per kind (Force, hits). */
export const promptsOf = item => [...new Set(forTargets(item).flatMap(e => Object.values(flagOf(e).prompt ?? {}).map(p => p.what)))]

async function askNumber(what, item) {
  const label = loc(what === 'Force' ? 'SR6I.Targets.Force' : 'SR6I.Targets.Hits')
  return foundry.applications.api.DialogV2.prompt({
    window: { title: loc('SR6I.Targets.Ask', { what: label, name: item.name }) },
    content: `<div class="form-group"><label>${foundry.utils.escapeHTML(label)}</label><input type="number" name="n" value="1" min="-${NUMBER_LIMIT}" max="${NUMBER_LIMIT}" autofocus></div>`,
    ok: { callback: (event, button) => Number(button.form.elements.n.value) }, rejectClose: false,
  })
}

// One job at a time per key: a double click, or two socket requests, must not both read "nothing there yet" and each add a copy.
const queues = new Map()
export function serial(key, job) {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(job)
  queues.set(key, next)
  const done = () => { if (queues.get(key) === next) queues.delete(key) }
  next.then(done, done)
  return next
}

/** Put the effects on an actor, replacing the ones this item put there before (one at a time per actor and item). */
export const putEffects = (actor, origin, data) => serial(`${actor.uuid}|${origin}`, async () => {
  const old = actor.effects.filter(e => flagOf(e)?.appliedFrom === origin).map(e => e.id)
  if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old)
  await actor.createEmbeddedDocuments('ActiveEffect', data)
})

/**
 * Copy the item's target effects to the user's targeted tokens. Returns how many actors got them (or had them asked of a GM);
 * 0: nothing done. opts: targets (default game.user.targets), ask(what, item) -> number|null, notify.
 */
export async function applyToTargets(item, { targets = game.user.targets, ask = askNumber, notify = ui.notifications } = {}) {
  const fx = forTargets(item)
  if (!fx.length) { notify.warn(loc('SR6I.Targets.NoEffects', { name: item.name })); return 0 }
  // a spell Eden says is no longer sustained would keep its effects on the targets for good (nothing ends them)
  if (item.system?.isSustained === false) { notify.warn(loc('SR6I.Targets.NotSustained', { name: item.name })); return 0 }
  const actors = [...new Map([...targets].filter(t => t.actor).map(t => [t.actor.uuid, t.actor])).values()]
  if (!actors.length) { notify.warn(loc('SR6I.Targets.None')); return 0 }
  const numbers = {}
  for (const what of promptsOf(item)) {
    const n = await ask(what, item)
    if (!Number.isFinite(n) || Math.abs(n) > NUMBER_LIMIT) return 0
    numbers[what] = n
  }
  let done = 0
  for (const actor of actors) {
    if (actor.isOwner) { await putEffects(actor, item.uuid, fx.map(e => copyData(item, e, numbers))); done++ }
    else if (game.users.activeGM) { game.socket.emit(SOCKET, { type: 'apply', item: item.uuid, actor: actor.uuid, numbers }); done++ }
    else notify.warn(loc('SR6I.Targets.NoGM', { name: actor.name }))
  }
  if (done) notify.info(loc('SR6I.Targets.Applied', { name: item.name, n: done }))
  return done
}

// every actor that can hold an effect: the world's and the unlinked tokens' own
const everyActor = () => [...Array.from(game.actors), ...Array.from(game.scenes).flatMap(s => Array.from(s.tokens).filter(t => !t.actorLink).map(t => t.actor))].filter(Boolean)
const effectsFrom = (actor, match) => Array.from(actor.effects).filter(e => flagOf(e)?.appliedFrom && match(flagOf(e).appliedFrom)).map(e => e.id)
async function deleteWhere(match) {
  let n = 0
  for (const actor of everyActor()) {
    const ids = effectsFrom(actor, match)
    if (ids.length) { await serial(`${actor.uuid}|clear`, () => actor.deleteEmbeddedDocuments('ActiveEffect', ids)); n += ids.length }
  }
  return n
}
/** Take the effects an item put on targets away again (origin: its uuid; or a test of an origin uuid). Returns how many went. */
export const clearFromTargets = origin => deleteWhere(typeof origin === 'function' ? origin : o => o === origin)
/** The effects whose item is gone (deleted while no GM was there, or with its world): removed. Returns how many. */
export async function sweepOrphans() {
  const alive = new Map()
  const exists = async uuid => { if (!alive.has(uuid)) alive.set(uuid, fromUuid(uuid).then(d => !!d, () => false)); return alive.get(uuid) }
  const gone = new Set()
  for (const actor of everyActor()) for (const e of Array.from(actor.effects)) {
    const o = flagOf(e)?.appliedFrom
    if (o && !(await exists(o))) gone.add(o)
  }
  return gone.size ? deleteWhere(o => gone.has(o)) : 0
}

const activeGM = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id
/** May this user ask for the item's effects on the actor: a GM may; a player must own the item and target the actor or at least see it. */
export function mayRequest(user, item, actor) {
  if (!user) return false
  if (user.isGM) return true
  return !!item?.testUserPermission?.(user, 'OWNER') && (Array.from(user.targets ?? []).some(t => t.actor?.uuid === actor.uuid) || !!actor.testUserPermission?.(user, 'OBSERVER'))
}
/**
 * A player's request, run by the first active GM. Foundry passes the sender's user id as the second argument. The effects are
 * rebuilt from the item itself (a request names the item, the actor and the numbers asked for, nothing else), and the sender
 * must own the item and target the actor or observe it: a player can only put a spell of their own on an actor they can see.
 */
export async function onSocket(msg, senderId) {
  if (msg?.type !== 'apply' || !activeGM()) return false
  const [item, actor] = await Promise.all([fromUuid(msg.item), fromUuid(msg.actor)])
  if (item?.documentName !== 'Item' || actor?.documentName !== 'Actor' || !mayRequest(game.users.get(senderId), item, actor)) return false
  const fx = forTargets(item)
  const numbers = Object.fromEntries(Object.entries(msg.numbers ?? {}).filter(([, n]) => Number.isFinite(n) && Math.abs(n) <= NUMBER_LIMIT))
  if (!fx.length || item.system?.isSustained === false || promptsOf(item).some(w => !Object.hasOwn(numbers, w))) return false
  await putEffects(actor, item.uuid, fx.map(e => copyData(item, e, numbers)))
  return true
}

/** Hooks: the header button on a sheet, the socket, the clean-up and the sweep. Called at ready. */
export function registerTargets() {
  game.socket.on(SOCKET, onSocket)
  Hooks.on('getItemSheetHeaderButtons', (sheet, buttons) => {
    const item = sheet.item ?? sheet.document
    if (forTargets(item).length) buttons.unshift({ label: loc('SR6I.Targets.Apply'), class: 'sr6i-apply-targets', icon: 'fas fa-bullseye', onclick: () => applyToTargets(item) })
  })
  // only the active GM clears (every client gets the hook): a sustained spell that ends, an item or an actor (its items) that goes
  Hooks.on('updateItem', (item, changes) => {
    if (activeGM() && foundry.utils.getProperty(changes, 'system.isSustained') === false) clearFromTargets(item.uuid).catch(log)
  })
  Hooks.on('deleteItem', item => { if (activeGM()) clearFromTargets(item.uuid).catch(log) })
  const ofActor = actor => o => o.startsWith(`${actor.uuid}.Item.`)
  Hooks.on('deleteActor', actor => { if (activeGM()) clearFromTargets(ofActor(actor)).catch(log) })
  Hooks.on('deleteToken', token => { if (activeGM() && !token.actorLink && token.actor) clearFromTargets(ofActor(token.actor)).catch(log) })
  if (activeGM()) sweepOrphans().catch(log)
  const mod = game.modules.get(MODULE_ID)
  if (mod) mod.api = { ...mod.api, applyToTargets, clearFromTargets, sweepOrphans }
}

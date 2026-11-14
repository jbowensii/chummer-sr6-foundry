// Panels for the 0.13 export fields, injected into Eden's own (AppV1) sheets: ammunition switch and club on a weapon's row,
// design badge, the rigger's pools, a drone's pools, the Animal Form tab. Rolls are Eden's (rolls.js). Every string from an
// import goes in by textContent: never innerHTML. A missing anchor is a no-op; a failure is logged once, never thrown.
import { MODULE_ID } from '../lib/constants.js'
import { switchAmmo } from '../lib/ammo.js'
import { animalWeapons, clubData, rollAlternate, rollPool, rollWeapon } from './rolls.js'

export const TESTED_EDEN = '4.0.11'
// Eden 4.0.11's markup the panels hang on (templates/parts/section-weapons.html, shadowrun6-Player-sheet.html,
// shadowrun6-Vehicle-sheet.html, item/item-settings.hbs, dialog/partRollDialogWeapon.html)
export const SEL = {
  itemRow: id => `.item[data-item-id="${id}"]`,
  itemName: '.item-name',
  nav: 'nav.sheet-tabs',
  body: 'section.sheet-body',
  vehiclesTab: '.tab[data-tab="vehicles"]',
  vehicleBody: 'section.sheet-body > div',
  itemSheetAmmo: 'select[name="system.ammoLoaded"]',
  itemSheetField: '.item-field',
  dialogAmmo: '#ammoLoaded',
}
export const ANIMAL_TAB = 'sr6i-animal'
const HOOKS = { pc: 'renderShadowrun6ActorSheetPC', vehicle: 'renderShadowrun6ActorSheetVehicle', item: 'renderSR6ItemSheet', dialog: 'renderRollDialog' }

const ours = d => d?.flags?.[MODULE_ID] ?? {}
export const isManagedWeapon = item => Array.isArray(ours(item).ammoTypes) && ours(item).ammoTypes.length > 0
const L = (k, fb) => { const s = game.i18n?.localize(`SR6I.Panels.${k}`); return s && !s.startsWith('SR6I.') ? s : fb }
const rootOf = html => (html instanceof HTMLElement ? html : html?.[0] ?? null)

function el(tag, { cls, text, attrs } = {}, ...kids) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = String(text)
  for (const [k, v] of Object.entries(attrs ?? {})) e.setAttribute(k, String(v))
  e.append(...kids.filter(Boolean))
  return e
}
const bandsText = ar => (ar ?? []).map(v => (v == null || v === 0 ? '—' : String(v))).join('/')
function rollButton(title, onClick) {
  const b = el('a', { cls: 'sr6i-roll', attrs: { title, role: 'button', tabindex: 0 } }, el('i', { cls: 'fas fa-dice-six' }))
  const go = ev => { ev.preventDefault(); ev.stopPropagation(); Promise.resolve(onClick()).catch(e => logOnce('roll', e)) }
  b.addEventListener('click', go)
  b.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') go(ev) })
  return b
}
const snapshot = () => el('span', { cls: 'sr6i-snapshot', text: L('Snapshot', '(imported snapshot)'),
  attrs: { title: L('SnapshotHint', 'Numbers from the Nova Prime Chummer export; re-import to refresh them.') } })
function section(title, ...kids) {
  return el('div', { cls: 'section sr6i-panel' }, el('div', { cls: 'section-head' }, el('h2', { cls: 'section-title', text: title }), snapshot()), ...kids)
}

const logged = new Set()
function logOnce(key, e) { if (logged.has(key)) return; logged.add(key); console.error(`${MODULE_ID} | panels: ${key}`, e) }
const safe = (key, fn) => (...a) => { try { fn(...a) } catch (e) { logOnce(key, e) } }

// --- the weapon row: ammunition, club, design badge ------------------------------------------------------------------
const pending = new WeakMap()
/** Switch a managed weapon's ammunition: its stats and our selection in one awaited update (lib/ammo.js). */
export async function setAmmo(item, id) {
  const u = switchAmmo(item._source?.system ?? item.system, ours(item), id || null)
  if (!u) return false
  const p = item.update({ system: u.system, flags: { [MODULE_ID]: u.flags } })
  pending.set(item, p)
  try { await p } finally { if (pending.get(item) === p) pending.delete(item) }
  return true
}

function weaponControls(app, item) {
  const actor = app.actor, f = ours(item), box = el('div', { cls: 'sr6i-weapon' })
  box.addEventListener('click', ev => ev.stopPropagation())  // (the row's own handlers: drag, open)
  if (isManagedWeapon(item)) {
    const label = L('Ammo', 'Ammo')
    if (app.isEditable) {
      const sel = el('select', { cls: 'sr6i-ammo', attrs: { 'aria-label': `${label}: ${item.name}` } })
      for (const [id, name] of [['', L('Standard', 'Standard (regular)')], ...f.ammoTypes.map(t => [t.id, t.name])]) {
        const o = el('option', { text: name, attrs: { value: id } })
        if ((f.ammoActive ?? '') === id) o.selected = true
        sel.append(o)
      }
      sel.addEventListener('change', ev => { ev.stopPropagation(); sel.disabled = true; setAmmo(item, sel.value).catch(e => logOnce('ammo', e)).finally(() => { sel.disabled = false }) })
      box.append(el('label', { cls: 'sr6i-label', text: `${label}:` }), sel)
      if (actor.isOwner) box.append(rollButton(L('RollWeapon', 'Roll with this ammunition'), async () => { await pending.get(item); return rollWeapon(actor, item) }))
    } else {
      box.append(el('span', { cls: 'sr6i-label', text: `${label}: ${f.ammoTypes.find(t => t.id === f.ammoActive)?.name ?? L('Standard', 'Standard (regular)')}` }))
    }
  }
  if (f.meleeAlternate) {
    const alt = f.meleeAlternate
    box.append(el('span', { cls: 'sr6i-club', text: `${L('Club', 'As a club')}: ${alt.dv}${alt.stun !== false ? 'S' : 'P'}, AR ${bandsText(alt.ar)}` }))
    if (actor.isOwner) box.append(rollButton(L('RollClub', 'Attack with it as a club (Close Combat)'), () => rollAlternate(actor, clubData(item, alt))))
  }
  return box.childElementCount ? box : null
}
function badge(item) {
  const f = ours(item)
  if (!f.design) return null
  return el('span', { cls: `sr6i-badge ${f.approved ? 'approved' : 'unapproved'}`, text: f.approved ? L('Approved', 'Design ✓') : L('Unapproved', 'Design (not approved)'),
    attrs: { title: `${L('DesignHint', 'Bought from a saved item design')}: ${f.design}` } })
}
function itemRows(app, root) {
  for (const item of app.actor.items) {
    const kids = [badge(item), item.type === 'gear' && weaponControls(app, item)].filter(Boolean)
    if (!kids.length) continue
    const name = root.querySelector(SEL.itemRow(CSS.escape(item.id)))?.querySelector(SEL.itemName)
    if (name) name.after(...kids)
  }
}

// --- pools ------------------------------------------------------------------------------------------------------------
function poolTable(actor, rows, { owner, wounds }) {
  const t = el('table', { cls: 'sr6i-pools' })
  for (const r of rows) {
    const cell = el('td', { cls: 'sr6i-pool', text: r.pool })
    if (owner) cell.append(' ', rollButton(`${r.label}: ${r.pool}`, () => rollPool(actor, { pool: r.pool, label: r.label, wounds })))
    t.append(el('tr', {}, el('td', { text: r.label }), cell))
  }
  return t
}
function riggingPanel(app, root) {
  const rig = ours(app.actor).rigging, tab = root.querySelector(SEL.vehiclesTab)
  if (!rig || !tab) return
  const owner = app.actor.isOwner, rows = list => (list ?? []).map(r => ({ label: String(r.test), pool: Number(r.pool) || 0 }))
  tab.append(section(L('Rigging', 'Rigging pools'),
    el('h3', { text: L('Driving', 'By hand') }), poolTable(app.actor, rows(rig.driving), { owner, wounds: true }),
    el('h3', { text: L('JumpedIn', 'Jumped in') }), poolTable(app.actor, rows(rig.jumpedIn), { owner, wounds: true })))
}
const MODE = { autonomous: ['Autonomous', 'Acting on its own'], rcc: ['Rcc', 'Slaved to the RCC'] }
function dronePanel(app, root) {
  const pools = ours(app.actor).dronePools, body = root.querySelector(SEL.vehicleBody)
  if (!pools?.length || !body) return
  const kids = []
  for (const mode of Object.keys(MODE)) {
    const rows = pools.filter(p => p.mode === mode).map(p => ({ label: `${p.test} (${p.autosoft})`, pool: Number(p.pool) || 0 }))
    if (rows.length) kids.push(el('h3', { text: L(MODE[mode][0], MODE[mode][1]) }), poolTable(app.actor, rows, { owner: app.actor.isOwner, wounds: false }))
  }
  body.append(section(L('DronePools', 'Drone pools'), ...kids))
}

// --- the Animal Form tab ----------------------------------------------------------------------------------------------
const ATTRS = ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha']
function animalTab(app, root) {
  const form = ours(app.actor).animalForm, nav = root.querySelector(SEL.nav), body = root.querySelector(SEL.body)
  if (!form || !nav || !body) return
  nav.append(el('a', { cls: 'item', text: L('AnimalForm', 'Animal form'), attrs: { 'data-tab': ANIMAL_TAB } }))
  const attrs = el('table', { cls: 'sr6i-animal-attrs' }, el('tr', {}, ...ATTRS.map(k => el('th', { text: k.toUpperCase() }))),
    el('tr', {}, ...ATTRS.map(k => el('td', { text: form.attributes?.[k] ?? '—' }))))
  const weapons = el('table', { cls: 'sr6i-animal-weapons' })
  const datas = animalWeapons(form)
  ;(form.weapons ?? []).forEach((w, i) => {
    const data = datas[i], cell = el('td')
    if (data && app.actor.isOwner) cell.append(rollButton(`${L('Attack', 'Attack')}: ${w.name}`, () => rollAlternate(app.actor, data)))
    weapons.append(el('tr', {}, el('td', { text: w.name }), el('td', { text: w.dv }), el('td', { text: `AR ${bandsText(data?.ar ?? w.ar)}` }), cell))
  })
  body.append(el('div', { cls: `tab ${ANIMAL_TAB}`, attrs: { 'data-group': 'primary', 'data-tab': ANIMAL_TAB } },
    section(`${L('AnimalForm', 'Animal form')}: ${form.form}`, attrs, weapons)))
  // Foundry's Tabs bound before this hook ran: an active Animal Form tab is shown again
  const tabs = app._tabs?.[0]
  if (tabs?.active === ANIMAL_TAB) tabs.activate(ANIMAL_TAB)
}

// --- Eden's own ammunition selectors stay out of a managed weapon -----------------------------------------------------
function hideItemSheetAmmo(app, root) {
  if (!isManagedWeapon(app.item)) return
  const sel = root.querySelector(SEL.itemSheetAmmo)
  ;(sel?.closest(SEL.itemSheetField) ?? sel)?.setAttribute('hidden', '')
}
function hideDialogAmmo(app, root) {
  const item = app.options?.prepared?.item ?? app.prepared?.item
  if (!isManagedWeapon(item)) return
  const sel = root.querySelector(SEL.dialogAmmo), cell = sel?.closest('td')
  if (!cell) return
  cell.previousElementSibling?.setAttribute('hidden', '')
  cell.setAttribute('hidden', '')
  sel.disabled = true
}
/** preUpdateItem: a managed weapon's Eden ammoLoaded stays 'regular' (its stats already hold the type: one authority). */
export function keepRegular(item, changes) {
  if (!isManagedWeapon(item)) return
  const v = foundry.utils.getProperty(changes, 'system.ammoLoaded')
  if (v !== undefined && v !== 'regular') foundry.utils.setProperty(changes, 'system.ammoLoaded', 'regular')
}

let warned = false
function edenOk() {
  if (game.system?.id !== 'shadowrun6-eden') return false
  if (!warned && foundry.utils.isNewerVersion(game.system.version, TESTED_EDEN)) {
    warned = true
    console.warn(`${MODULE_ID} | panels tested with shadowrun6-eden ${TESTED_EDEN}; this world runs ${game.system.version}`)
  }
  return true
}
const on = (hook, key, fn) => Hooks.on(hook, safe(key, (app, html) => { if (!edenOk()) return; const root = rootOf(html); if (root) fn(app, root) }))

/** Called once at init (main.js). */
export function registerPanels() {
  on(HOOKS.pc, 'pc sheet', (app, root) => { itemRows(app, root); riggingPanel(app, root); animalTab(app, root) })
  on(HOOKS.vehicle, 'vehicle sheet', (app, root) => { itemRows(app, root); dronePanel(app, root) })
  on(HOOKS.item, 'item sheet', hideItemSheetAmmo)
  on(HOOKS.dialog, 'roll dialog', hideDialogAmmo)
  Hooks.on('preUpdateItem', safe('ammo guard', keepRegular))
}

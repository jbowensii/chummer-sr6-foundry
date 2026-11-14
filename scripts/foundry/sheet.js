// "Nova Prime Chummer": an optional actor sheet for Eden's Player actors, laid out like the Nova Prime Chummer app's SR6
// print sheet (lib/sheet-view.js has the layout's data; templates/sheet/*.hbs the markup). Eden's sheet stays the
// default; a user picks this one per actor (the sheet's Sheet setting).
// It extends Eden's own Player sheet (shadowrun6-eden 4.0.11 game.sr6.applications.Shadowrun6ActorSheetPC, an appv1
// ActorSheet: applications/sheets/ActorSheetPC.js, SR6ActorSheet.js), overriding only its template, options and getData
// (plus two small listeners), so Eden's listeners, item handling, rolls and effects work unchanged: the templates use Eden's
// own hooks (data-field inputs, .item[data-item-id] rows, .skill-roll / .weapon-roll / .attributeonly-roll links,
// data-action buttons, nav.sheet-tabs + .tab[data-tab]).
// The class is made only once Eden's sheet exists (registerNovaSheet, from main.js at init: a system's init runs before a
// module's); if it is missing or anything throws, it logs once and registers nothing: Eden's sheet is untouched.
import { MODULE_ID } from '../lib/constants.js'
import { sheetView } from '../lib/sheet-view.js'

export const SHEET_CLASS = 'NovaPrimeSheet'
export const SHEET_ID = `${MODULE_ID}.${SHEET_CLASS}`
const DIR = `modules/${MODULE_ID}/templates/sheet`
export const TEMPLATE = `${DIR}/sheet.hbs`
export const PARTIALS = ['header', 'skills', 'condition', 'combat', 'magic', 'belongings'].map(p => `${DIR}/${p}.hbs`)

/** The sheet class on top of Eden's Player sheet (Base). A factory: `extends` runs only when called with a real class. */
export function makeNovaSheet(Base) {
  return class NovaPrimeSheet extends Base {
    static get defaultOptions() {
      const o = super.defaultOptions
      return foundry.utils.mergeObject(o, {
        // (Eden's own 'shadowrun6' class is left off: its dark theme would fight the paper look)
        classes: ['sheet', 'actor', 'sr6i-sheet'],
        template: TEMPLATE,
        width: 860,
        height: 900,
        tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.sheet-body', initial: 'sheet' }],
        scrollY: ['.sheet-body'],
      }, { inplace: false })
    }

    async getData(options) {
      const data = await super.getData(options)
      try {
        data.nova = sheetView(viewInput(this.actor), viewDeps())
      } catch (err) {
        console.error(`${MODULE_ID} | Nova Prime Chummer sheet: could not lay out ${this.actor?.name}`, err)
        data.nova = null
      }
      return data
    }

    activateListeners(html) {
      super.activateListeners(html)
      // a critter is its own actor (foundry/apply.js applyOwned): its name opens its sheet
      html.find('.sr6i-open-actor').on('click', async ev => (await fromUuid(ev.currentTarget.dataset.uuid))?.sheet?.render(true))
      if (!this.isEditable) return
      html.find('.sr6i-box').on('click', ev => this._onNovaBox(ev))
    }

    // A condition or Edge box: click the box past the last marked one to mark up to it, the last marked one to clear it
    // (Eden's own monitor UX, SR6ActorSheet._setDamage). Physical and stun go through Eden's applyDamage, as its inputs do.
    async _onNovaBox(ev) {
      ev.preventDefault()
      const { monitor, n } = ev.currentTarget.dataset, box = Number(n)
      const sys = this.actor.system
      const now = monitor === 'edge' ? Number(sys.edge?.value ?? 0) : Number(sys[monitor]?.dmg ?? 0)
      const next = now >= box ? box - 1 : box
      if (monitor === 'physical' || monitor === 'stun') return this.actor.applyDamage({ monitor, newDmg: next })
      if (monitor === 'overflow') return this.actor.update({ 'system.overflow.dmg': next })
      if (monitor === 'edge') return this.actor.update({ 'system.edge.value': next })
    }
  }
}

// The live actor as the plain data sheetView reads: Eden's prepared system, its calculated weapon numbers, effects and
// the actor's critters (Critter actors our import tied to it by flags.runner).
function viewInput(actor) {
  const runner = actor.flags?.[MODULE_ID]?.id
  return {
    name: actor.name, img: actor.img, type: actor.type, system: actor.system, source: actor._source?.system, flags: actor.flags, traits: actor.traits,
    items: actor.items.contents.map(i => ({ id: i.id, uuid: i.uuid, name: i.name, type: i.type, system: i.system, flags: i.flags,
      ar: i.calculatedAttackRating, dmg: i.calculatedDamage, stun: i.calculatedStun })),
    effects: [...(actor.allApplicableEffects?.() ?? [])].map(e => ({ id: e.id, name: e.name, disabled: e.disabled,
      source: e.parent && e.parent !== actor ? e.parent.name : '' })),
    critters: runner ? game.actors.filter(a => a.type === 'Critter' && a.flags?.[MODULE_ID]?.runner === runner) : [],
  }
}
const viewDeps = () => ({
  localize: k => game.i18n.localize(k),
  skillAttr: id => CONFIG.SR6?.ATTRIB_BY_SKILL?.get?.(id)?.attrib ?? '',
  specLabel: (skill, key) => CONFIG.SR6?.skill_special?.[skill]?.[key] ?? key,
})

let warned = false
/**
 * Make and register the sheet (Player actors only, never the default). Returns the class, or null when Eden's Player sheet
 * isn't there or registering failed (logged once; nothing registered, Eden's sheet as it was).
 * The defaults are Foundry's; tests pass stand-ins.
 */
export function registerNovaSheet({ apps = globalThis.game?.sr6?.applications, Actors = globalThis.foundry?.documents?.collections?.Actors,
  loadTemplates = globalThis.foundry?.applications?.handlebars?.loadTemplates, log = console } = {}) {
  try {
    const Base = apps?.Shadowrun6ActorSheetPC
    if (typeof Base !== 'function') throw new Error('shadowrun6-eden Player sheet (game.sr6.applications.Shadowrun6ActorSheetPC) not found')
    if (typeof Actors?.registerSheet !== 'function') throw new Error('Actors.registerSheet not found')
    const Sheet = makeNovaSheet(Base)
    Actors.registerSheet(MODULE_ID, Sheet, { types: ['Player'], makeDefault: false, label: 'SR6I.Sheet.Label' })
    loadTemplates?.(PARTIALS)
    return Sheet
  } catch (err) {
    if (!warned) log.warn(`${MODULE_ID} | Nova Prime Chummer sheet not available (Eden's sheet is unchanged): ${err?.message ?? err}`)
    warned = true
    return null
  }
}

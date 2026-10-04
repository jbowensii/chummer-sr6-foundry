// The import window. createImportApp() is called at init: Foundry's classes only exist once Foundry has loaded.
import { MODULE_ID, TESTED_EDEN } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, npcHeadline, translateRunner } from '../lib/translate.js'
import { defaultChoice } from '../lib/plan.js'
import { applyRunner, edenSpecLabels, findExisting, NPC_FOLDER } from './apply.js'

const flagOf = d => d?.flags?.[MODULE_ID]
const time = x => Date.parse(x ?? '') || 0
// Only a real image goes into <img> and the world's files (apply.js names it .png or .jpg).
const PORTRAIT = /^data:image\/(png|jpe?g);base64,/i
const OUTCOME = { create: 'SR6I.Created', replace: 'SR6I.Replaced', new: 'SR6I.NewVersion', skip: 'SR6I.Skipped' }
const SYSTEM = 'shadowrun6-eden'

// getIcons() -> icons/index.json as loaded at init, or null (no icons).
export function createImportApp(getIcons = () => null) {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
  const L = k => game.i18n.localize(k), F = (k, d) => game.i18n.format(k, d)
  const date = x => time(x) ? new Date(x).toLocaleString(game.i18n.lang, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  // Plain text -> escaped paragraphs -> Foundry's cleaner (translate.js: wrap the cleaner around escapeText, never replace it).
  const clean = foundry.utils.cleanHTML ?? (h => h)
  const sanitize = s => clean(escapeText(s))

  return class ChummerSr6ImportApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: 'chummer-sr6-import',
      classes: ['sr6i-app'],
      window: { title: 'SR6I.Title', icon: 'fas fa-file-import' },
      position: { width: 560, height: 'auto' },
      actions: { import: ChummerSr6ImportApp.#onImport, openActor: ChummerSr6ImportApp.#onOpen, done: ChummerSr6ImportApp.#onDone },
    }
    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/import.hbs`, scrollable: ['.sr6i-rows', '.sr6i-report'] } }

    file = null; rows = null; refused = ''; busy = false; report = null

    async _prepareContext(options) {
      const sys = game.system
      const systemError = sys.id !== SYSTEM ? F('SR6I.NotEden', { system: sys.title ?? sys.id }) : ''
      const systemWarning = !systemError && foundry.utils.isNewerVersion(sys.version, TESTED_EDEN)
        ? F('SR6I.NewerEden', { tested: TESTED_EDEN, version: sys.version }) : ''
      const rows = this.rows?.map(row => {
        const worldAt = flagOf(row.existing)?.exportedAt
        const d = time(row.exportedAt) - time(worldAt)
        return {
          name: row.runner.streetName, portrait: row.portrait, exported: F('SR6I.Exported', { date: date(row.exportedAt) }),
          npc: row.runner.npc ? npcHeadline(row.runner.npc) : '',
          older: row.existing && d < 0,
          inWorld: row.existing ? F('SR6I.InWorld', { world: date(worldAt), file: date(row.exportedAt),
            compare: L(d > 0 ? 'SR6I.Newer' : d < 0 ? 'SR6I.Older' : 'SR6I.Same') }) : '',
          choices: ['replace', 'new', 'skip'].map(value => ({ value, checked: value === row.choice,
            label: L({ replace: 'SR6I.Replace', new: 'SR6I.New', skip: 'SR6I.Skip' }[value]) })),
        }
      })
      const nNpc = this.rows?.filter(r => r.runner.npc).length ?? 0
      const summary = nNpc ? F('SR6I.RunnersAndNpcs', { runners: this.rows.length - nNpc, npcs: nNpc, folder: NPC_FOLDER }) : ''
      return { systemError, systemWarning, rows, summary, refused: this.refused, busy: this.busy, report: this.report,
        includeLabel: L('SR6I.Include'), progress: '' }
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options)
      this.element.querySelector('input[name=file]')?.addEventListener('change', ev => this.#load(ev.target.files?.[0]))
      this.element.querySelector('select[name=applyAll]')?.addEventListener('change', ev => {
        const v = ev.target.value
        if (!v) return
        for (const r of this.element.querySelectorAll(`.sr6i-choices input[value=${v}]`)) r.checked = true
        // A runner new to the world has no choices: its tick is its only control.
        if (v === 'skip') this.rows?.forEach((row, i) => {
          const tick = !row.existing && this.element.querySelector(`[name="tick-${i}"]`)
          if (tick) tick.checked = false
        })
      })
    }

    async #load(file) {
      if (!file) return
      let res
      try { res = readExport(await file.text()) } catch (e) { res = { ok: false, reason: F('SR6I.ReadFailed', { reason: e?.message ?? String(e) }) } }
      // ponytail: book files are read but not imported until the book import lands (plan M8)
      if (res.ok && res.file.kind === 'books') res = { ok: false, reason: L('SR6I.BooksNotYet') }
      this.file = res.ok ? res.file : null
      this.refused = res.ok ? '' : res.reason
      const image = s => (PORTRAIT.test(s ?? '') ? s : null)
      this.rows = res.ok ? res.file.runners.map(runner => {
        const existing = findExisting(runner.id), exportedAt = runner.exportedAt ?? res.file.exportedAt
        return { runner, existing, exportedAt, portrait: image(runner.portrait), token: image(runner.token),
          choice: defaultChoice(flagOf(existing), { exportedAt }) }
      }) : null
      this.render()
    }

    static async #onImport() {
      if (this.busy || !this.rows || game.system.id !== SYSTEM) return
      const el = this.element
      // Read the choices from the form before anything re-renders it.
      const jobs = this.rows.map((row, i) => ({ row, tick: el.querySelector(`[name="tick-${i}"]`)?.checked,
        choice: row.existing ? el.querySelector(`[name="choice-${i}"]:checked`)?.value ?? row.choice : 'create' }))
      const total = jobs.filter(j => j.tick && j.choice !== 'skip').length
      this.busy = true
      for (const b of el.querySelectorAll('button[data-action=import], input')) b.disabled = true
      const progress = el.querySelector('.sr6i-progress')
      const specs = edenSpecLabels(), report = []
      let n = 0
      for (const { row, tick, choice } of jobs) {
        const name = row.runner.streetName
        if (!tick || choice === 'skip') { report.push({ name, outcome: L('SR6I.Skipped'), textOnly: [] }); continue }
        if (progress) progress.textContent = F('SR6I.Progress', { n: ++n, total })
        let res, textOnly = []
        try {
          const t = translateRunner(row.runner, { exportedAt: row.exportedAt, appVersion: this.file.app?.version ?? '', sanitize, icons: getIcons(), specs })
          textOnly = t.textOnly
          res = await applyRunner(t, choice, { portrait: row.portrait, token: row.token, exportedAt: row.exportedAt })
        } catch (error) { res = { action: 'failed', error } }  // translate threw: nothing in the world changed
        const failed = res.action === 'failed'
        report.push({ name, failed, textOnly: failed ? [] : textOnly,
          outcome: failed ? F('SR6I.Failed', { reason: res.error?.message ?? String(res.error) }) : L(OUTCOME[res.action]),
          actorId: failed || res.action === 'skip' ? null : res.actor?.id,
          openLabel: F('SR6I.Open', { name: res.actor?.name ?? name }) })
      }
      Object.assign(this, { busy: false, report })
      this.render()
    }

    static #onOpen(event, target) { game.actors.get(target.dataset.actorId)?.sheet?.render(true) }
    static #onDone() { this.close() }
  }
}

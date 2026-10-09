// The import window. createImportApp() is called at init: Foundry's classes only exist once Foundry has loaded.
import { MODULE_ID, TESTED_EDEN } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, npcHeadline, translateRunner } from '../lib/translate.js'
import { defaultChoice } from '../lib/plan.js'
import { planUpsert } from '../lib/chummer-id.js'
import { PACKS, PORTRAIT, translateBook } from '../lib/books.js'
import { applyRunner, COMPENDIUM_FOLDER, edenComplexForms, edenSpecLabels, findExisting, NPC_FOLDER } from './apply.js'
import { importBook } from './books.js'

const flagOf = d => d?.flags?.[MODULE_ID]
const time = x => Date.parse(x ?? '') || 0
// Only a real image (PORTRAIT) goes into <img> and the world's files (apply.js names it .png or .jpg).
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
      actions: { import: ChummerSr6ImportApp.#onImport, openActor: ChummerSr6ImportApp.#onOpen, done: ChummerSr6ImportApp.#onDone,
        openCompendiums: ChummerSr6ImportApp.#onOpenCompendiums },
    }
    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/import.hbs`, scrollable: ['.sr6i-rows', '.sr6i-report'] } }

    file = null; rows = null; books = null; refused = ''; busy = false; report = null; bookReport = false

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
      const books = this.books?.map(({ book, t, error }) => ({
        name: book.source.name, id: book.source.id, error: error && F('SR6I.Failed', { reason: error }),
        canon: book.source.compendium ? F('SR6I.Compendium', { folder: COMPENDIUM_FOLDER }) : L(book.source.canon ? 'SR6I.Canon' : 'SR6I.NonCanon'),
        descriptions: L(this.file.descriptions === true ? 'SR6I.DescriptionsIn' : 'SR6I.DescriptionsOut'),
        // after de-duplicating chummerIDs, as the write does (planUpsert); rules count their pages, not the chapter journals
        counts: t && Object.keys(PACKS).filter(k => t.packs[k]?.length).map(k => { const docs = planUpsert([], t.packs[k]).creates
          const n = k === 'rules' ? docs.reduce((n, j) => n + j.pages.length, 0) : docs.length
          return `${PACKS[k][0]} ${n}` }).join(' · ') || L('SR6I.NothingInBook'),
      }))
      const nNpc = this.rows?.filter(r => r.runner.npc).length ?? 0
      const summary = nNpc ? F('SR6I.RunnersAndNpcs', { runners: this.rows.length - nNpc, npcs: nNpc, folder: NPC_FOLDER }) : ''
      return { systemError, systemWarning, rows, summary, books, bookReport: this.bookReport, refused: this.refused, busy: this.busy,
        report: this.report, includeLabel: L('SR6I.Include'), bookLabel: L('SR6I.IncludeBook'), progress: '' }
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
      this.file = res.ok ? res.file : null
      this.refused = res.ok ? '' : res.reason
      const books = res.ok && res.file.kind === 'books'
      // Translated now for the preview's counts; Import writes these. A book that can't be translated is shown failed.
      this.books = books ? res.file.books.map(book => {
        try {
          return { book, t: translateBook(book, { exportedAt: book.exportedAt ?? res.file.exportedAt, appVersion: res.file.app?.version ?? '',
            descriptions: res.file.descriptions === true, sanitize, icons: getIcons(), specs: edenSpecLabels(), complexForms: edenComplexForms() }) }
        } catch (e) { return { book, error: e?.message ?? String(e) } }
      }) : null
      const image = s => (PORTRAIT.test(s ?? '') ? s : null)
      this.rows = res.ok && !books ? res.file.runners.map(runner => {
        const existing = findExisting(runner.id), exportedAt = runner.exportedAt ?? res.file.exportedAt
        return { runner, existing, exportedAt, portrait: image(runner.portrait), token: image(runner.token),
          choice: defaultChoice(flagOf(existing), { exportedAt }) }
      }) : null
      this.render()
    }

    static async #onImport() {
      if (this.books) return this.#importBooks()
      if (this.busy || !this.rows || game.system.id !== SYSTEM) return
      const el = this.element
      // Read the choices from the form before anything re-renders it.
      const jobs = this.rows.map((row, i) => ({ row, tick: el.querySelector(`[name="tick-${i}"]`)?.checked,
        choice: row.existing ? el.querySelector(`[name="choice-${i}"]:checked`)?.value ?? row.choice : 'create' }))
      const total = jobs.filter(j => j.tick && j.choice !== 'skip').length
      this.busy = true
      for (const b of el.querySelectorAll('button[data-action=import], input')) b.disabled = true
      const progress = el.querySelector('.sr6i-progress')
      const specs = edenSpecLabels(), complexForms = edenComplexForms(), report = []
      let n = 0
      for (const { row, tick, choice } of jobs) {
        const name = row.runner.streetName
        if (!tick || choice === 'skip') { report.push({ name, outcome: L('SR6I.Skipped'), textOnly: [] }); continue }
        if (progress) progress.textContent = F('SR6I.Progress', { n: ++n, total })
        let res, textOnly = []
        try {
          const t = translateRunner(row.runner, { exportedAt: row.exportedAt, appVersion: this.file.app?.version ?? '', sanitize, icons: getIcons(), specs, complexForms })
          textOnly = t.textOnly
          res = await applyRunner(t, choice, { portrait: row.portrait, token: row.token, exportedAt: row.exportedAt })
        } catch (error) { res = { action: 'failed', error } }  // translate threw: nothing in the world changed
        const failed = res.action === 'failed'
        report.push({ name, failed, textOnly: failed ? [] : [...textOnly, ...(res.notes ?? []).map(l => `${name}: ${l}`)],
          outcome: failed ? F('SR6I.Failed', { reason: res.error?.message ?? String(res.error) }) : L(OUTCOME[res.action]),
          actorId: failed || res.action === 'skip' ? null : res.actor?.id,
          openLabel: F('SR6I.Open', { name: res.actor?.name ?? name }) })
      }
      Object.assign(this, { busy: false, report })
      this.render()
    }

    async #importBooks() {
      if (this.busy || game.system.id !== SYSTEM) return
      const el = this.element
      const jobs = this.books.filter((b, i) => el.querySelector(`[name="book-${i}"]`)?.checked)
      const progress = el.querySelector('.sr6i-progress')
      if (!jobs.length) { if (progress) progress.textContent = L('SR6I.NothingSelected'); return }
      this.busy = true
      for (const b of el.querySelectorAll('button[data-action=import], input')) b.disabled = true
      // A book that couldn't be translated has no tick; the report lists it as failed.
      const report = this.books.filter(b => b.error).map(({ book, error }) =>
        ({ name: book.source.name, failed: true, outcome: F('SR6I.Failed', { reason: error }), packs: [], textOnly: [] }))
      let n = 0
      for (const { book, t } of jobs) {
        const name = book.source.name
        if (progress) progress.textContent = F('SR6I.BookProgress', { name, n: ++n, total: jobs.length })
        const onProgress = ({ key, n: i, total }) => {
          if (progress) progress.textContent = F('SR6I.BookPackProgress', { name, pack: PACKS[key][0], n: i, total })
        }
        let res
        try { res = await importBook(t, { onProgress }) } catch (error) { res = { counts: {}, failed: [{ name, error }] } }  // importBook shouldn't throw; the window mustn't stick busy
        // one line per pack written or failed; an id the file has twice is noted with the report lines
        const counts = Object.values(res.counts)
        const packs = [...counts.map(c => ({ text: F('SR6I.PackResult', c) })),
          ...res.failed.map(f => ({ failed: true, text: F('SR6I.PackFailed', { label: f.name, reason: f.error?.message ?? String(f.error) }) }))]
        const dupes = counts.flatMap(c => c.duplicates.map(d => F('SR6I.Duplicate', { label: c.label, name: d })))
        report.push({ name, packs, outcome: packs.length ? '' : L('SR6I.NothingInBook'), textOnly: [...t.textOnly, ...(res.notes ?? []), ...dupes] })
      }
      Object.assign(this, { busy: false, report, bookReport: true })
      this.render()
    }

    static #onOpen(event, target) { game.actors.get(target.dataset.actorId)?.sheet?.render(true) }
    static #onDone() { this.close() }
    static #onOpenCompendiums() { ui.sidebar?.changeTab('compendium', 'primary'); ui.sidebar?.expand() }
  }
}

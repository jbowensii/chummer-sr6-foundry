// In-Foundry tests (Quench, https://github.com/Ethaks/FVTT-Quench). Registered from main.js on 'quenchReady'.
// They drive the window's own code paths: readExport -> findExisting/defaultChoice -> translateRunner -> applyRunner.
// Each batch makes its own Actors folder "Chummer SR6 Importer tests" and fresh ids (quench-<random>-…); after() deletes exactly those.
// The book batches write packs named sr6test-… and delete exactly those.
import { MODULE_ID } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, translateRunner } from '../lib/translate.js'
import { defaultChoice, newVersionName } from '../lib/plan.js'
import { applyRunner, COMPENDIUM_FOLDER, edenSpecLabels, findExisting, isEdenUnarmed as edenUnarmed } from './apply.js'
import { planBookPacks, translateBook } from '../lib/books.js'
import { INDEX_FIELDS } from '../lib/chummer-id.js'
import { iconFor, MODULE_ICON_ROOT } from '../lib/icons.js'
import { importBook } from './books.js'
import { applyIcons, loadIconIndex } from './icons.js'

const TEST_FOLDER = 'Chummer SR6 Importer tests'
const SAMPLE = `modules/${MODULE_ID}/samples/test-runners.json`
const BOOKS = `modules/${MODULE_ID}/samples/test-books.json`
const COMPENDIUM = `modules/${MODULE_ID}/samples/test-compendium.json`
const PREFIX = 'sr6test-'  // world packs these tests make: world.sr6test-sr6-<source>-<topic>
const flagOf = d => d?.flags?.[MODULE_ID]
const HOSTILE = () => CONST.TOKEN_DISPOSITIONS.HOSTILE

// The sample, with its runners given ids no real import uses, so findExisting only ever sees this run's actors.
async function loadSample() {
  const res = readExport(await (await fetch(SAMPLE)).text())
  if (!res.ok) throw new Error(res.reason)
  const tag = `quench-${foundry.utils.randomID()}-`
  for (const r of res.file.runners) r.id = tag + r.id
  return { file: res.file, tag }
}

// As the window does it (app.js #onImport): same sanitizer, specs, translate and apply calls.
// images: { portrait, token } data URLs, uploaded as the window does (only the portrait and token batch passes them).
function importRunner(file, runner, choice, folder, images = {}) {
  const clean = foundry.utils.cleanHTML ?? (h => h)
  const exportedAt = runner.exportedAt ?? file.exportedAt
  const t = translateRunner(runner, { exportedAt, appVersion: file.app?.version ?? '', sanitize: s => clean(escapeText(s)), specs: edenSpecLabels() })
  return applyRunner(t, choice, { exportedAt, folder, ...images })
}

// This batch's folder, created fresh: a folder of the same name the GM already has is never used or deleted.
const makeFolder = () => Folder.create({ name: TEST_FOLDER, type: 'Actor', folder: null })
// Delete this run's actors (by flagged id), then this batch's folder.
async function cleanUp(tag, folder) {
  const ids = game.actors.filter(a => String(flagOf(a)?.id ?? '').startsWith(tag)).map(a => a.id)
  if (ids.length) await Actor.deleteDocuments(ids)
  if (folder && game.folders.get(folder.id)) await folder.delete({ deleteSubfolders: true, deleteContents: true })
}
const ours = actor => actor.items.filter(i => !edenUnarmed(i))
const itemsOf = (actor, type) => actor.items.filter(i => i.type === type)
const byName = (actor, name) => actor.items.find(i => i.name === name)
const count = docs => docs.reduce((c, d) => ({ ...c, [d.type]: (c[d.type] ?? 0) + 1 }), {})
// A made-up NPC block for the batch's critter, spirit and sprite (the shapes of the export's npc).
const stat = (key, printed, value = printed) => ({ key, label: key.toUpperCase(), printed, value, ok: true })

// an entry of a pack by our chummerID (lib/chummer-id.js): Foundry picked its _id
async function byKey(pack, key) {
  const index = await pack.getIndex({ fields: INDEX_FIELDS })
  const hit = [...index.values()].find(i => i.flags?.['chummer-sr6-importer']?.chummerID === key)
  return hit ? pack.getDocument(hit._id) : null
}

export function registerQuench(quench) {
  const batch = (name, fn) => quench.registerBatch(`${MODULE_ID}.${name.replace(/\W+/g, '-')}`, fn,
    { displayName: `Chummer SR6 Importer: ${name}` })

  batch('read', ({ describe, it, assert }) => {
    describe('readExport refuses what it cannot read, before anything changes', function () {
      const refused = (text, re) => {
        const before = game.actors.size, r = readExport(text)
        assert.isFalse(r.ok); assert.match(r.reason, re); assert.equal(game.actors.size, before)
      }
      it('an Anarchy file, naming the Anarchy importer', () =>
        refused(JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [{}] }), /Chummer Anarchy 2\.0 Importer/))
      it('a version 2 file', () => refused(JSON.stringify({ format: 'chummer-sr6-export', version: 2, kind: 'runners', runners: [{}] }), /version 2.*update this module/))
      it('no runners', () => refused(JSON.stringify({ format: 'chummer-sr6-export', version: 1, kind: 'runners', runners: [] }), /no runners/))
      it('the sample file is accepted', async () => { const { file } = await loadSample(); assert.lengthOf(file.runners, 2) })
    })
  })

  batch('runner', ({ describe, it, assert, before, after }) => {
    describe('importing the sample runner', function () {
      this.timeout(30000)
      let tag, folder, file, runner, mara, t
      before(async function () {
        const s = await loadSample(); tag = s.tag; file = s.file; runner = file.runners[0]
        folder = await makeFolder()
        assert.equal(defaultChoice(flagOf(findExisting(runner.id)), runner), 'create')
        t = translateRunner(runner, { exportedAt: file.exportedAt, appVersion: '' })
        const res = await importRunner(file, runner, 'create', folder)
        assert.equal(res.action, 'create', res.error?.message)
        mara = res.actor
      })
      after(() => cleanUp(tag, folder))

      it('is a Player in the test folder, linked, with Edge full', () => {
        assert.equal(mara.type, 'Player')
        assert.equal(mara.folder?.id, folder.id)
        assert.isTrue(mara.prototypeToken.actorLink)
        assert.equal(mara.system.edge.value, mara.system.edge.max)
        assert.equal(mara.system.edge.max, runner.attributes.edg.natural)
      })
      it('has the file’s natural attributes as bases, and Eden derives the pools', () => {
        assert.equal(mara.system.attributes.agi.base, runner.attributes.agi.natural)
        assert.isAtLeast(mara.system.attributes.agi.pool, 1)
        assert.isAbove(mara.system.skills.firearms.pool, 0)
      })
      it('has its mortype', () => assert.equal(mara.system.mortype, 'mysticadept'))
      it('has every item, per type', () => assert.deepEqual(count(ours(mara)), count(t.items)))
      it('has at most one of Eden’s Unarmed items', () => assert.isAtMost(mara.items.filter(edenUnarmed).length, 1))
      it('its items carry our Active Effects (the book text’s, its bonuses), flagged as ours', () => {
        const fx = ours(mara).flatMap(i => [...i.effects])
        assert.isNotEmpty(fx)
        for (const e of fx) assert.isTrue(e.flags?.['chummer-sr6-importer']?.chummer, e.name)
      })
      it('its vehicle is an Eden Vehicle actor that belongs to it, in "<runner> vehicles"', () => {
        const bike = game.actors.find(x => x.type === 'Vehicle' && flagOf(x)?.runner === runner.id)
        assert.ok(bike, 'vehicle actor')
        assert.equal(bike.system.vehicle.belongs, mara.id)
        assert.equal(bike.folder?.name, `${mara.name} vehicles`)
      })
      it('keeps the genesisID of knowledge and language skills only', () => {
        assert.sameMembers(itemsOf(mara, 'skill').map(i => i.system.genesisID), ['knowledge', 'language', 'language'])
        for (const i of ours(mara).filter(i => i.type !== 'skill')) assert.equal(i.system.genesisID ?? '', '', i.name)
      })
    })
  })

  batch('effects', ({ describe, it, assert, before, after }) => {
    // A runner with only the made-up reflex booster (+1 REA, +1 initiative die) against the same runner without it.
    // This is the test that fixes apply.js effectData for Foundry 13 and 14.
    describe('augmentation bonuses as item effects', function () {
      this.timeout(30000)
      let tag, folder, plain, wired
      before(async function () {
        const s = await loadSample(); tag = s.tag
        folder = await makeFolder()
        const base = { ...s.file.runners[0], picks: [], purchases: s.file.runners[0].purchases.filter(p => p.kind === 'augmentations') }
        assert.lengthOf(base.purchases, 1, 'setup: one ware')
        const a = await importRunner(s.file, { ...base, id: `${tag}wired` }, 'create', folder)
        const b = await importRunner(s.file, { ...base, id: `${tag}plain`, purchases: [] }, 'create', folder)
        assert.equal(a.action, 'create', a.error?.message); assert.equal(b.action, 'create', b.error?.message)
        wired = a.actor; plain = b.actor
      })
      after(() => cleanUp(tag, folder))

      it('the ware carries one transferring effect', () => {
        const ware = itemsOf(wired, 'gear').find(i => i.effects.size)
        assert.ok(ware, 'ware with effect')
        assert.equal(ware.effects.size, 1)
        assert.isTrue(ware.effects.contents[0].transfer)
      })
      it('REA pool is one higher, the base unchanged', () => {
        assert.equal(wired.system.attributes.rea.base, plain.system.attributes.rea.base)
        assert.equal(wired.system.attributes.rea.pool, plain.system.attributes.rea.pool + 1)
      })
      // diceMod is Eden's effect key; Eden adds it to dice into dicePool, which its initiative roll uses.
      it('physical initiative has one more die', () =>
        assert.equal(wired.system.initiative.physical.dicePool, plain.system.initiative.physical.dicePool + 1))
    })
  })

  batch('replace', ({ describe, it, assert, before, after }) => {
    // In order: play state set, then Replace with a newer file.
    describe('Replace keeps play state, art and the GM’s items', function () {
      this.timeout(30000)
      const IMG = 'user/art.webp', TOKEN = 'user/token.webp'
      let tag, folder, file, runner, first, noteId, oldFlagged, unarmedId, a, userFxItem
      before(async function () {
        const s = await loadSample(); tag = s.tag; file = s.file; runner = file.runners[0]
        folder = await makeFolder()
        first = (await importRunner(file, runner, 'create', folder)).actor
        await first.update({ 'system.physical.dmg': 2, 'system.stun.dmg': 1, 'system.edge.value': 1, 'system.heat': 3,
          'system.reputation': 2, img: IMG, 'prototypeToken.texture.src': TOKEN })
        noteId = (await first.createEmbeddedDocuments('Item', [{ name: 'GM note item', type: 'gear', system: { type: 'TOOLS', subtype: 'TOOLS' } }]))[0].id
        oldFlagged = first.items.filter(i => flagOf(i)).map(i => i.id)
        userFxItem = first.items.find(i => flagOf(i) && i.type === 'quality')
        await userFxItem.createEmbeddedDocuments('ActiveEffect', [{ name: 'Quench user effect', transfer: true, disabled: false }])
        unarmedId = first.items.find(edenUnarmed)?.id
        const newer = structuredClone(runner)
        newer.exportedAt = '2026-12-01T12:00:00.000Z'
        newer.karma = 42
        newer.skills = newer.skills.filter(x => x.name !== 'Firearms')
        assert.equal(defaultChoice(flagOf(findExisting(newer.id)), newer), 'replace')
        const res = await importRunner(file, newer, 'replace', folder)
        assert.equal(res.action, 'replace', res.error?.message)
        assert.equal(res.actor.id, first.id)
        a = game.actors.get(first.id)
      })
      after(() => cleanUp(tag, folder))

      it('keeps damage, Edge spent, heat and reputation', () => {
        assert.equal(a.system.physical.dmg, 2); assert.equal(a.system.stun.dmg, 1)
        assert.equal(a.system.edge.value, 1); assert.equal(a.system.heat, 3); assert.equal(a.system.reputation, 2)
      })
      it('keeps the user’s image and token', () => {
        assert.equal(a.img, IMG)
        assert.equal(a.prototypeToken.texture.src, TOKEN)
      })
      it('keeps the GM’s item and updates ours in place (same ids)', () => {
        assert.ok(a.items.get(noteId), 'unflagged item kept')
        const flagged = a.items.filter(i => flagOf(i))
        assert.isNotEmpty(flagged)
        assert.isNotEmpty(flagged.filter(i => oldFlagged.includes(i.id)))
      })
      it('keeps the effect a user added to one of our items; ours are swapped', () => {
        const item = a.items.get(userFxItem.id)
        assert.ok(item, 'same item')
        assert.ok(item.effects.find(e => e.name === 'Quench user effect'), 'user effect kept')
        for (const e of item.effects.filter(e => e.name !== 'Quench user effect')) assert.isTrue(e.flags?.['chummer-sr6-importer']?.chummer, e.name)
      })
      // Eden adds it after create without waiting, so it may not be there yet; never deleted, never twice.
      it('leaves Eden’s own Unarmed item alone', () => {
        assert.isAtMost(a.items.filter(edenUnarmed).length, 1)
        if (unarmedId) assert.ok(a.items.get(unarmedId), 'Eden’s Unarmed kept')
      })
      it('a skill dropped in the file goes to 0; karma updated', () => {
        assert.equal(a.system.skills.firearms.points, 0)
        assert.equal(a.system.karma, 42)
        assert.equal(flagOf(a).exportedAt, '2026-12-01T12:00:00.000Z')
      })
    })
  })

  batch('new version and skip', ({ describe, it, assert, before, after }) => {
    describe('a runner already in the world', function () {
      this.timeout(30000)
      let tag, folder, file, runner, first
      before(async function () {
        const s = await loadSample(); tag = s.tag; file = s.file; runner = file.runners[0]
        folder = await makeFolder()
        first = (await importRunner(file, runner, 'create', folder)).actor
      })
      after(() => cleanUp(tag, folder))

      it('Add as new version makes a second actor named with the date', async () => {
        const res = await importRunner(file, runner, 'new', folder)
        assert.equal(res.action, 'new', res.error?.message)
        assert.notEqual(res.actor.id, first.id)
        assert.equal(res.actor.name, newVersionName(runner.streetName, runner.exportedAt))
      })
      it('Skip changes nothing', async () => {
        const n = game.actors.size
        const res = await importRunner(file, { ...runner, karma: 99 }, 'skip', folder)
        assert.equal(res.action, 'skip')
        assert.equal(game.actors.size, n)
        assert.notEqual(game.actors.get(first.id).system.karma, 99)
      })
      it('an older file defaults to Skip', () =>
        assert.equal(defaultChoice(flagOf(findExisting(runner.id)), { exportedAt: '2026-01-01T00:00:00.000Z' }), 'skip'))
    })
  })

  batch('NPCs', ({ describe, it, assert, before, after }) => {
    // The sample grunt, and made-up critter, spirit and sprite blocks on the same runner shape.
    describe('importing NPCs, critters, spirits and sprites', function () {
      this.timeout(30000)
      let tag, folder, grunt, critter, spirit, sprite
      before(async function () {
        const s = await loadSample(); tag = s.tag
        folder = await makeFolder()
        const g = s.file.runners[1], as = (id, name, npc) => ({ ...structuredClone(g), id: tag + id, streetName: name, npc })
        const runners = [g,
          as('critter', 'Fake Hound', { kind: 'critter', stats: [stat('bod', '5'), stat('agi', '4')],
            lines: [{ part: 'powers', text: 'Made-up Glow, Fake Bite' }], pools: [{ name: 'Close Combat', rating: 4, printed: 'Close Combat 4' }] }),
          as('spirit', 'Spirit of Man', { kind: 'spirit', rating: 4, stats: [stat('bod', 'F', '4')], lines: [{ part: 'powers', text: 'Made-up Glow' }], pools: [] }),
          as('sprite', 'Fault Sprite', { kind: 'sprite', rating: 3, stats: [], lines: [{ part: 'powers', text: 'Made-up Static' }], pools: [] })]
        const res = []
        for (const r of runners) res.push(await importRunner(s.file, r, 'create', folder))
        for (const r of res) assert.equal(r.action, 'create', r.error?.message)
        ;[grunt, critter, spirit, sprite] = res.map(r => r.actor)
      })
      after(() => cleanUp(tag, folder))

      it('a grunt: NPC with its rating and attribute bases', () => {
        assert.equal(grunt.type, 'NPC')
        assert.include(grunt.system, { type: 'npc', rating: 3, gruntmeta: 'Made-up Crew' })
        assert.equal(grunt.system.attributes.bod.base, 4)
        assert.equal(grunt.system.skills.firearms.points, 4)
      })
      it('a critter: Critter with its powers', () => {
        assert.equal(critter.type, 'Critter')
        assert.sameMembers(itemsOf(critter, 'critterpower').map(i => i.name), ['Made-up Glow', 'Fake Bite'])
      })
      it('a spirit: Spirit with its rating and type; Eden derives its attributes', () => {
        assert.equal(spirit.type, 'Spirit')
        assert.include(spirit.system, { rating: 4, spiritType: 'kin' })
        assert.isAbove(spirit.system.attributes.bod.pool, 0)
      })
      it('a sprite: sprite with its type and level', () => {
        assert.equal(sprite.type, 'sprite')
        assert.include(sprite.system, { type: 'fault', level: 3 })
        assert.lengthOf(itemsOf(sprite, 'spritepower'), 1)
      })
      it('GM notes and hostile, unlinked tokens', () => {
        for (const a of [grunt, critter, spirit, sprite]) {
          assert.include(a.system.notes, '<h3>NPC</h3>', a.name)
          assert.include(a.prototypeToken, { actorLink: false, disposition: HOSTILE() }, a.name)
        }
        assert.include(grunt.system.notes, 'Grunt, Professional Rating 3')
      })
    })
  })

  batch('portrait and token', ({ describe, it, assert, before, after }) => {
    // ponytail: the two files stay in worlds/<world>/chummer/portraits|tokens (Foundry has no call to delete an uploaded
    // file); the id is fixed here, so every run overwrites the same two files.
    describe('a runner with its own token image', function () {
      this.timeout(30000)
      const ID = 'quench-sr6-token-test', AT = '2026-10-04T09:00:00.000Z'
      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      const JPG = PNG.replace('image/png', 'image/jpeg')
      let file, runner, folder, a
      before(async function () {
        await cleanUp(ID, null)
        file = (await loadSample()).file
        runner = { ...file.runners[0], id: ID, exportedAt: AT }
        folder = await makeFolder()
        const res = await importRunner(file, runner, 'create', folder, { portrait: PNG, token: JPG })
        assert.equal(res.action, 'create', res.error?.message)
        a = res.actor
      })
      after(() => cleanUp(ID, folder))

      it('two uploaded files: the portrait as img, the token on its prototype token', () => {
        assert.match(a.img, /chummer\/portraits\/quench-sr6-token-test-\d+\.png$/)
        assert.match(a.prototypeToken.texture.src, /chummer\/tokens\/quench-sr6-token-test-\d+\.jpg$/)
        assert.notEqual(a.img, a.prototypeToken.texture.src)
      })
      it('Replace keeps a token image the GM chose', async () => {
        await a.update({ 'prototypeToken.texture.src': 'icons/environment/people/commoner.webp' })
        const res = await importRunner(file, { ...runner, exportedAt: '2026-12-01T12:00:00.000Z' }, 'replace', folder, { portrait: PNG, token: JPG })
        assert.equal(res.action, 'replace', res.error?.message)
        assert.equal(game.actors.get(a.id).prototypeToken.texture.src, 'icons/environment/people/commoner.webp')
      })
    })
  })

  batch('books', ({ describe, it, assert, before, after }) => {
    // Imports the made-up book file as the window does, into packs named sr6test-… in the Compendium folder
    // "Chummer SR6 Importer tests". before() and after() both clean up (cleanBooks), so a crashed run leaves nothing behind.
    describe('importing the book sample', function () {
      this.timeout(60000)
      const clean = foundry.utils.cleanHTML ?? (h => h)
      let file, mus, mux, res, muxRes, plan
      const pack = (k, book = 'mus') => game.packs.get(`world.${PREFIX}sr6-${book}-${k}`)
      const translate = book => translateBook(book, { exportedAt: book.exportedAt ?? file.exportedAt,
        appVersion: file.app?.version ?? '', descriptions: file.descriptions === true, sanitize: s => clean(escapeText(s)) })
      const run = book => importBook(translate(book), { prefix: PREFIX, topFolder: TEST_FOLDER })
      // Every world pack named sr6test-… (only these tests make them), the sample books' folders inside the top-level
      // Compendium folder "Chummer SR6 Importer tests", then that folder.
      const cleanBooks = async () => {
        for (const p of game.packs.filter(p => p.collection.startsWith(`world.${PREFIX}`))) await p.deleteCompendium()
        const top = game.folders.find(f => f.type === 'Compendium' && f.name === TEST_FOLDER && !f.folder)
        if (!top) return
        const names = new Set(file.books.map(b => `${b.source.name} (${b.source.id})`))
        for (const f of game.folders.filter(f => f.type === 'Compendium' && f.folder?.id === top.id && names.has(f.name))) await f.delete()
        await top.delete()
      }
      before(async function () {
        const r = readExport(await (await fetch(BOOKS)).text())
        if (!r.ok) throw new Error(r.reason)
        file = r.file; [mus, mux] = file.books
        await cleanBooks()
        plan = planBookPacks(translate(mus), PREFIX)
        res = await run(mus)
        muxRes = await run(mux)
      })
      after(async function () { if (file) await cleanBooks() })

      it('imports every pack without a failure', () => {
        for (const r of [res, muxRes]) assert.isEmpty(r.failed, r.failed.map(f => f.error?.message).join('; '))
      })
      it('puts one pack per planned topic in "<test folder>/Made-Up Streets (MUS)", entry counts as planned', () => {
        assert.sameMembers(Object.keys(res.counts), plan.map(p => p.name))
        for (const p of plan) {
          const c = game.packs.get(`world.${p.name}`)
          assert.ok(c, p.name)
          assert.equal(c.title, p.label)
          assert.equal(c.documentName, p.type, p.name)
          assert.equal(c.folder?.name, 'Made-Up Streets (MUS)', p.name)
          assert.equal(c.folder?.folder?.name, TEST_FOLDER, p.name)
          assert.equal(c.index.size, p.docs.length, p.name)
        }
      })
      it('a book of only kinds Eden has no document for gets just its Reference compendium', () => {
        assert.sameMembers(game.packs.filter(p => p.collection.startsWith(`world.${PREFIX}sr6-mux-`)).map(p => p.collection),
          [`world.${PREFIX}sr6-mux-reference`])
      })
      it('a weapon is gear with its Eden weapon type, flags and page', async () => {
        const zap = await byKey(pack('weapons'), 'MUS:weapons:mus.pocket-zapper')
        assert.equal(zap.type, 'gear')
        assert.match(zap.system.type, /^WEAPON/)
        assert.include(flagOf(zap), { id: 'mus.pocket-zapper', source: 'MUS', page: 10, canon: true, exportedAt: file.exportedAt })
      })
      it('a spirit is a Spirit actor with its spiritType; Eden derives its attributes', async () => {
        const spirit = await byKey(pack('spirits'), 'MUS:spirits:mus.spirit-of-man')
        assert.equal(spirit.type, 'Spirit')
        assert.ok(spirit.system.spiritType)
        assert.isAbove(spirit.system.attributes.bod.pool, 0)
        assert.include(spirit.prototypeToken, { actorLink: false, disposition: HOSTILE() })
      })
      it('a rules journal per chapter, pages in order at their levels', async () => {
        const [j] = await pack('rules').getDocuments()
        assert.equal(j.name, 'Made-up Rules')
        assert.deepEqual(j.pages.contents.sort((a, b) => a.sort - b.sort).map(p => [p.title.level, p.name]),
          [[1, 'Made-up Basics'], [2, 'Made-up Detail']])
      })
      it('a program is Eden software that keeps its type and price through Eden’s data model', async () => {
        const p = await byKey(pack('programs'), 'MUS:programs:mus.made-up-sniffer')
        assert.equal(p.type, 'software')
        assert.include(p.system, { type: 'HACKING', price: 250, availDef: '4(I)', page: 10 })
      })
      it('a martial art style and its signature technique: Eden types, category flags, the technique tied to the style', async () => {
        const style = await byKey(pack('martialarts'), 'MUS:martialarts:mus.made-up-fist')
        const tech = await byKey(pack('martialtechniques'), 'MUS:martialtechniques:mus.made-up-sweep')
        assert.equal(style.type, 'martialartstyle')
        assert.include(style.system.category, { striking: true, grappling: true, weapon: false })
        assert.equal(tech.type, 'martialarttech')
        assert.equal(tech.system.style, style.system.genesisID)
      })
      it('a style and technique dropped on an actor show together (Eden links them by genesisID)', async () => {
        const style = await byKey(pack('martialarts'), 'MUS:martialarts:mus.made-up-fist')
        const tech = await byKey(pack('martialtechniques'), 'MUS:martialtechniques:mus.made-up-sweep')
        const a = await Actor.create({ name: 'Quench martial artist', type: 'Player' })
        try {
          await a.createEmbeddedDocuments('Item', [style.toObject(), tech.toObject()])
          const s = a.items.find(i => i.type === 'martialartstyle'), t = a.items.find(i => i.type === 'martialarttech')
          assert.equal(t.system.style, s.system.genesisID)
        } finally { await a.delete() }
      })
      it('kinds Eden has no document for are Reference journals, a page per entry (a tradition, a grade, an action)', async () => {
        const journals = await pack('reference').getDocuments()
        const trad = journals.find(j => j.name === 'Traditions')
        assert.lengthOf(trad.pages.contents, 1)
        assert.include(trad.pages.contents[0].text.content, 'invented tradition')
        assert.equal(trad.pages.contents[0].flags['chummer-sr6-importer'].chummerID, 'MUS:traditions:mus.made-up-path')
        assert.includeMembers(journals.map(j => j.name), ['Augmentation grades', 'Actions', 'Mentor spirits', 'Metatypes'])
      })
      it('re-import updates in place by chummerID (same _id, nothing new), keeps a user image, a GM entry and a GM page, and locks a locked pack again', async () => {
        const weapons = pack('weapons'), before = await byKey(weapons, 'MUS:weapons:mus.pocket-zapper'), id = before.id, size = weapons.index.size
        await Item.updateDocuments([{ _id: id, img: 'user/art.webp' }], { pack: weapons.collection })
        const gm = await Item.create({ name: 'GM-made weapon', type: 'gear', system: { type: 'WEAPON_FIREARMS' } }, { pack: weapons.collection })
        const [j] = await pack('rules').getDocuments()
        const gmPage = (await j.createEmbeddedDocuments('JournalEntryPage', [{ name: 'GM page', type: 'text', text: { content: '<p>mine</p>' } }]))[0]
        const ourPage = j.pages.contents.find(p => p.flags?.['chummer-sr6-importer']?.chummerID)
        await weapons.configure({ locked: true })
        const changed = structuredClone(mus)
        changed.entries.find(e => e.id === 'mus.pocket-zapper').name = 'Pocket Zapper II'
        const again = await run(changed)
        assert.isEmpty(again.failed, again.failed.map(f => f.error?.message).join('; '))
        assert.equal(again.counts[`${PREFIX}sr6-mus-weapons`].replaced, plan.find(p => p.key === 'weapons').docs.length)
        assert.equal(again.counts[`${PREFIX}sr6-mus-weapons`].created, 0)
        assert.equal(weapons.index.size, size + 1, 'only the GM entry is new')
        const zap = await weapons.getDocument(id)
        assert.equal(zap.name, 'Pocket Zapper II')
        assert.equal(zap.img, 'user/art.webp')
        assert.ok(await weapons.getDocument(gm.id), 'GM entry kept')
        assert.isTrue(weapons.locked, 'locked again')
        const j2 = await pack('rules').getDocument(j.id)
        assert.equal(j2.pages.get(gmPage.id)?.text.content, '<p>mine</p>', 'GM page kept')
        assert.ok(j2.pages.get(ourPage.id), 'an imported page keeps its _id')
        await weapons.configure({ locked: false })
      })
      it('migration: an entry 0.2.x wrote under its computed id, without chummerID, is updated in place and gets chummerID', async () => {
        const { legacyId } = await import('../lib/chummer-id.js')
        const weapons = pack('weapons'), key = 'MUS:weapons:mus.odd-blade', old = await byKey(weapons, key)
        if (old) await Item.deleteDocuments([old.id], { pack: weapons.collection })
        const data = old.toObject()
        delete data.flags['chummer-sr6-importer'].chummerID
        data._id = legacyId(key)
        await Item.createDocuments([data], { pack: weapons.collection, keepId: true })
        const again = await run(structuredClone(mus))
        assert.isEmpty(again.failed, again.failed.map(f => f.error?.message).join('; '))
        assert.isAtLeast(again.counts[`${PREFIX}sr6-mus-weapons`].migrated, 1)
        const doc = await weapons.getDocument(legacyId(key))
        assert.equal(doc.flags['chummer-sr6-importer'].chummerID, key)
        assert.lengthOf((await weapons.getIndex({ fields: INDEX_FIELDS })).filter(i => i.flags?.['chummer-sr6-importer']?.chummerID === key), 1)
      })
    })
  })

  batch('compendium', ({ describe, it, assert, before, after }) => {
    // Imports the made-up compendium file as the window does (no topFolder: a compendium goes to the Compendium folder
    // "Chummer SR6 compendiums"), into packs named sr6test-sr6-street-…. Cleanup deletes those packs, the book folder, and
    // "Chummer SR6 compendiums" only when this batch made it and it is left empty.
    // ponytail: the NPC's token file stays in worlds/<world>/chummer/tokens (no delete call); its name is fixed, so
    // every run overwrites it.
    describe('importing the compendium sample', function () {
      this.timeout(60000)
      const clean = foundry.utils.cleanHTML ?? (h => h)
      let file, street, res, hadTop
      const pack = k => game.packs.get(`world.${PREFIX}sr6-street-${k}`)
      const top = () => game.folders.find(f => f.type === 'Compendium' && f.name === COMPENDIUM_FOLDER && !f.folder)
      const bookFolder = () => game.folders.find(f => f.type === 'Compendium' && f.name === 'Street Kit (STREET)' && f.folder?.id === top()?.id)
      const cleanUpHouse = async () => {
        for (const p of game.packs.filter(p => p.collection.startsWith(`world.${PREFIX}sr6-street-`))) await p.deleteCompendium()
        await bookFolder()?.delete()
        const t = top()
        if (t && !hadTop && !t.getSubfolders().length && !game.packs.some(p => p.folder?.id === t.id)) await t.delete()
      }
      before(async function () {
        const r = readExport(await (await fetch(COMPENDIUM)).text())
        if (!r.ok) throw new Error(r.reason)
        file = r.file; [street] = file.books
        hadTop = !!top()
        await cleanUpHouse()
        res = await importBook(translateBook(street, { exportedAt: file.exportedAt, appVersion: file.app?.version ?? '',
          descriptions: file.descriptions === true, sanitize: s => clean(escapeText(s)) }), { prefix: PREFIX })
      })
      after(async function () { if (file) await cleanUpHouse() })

      it('imports every pack into "Chummer SR6 compendiums/Street Kit (STREET)", labelled (House)', () => {
        assert.isEmpty(res.failed, res.failed.map(f => f.error?.message).join('; '))
        for (const k of ['weapons', 'npcs', 'spirits']) {
          const p = pack(k)
          assert.ok(p, `pack ${k}`)
          assert.equal(p.folder?.name, 'Street Kit (STREET)', k)
          assert.equal(p.folder?.folder?.name, COMPENDIUM_FOLDER, k)
          assert.match(p.title, / — STREET \(House\)$/, k)
        }
      })
      it('its NPC is in the NPCs pack, flagged compendium, with its token uploaded', async () => {
        const tough = await byKey(pack('npcs'), 'STREET:npc:street-npc-1')
        assert.ok(tough, 'NPC')
        assert.equal(tough.type, 'NPC')
        assert.include(flagOf(tough), { source: 'STREET', canon: false, compendium: true })
        assert.match(tough.prototypeToken.texture.src, /chummer\/tokens\/STREET-street-npc-1-\d+\.jpg$/)
        assert.include(tough.prototypeToken, { actorLink: false, disposition: HOSTILE() })
      })
      it('a compendium NPC is never offered for Replace by a runners file', async () => {
        const data = (await byKey(pack('npcs'), 'STREET:npc:street-npc-1')).toObject()
        delete data._id
        const copy = await Actor.create(data)
        try { assert.isNull(findExisting('street-npc-1')) } finally { await copy.delete() }
      })
    })
  })

  batch('icons', ({ describe, it, assert, before, after }) => {
    // Imports the sample runner with the shipped icon index into this batch's own Actors folder, then runs Apply icons
    // over that runner only (never the rest of the world); after() deletes it.
    describe('icons on import and Apply icons', function () {
      this.timeout(30000)
      let tag, folder, index, a
      before(async function () {
        index = await loadIconIndex()
        assert.isArray(index, 'icons/index.json')
        const s = await loadSample(); tag = s.tag
        folder = await makeFolder()
        const r = s.file.runners[0], exportedAt = r.exportedAt ?? s.file.exportedAt
        const t = translateRunner(r, { exportedAt, appVersion: '', sanitize: escapeText, icons: index, specs: edenSpecLabels() })
        const res = await applyRunner(t, 'create', { exportedAt, folder })
        assert.equal(res.action, 'create', res.error?.message)
        a = res.actor
      })
      after(() => cleanUp(tag, folder))

      it('imported items get the module icon for their key', () => {
        const i = a.items.find(i => flagOf(i)?.icon)
        assert.equal(i.img, iconFor(flagOf(i).icon.key, i.name, flagOf(i).icon.book, index))
        assert.isTrue(i.img.startsWith(MODULE_ICON_ROOT))
      })
      it('Apply icons replaces a stock Eden image, keeps user/art.webp, and leaves the actor alone', async () => {
        const [stock, mine] = a.items.filter(i => flagOf(i)?.icon)
        const actorImg = a.img
        await a.updateEmbeddedDocuments('Item', [{ _id: stock.id, img: 'systems/shadowrun6-eden/icons/x.svg' }, { _id: mine.id, img: 'user/art.webp' }])
        const counts = await applyIcons({ index, items: [], actors: [a], packs: [] })
        assert.include(counts, { updated: 1, kept: 1 })
        const f = flagOf(stock).icon, now = game.actors.get(a.id)
        assert.equal(now.items.get(stock.id).img, iconFor(f.key, f.name, f.book, index))
        assert.equal(now.items.get(mine.id).img, 'user/art.webp')
        assert.equal(now.img, actorImg)
      })
    })
  })
}

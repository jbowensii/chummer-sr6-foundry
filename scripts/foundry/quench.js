// In-Foundry tests (Quench, https://github.com/Ethaks/FVTT-Quench). Registered from main.js on 'quenchReady'.
// They drive the window's own code paths: readExport -> findExisting/defaultChoice -> translateRunner -> applyRunner.
// Each batch makes its own Actors folder "Chummer SR6 Importer tests" and fresh ids (quench-<random>-…); after() deletes exactly those.
import { MODULE_ID } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, translateRunner } from '../lib/translate.js'
import { defaultChoice, newVersionName } from '../lib/plan.js'
import { applyRunner, edenSpecLabels, findExisting } from './apply.js'

const TEST_FOLDER = 'Chummer SR6 Importer tests'
const SAMPLE = `modules/${MODULE_ID}/samples/test-runners.json`
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
const itemsOf = (actor, type) => actor.items.filter(i => i.type === type)
const byName = (actor, name) => actor.items.find(i => i.name === name)
const count = docs => docs.reduce((c, d) => ({ ...c, [d.type]: (c[d.type] ?? 0) + 1 }), {})
// A made-up NPC block for the batch's critter, spirit and sprite (the shapes of the export's npc).
const stat = (key, printed, value = printed) => ({ key, label: key.toUpperCase(), printed, value, ok: true })

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
      it('has every item, per type', () => assert.deepEqual(count(mara.items.contents), count(t.items)))
      it('keeps the genesisID of knowledge and language skills only', () => {
        assert.sameMembers(itemsOf(mara, 'skill').map(i => i.system.genesisID), ['knowledge', 'language', 'language'])
        for (const i of mara.items.filter(i => i.type !== 'skill')) assert.equal(i.system.genesisID ?? '', '', i.name)
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
      it('physical initiative has one more die', () =>
        assert.equal(wired.system.initiative.physical.dice, plain.system.initiative.physical.dice + 1))
    })
  })

  batch('replace', ({ describe, it, assert, before, after }) => {
    // In order: play state set, then Replace with a newer file.
    describe('Replace keeps play state, art and the GM’s items', function () {
      this.timeout(30000)
      const IMG = 'user/art.webp', TOKEN = 'user/token.webp'
      let tag, folder, file, runner, first, noteId, oldFlagged, a
      before(async function () {
        const s = await loadSample(); tag = s.tag; file = s.file; runner = file.runners[0]
        folder = await makeFolder()
        first = (await importRunner(file, runner, 'create', folder)).actor
        await first.update({ 'system.physical.dmg': 2, 'system.stun.dmg': 1, 'system.edge.value': 1, 'system.heat': 3,
          'system.reputation': 2, img: IMG, 'prototypeToken.texture.src': TOKEN })
        noteId = (await first.createEmbeddedDocuments('Item', [{ name: 'GM note item', type: 'gear', system: { type: 'TOOLS', subtype: 'TOOLS' } }]))[0].id
        oldFlagged = first.items.filter(i => flagOf(i)).map(i => i.id)
        const newer = structuredClone(runner)
        newer.exportedAt = '2026-12-01T12:00:00.000Z'
        newer.karma = 42
        newer.skills = newer.skills.filter(x => x.id !== 'firearms')
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
      it('keeps the GM’s item and rebuilds the flagged ones', () => {
        assert.ok(a.items.get(noteId), 'unflagged item kept')
        const flagged = a.items.filter(i => flagOf(i))
        assert.isNotEmpty(flagged)
        assert.isEmpty(flagged.filter(i => oldFlagged.includes(i.id)))
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
}

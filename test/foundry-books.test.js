// importBook (scripts/foundry/books.js) and applyIcons (scripts/foundry/icons.js) against a tiny fake of the Foundry
// globals they use. The real thing runs in Foundry's Quench batches (scripts/foundry/quench.js: books, compendium, icons).
import { readFileSync } from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { planBookPacks, translateBook } from '../scripts/lib/books.js'
import { importBook } from '../scripts/foundry/books.js'
import { applyIcons } from '../scripts/foundry/icons.js'

const file = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
const index = JSON.parse(readFileSync('icons/index.json', 'utf8'))
const [mus, mux] = file.books
const tr = book => translateBook(book, { exportedAt: file.exportedAt, appVersion: '0.9.0', descriptions: true })
let packs, folders, n, failCreate, log

class FakePack {
  constructor(name, label, type) {
    Object.assign(this, { collection: `world.${name}`, title: label, documentName: type, locked: false, folder: null, docs: new Map() })
    packs.set(this.collection, this)
  }
  get index() { return this.docs }
  get documentClass() { return Doc }
  async configure({ locked }) { log.push(['lock', this.collection, locked]); this.locked = locked }
  async setFolder(f) { this.folder = f }
  async deleteCompendium() { log.push(['dropPack', this.collection]); packs.delete(this.collection) }
  async getDocuments(q = {}) {
    return [...this.docs.values()].filter(d => !q._id__in || q._id__in.includes(d._id)).map(d => ({ ...d, toObject: () => structuredClone(d) }))
  }
}
const packOf = op => {
  const p = packs.get(op.pack)
  if (p.locked) throw new Error('locked')
  return p
}
const Doc = {
  async createDocuments(docs, op) {
    const p = packOf(op)
    if (failCreate === p.collection) throw new Error('write failed')
    for (const d of docs) p.docs.set(d._id, structuredClone(d))
    return docs.map(d => ({ id: d._id }))
  },
  async deleteDocuments(ids, op) { const p = packOf(op); for (const id of ids) p.docs.delete(id) },
  async updateDocuments(ups, op) { const p = packOf(op); for (const u of ups) Object.assign(p.docs.get(u._id), u) },
}

beforeEach(() => {
  packs = new Map(), folders = [], n = 0, failCreate = null, log = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const all = () => [...packs.values()]
  globalThis.game = {
    packs: { get: id => packs.get(id), filter: f => all().filter(f), some: f => all().some(f) },
    folders, i18n: { format: (k, d) => `${k} ${JSON.stringify(d)}`, localize: k => k }, release: { generation: 14 },
  }
  globalThis.Folder = { create: async d => {
    const f = { id: `f${++n}`, name: d.name, type: d.type, folder: folders.find(x => x.id === d.folder) ?? null,
      getSubfolders: () => folders.filter(x => x.folder === f), delete: async () => folders.splice(folders.indexOf(f), 1) }
    folders.push(f)
    return f
  } }
  globalThis.foundry = { documents: { collections: { CompendiumCollection: { createCompendium: async ({ name, label, type }) => new FakePack(name, label, type) } } } }
  globalThis.Item = Doc; globalThis.Actor = Doc; globalThis.JournalEntry = Doc
})

test('a book of only unused kinds makes no pack and no folder', async () => {
  const res = await importBook(tr(mux))
  expect(res).toMatchObject({ counts: {}, failed: [] })
  expect(packs.size).toBe(0)
  expect(folders).toEqual([])
})

test('one pack per planned topic in "Chummer SR6/<name> (<id>)", every entry written', async () => {
  const t = tr(mus), res = await importBook(t)
  expect(res.failed).toEqual([])
  for (const p of planBookPacks(t)) {
    const pack = packs.get(`world.${p.name}`)
    expect(pack.docs.size, p.name).toBe(p.docs.length)
    expect([pack.folder.name, pack.folder.folder.name]).toEqual(['Made-Up Streets (MUS)', 'Chummer SR6'])
    expect(res.counts[p.name]).toMatchObject({ label: p.label, created: p.docs.length, replaced: 0 })
  }
})

test('a GM compendium goes to "Chummer SR6 compendiums"', async () => {
  await importBook(tr({ ...mus, source: { ...mus.source, compendium: true } }))
  expect(folders.find(f => !f.folder).name).toBe('Chummer SR6 compendiums')
})

test('re-import replaces by id, keeps a user image, a GM entry and a GM page, and locks a locked pack again', async () => {
  await importBook(tr(mus))
  const weapons = packs.get('world.sr6-mus-weapons'), rules = packs.get('world.sr6-mus-rules')
  const [zapId] = weapons.docs.keys()
  weapons.docs.get(zapId).img = 'user/art.webp'
  weapons.docs.set('gm', { _id: 'gm', name: 'GM-made weapon' })
  const [j] = rules.docs.values()
  j.pages.push({ _id: 'gmpage', name: 'GM page' })
  weapons.locked = true
  const res = await importBook(tr(mus))
  expect(res.failed).toEqual([])
  expect(res.counts['sr6-mus-weapons']).toMatchObject({ created: 0, replaced: 2 })
  expect(weapons.docs.get(zapId).img).toBe('user/art.webp')
  expect(weapons.docs.has('gm')).toBe(true)
  expect(weapons.locked).toBe(true)
  expect(log.filter(l => l[0] === 'lock')).toEqual([['lock', 'world.sr6-mus-weapons', false], ['lock', 'world.sr6-mus-weapons', true]])
  expect([...rules.docs.values()][0].pages.map(p => p.name)).toEqual(['Made-up Basics', 'Made-up Detail', 'GM page'])
})

test('a pack this run created is deleted when its write fails; the other packs carry on', async () => {
  failCreate = 'world.sr6-mus-weapons'
  const res = await importBook(tr(mus))
  expect(res.failed.map(f => f.pack)).toEqual(['sr6-mus-weapons'])
  expect(packs.has('world.sr6-mus-weapons')).toBe(false)
  expect(packs.has('world.sr6-mus-armor')).toBe(true)
})

test('nothing written: the folders this run made are deleted again', async () => {
  const only = { ...mus, entries: mus.entries.filter(e => e.kind === 'weapons') }
  failCreate = 'world.sr6-mus-weapons'
  const res = await importBook(tr(only))
  expect(res.failed).toHaveLength(1)
  expect(folders).toEqual([])
})

test('Apply icons: a stock Eden image is replaced, a chosen one kept, the actor itself never touched', async () => {
  const icon = { key: 'armor', name: 'Test Jacket', book: 'MUS' }
  const items = [{ id: 'a', img: 'systems/shadowrun6-eden/icons/x.svg', flags: { [MODULE_ID]: { icon } } },
    { id: 'b', img: 'user/art.webp', flags: { [MODULE_ID]: { icon } } },
    { id: 'c', img: 'modules/chummer-sr6-importer/icons/defaults/armor.webp', flags: { [MODULE_ID]: { icon } } },
    { id: 'd', img: 'user/x.webp', flags: {} }]
  const ups = []
  const actor = { img: 'icons/svg/mystery-man.svg', flags: { [MODULE_ID]: { icon } }, items, updateEmbeddedDocuments: async (_, u) => ups.push(...u) }
  const counts = await applyIcons({ index, items: [], actors: [actor], packs: [] })
  expect(counts).toEqual({ updated: 1, kept: 1, unchanged: 1 })
  expect(ups).toEqual([{ _id: 'a', img: 'modules/chummer-sr6-importer/icons/defaults/armor.webp' }])
})

test('a pack item’s effects go in in Foundry 14’s shape (system.changes)', async () => {
  await importBook(tr(mus))
  const q = [...packs.get('world.sr6-mus-qualities').docs.values()].find(d => d.name === 'Lucky Break')
  expect(q.effects[0]).toMatchObject({ name: 'Lucky Break', transfer: true, disabled: false,
    system: { changes: [{ key: 'system.attributes.agi.mod', type: 'add', value: '1' }, { key: 'system.defenserating.physical.mod', type: 'add', value: '1' }] } })
  expect(q.effects[0]).not.toHaveProperty('changes')
})

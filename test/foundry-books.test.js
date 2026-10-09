// importBooks (scripts/foundry/books.js) and applyIcons (scripts/foundry/icons.js) against a tiny fake of the Foundry
// globals they use. The real thing runs in Foundry's Quench batches (scripts/foundry/quench.js: books, compendium, icons).
import { readFileSync } from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { planTypePacks, translateBook } from '../scripts/lib/books.js'
import { importBooks } from '../scripts/foundry/books.js'
import { applyIcons } from '../scripts/foundry/icons.js'

const file = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
const comp = JSON.parse(readFileSync('samples/test-compendium.json', 'utf8'))
const index = JSON.parse(readFileSync('icons/index.json', 'utf8'))
const [mus, mux] = file.books
const tr = book => translateBook(book, { exportedAt: file.exportedAt, appVersion: '0.9.0', descriptions: true })
// the sample book again as another book (MUZ): the same entries under its own source
const muz = { ...mus, source: { ...mus.source, id: 'MUZ', name: 'Made-Up Zones' }, entries: mus.entries.map(e => ({ ...e, source: 'MUZ' })) }
const cid = d => d.flags?.[MODULE_ID]?.chummerID
let packs, folders, n, failCreate, log

class FakePack {
  constructor(name, label, type) {
    Object.assign(this, { collection: `world.${name}`, title: label, documentName: type, locked: false, folder: null, docs: new Map(), folders: [] })
    packs.set(this.collection, this)
  }
  async getIndex() { return this.docs }
  get documentClass() { return Doc }
  async configure({ locked }) { log.push(['lock', this.collection, locked]); this.locked = locked }
  async setFolder(f) { this.folder = f }
  async deleteCompendium() { log.push(['dropPack', this.collection]); packs.delete(this.collection) }
  async getDocuments(q = {}) {
    return [...this.docs.values()].filter(d => !q._id__in || q._id__in.includes(d._id)).map(d => ({ ...d, toObject: () => structuredClone(d) }))
  }
  byKey(key) { return [...this.docs.values()].find(d => cid(d) === key) }
  folderOf(d) { return this.folders.find(f => f.id === d.folder)?.name ?? null }
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
    log.push(['create', p.collection, op.keepId ?? false, docs.some(d => '_id' in d), docs.length])
    // the server's id, as Foundry picks one (no keepId)
    const made = docs.map(d => ({ ...structuredClone(d), _id: `id${++n}` }))
    for (const d of made) p.docs.set(d._id, d)
    return made.map(d => ({ id: d._id }))
  },
  async deleteDocuments(ids, op) { const p = packOf(op); for (const id of ids) p.docs.delete(id) },
  // recursive: false, as writePack asks: each key given replaces the old value
  async updateDocuments(ups, op) {
    const p = packOf(op)
    log.push(['update', p.collection, op.recursive, op.diff, ups.length])
    for (const u of ups) Object.assign(p.docs.get(u._id), structuredClone(u))
  },
}
const all = () => [...packs.values()]
const got = name => packs.get(`world.${name}`)

beforeEach(() => {
  packs = new Map(), folders = [], n = 0, failCreate = null, log = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  globalThis.game = {
    packs: { get: id => packs.get(id), filter: f => all().filter(f), some: f => all().some(f) },
    folders, i18n: { format: (k, d) => `${k} ${JSON.stringify(d)}`, localize: k => k }, release: { generation: 14 },
  }
  globalThis.Folder = {
    // the Compendium sidebar's folders
    create: async d => {
      const f = { id: `f${++n}`, name: d.name, type: d.type, folder: folders.find(x => x.id === d.folder) ?? null,
        getSubfolders: () => folders.filter(x => x.folder === f), delete: async () => folders.splice(folders.indexOf(f), 1) }
      folders.push(f)
      return f
    },
    // folders inside a pack
    createDocuments: async (data, op) => {
      const p = packOf(op), made = data.map(d => ({ ...d, id: `pf${++n}`, folder: null }))
      log.push(['folders', p.collection, data.map(d => d.name)])
      p.folders.push(...made)
      return made
    },
    deleteDocuments: async (ids, op) => { const p = packOf(op); p.folders = p.folders.filter(f => !ids.includes(f.id)) },
  }
  globalThis.foundry = { documents: { collections: { CompendiumCollection: { createCompendium: async ({ name, label, type }) => new FakePack(name, label, type) } } } }
  globalThis.Item = Doc; globalThis.Actor = Doc; globalThis.JournalEntry = Doc; globalThis.CONFIG = {}
})

test('a book of only kinds Eden has no document for: just the Reference compendium', async () => {
  const res = await importBooks([tr(mux)])
  expect(res.failed).toEqual([])
  expect([...packs.keys()]).toEqual(['world.chummer-sr6-reference'])
  expect([...got('chummer-sr6-reference').docs.values()].map(j => j.name)).toEqual(['Priorities', 'Metatypes'])
})

test('nothing at all in a book: no pack and no folder', async () => {
  const res = await importBooks([tr({ ...mux, entries: [] })])
  expect(res).toMatchObject({ counts: {}, failed: [] })
  expect(packs.size).toBe(0)
  expect(folders).toEqual([])
})

test('one pack per type in the Compendium folder "Chummer SR6", every entry in its category folder, counts per book', async () => {
  const t = tr(mus), res = await importBooks([t])
  expect(res.failed).toEqual([])
  for (const p of planTypePacks([t])) {
    const pack = got(p.name)
    expect(pack.docs.size, p.name).toBe(p.docs.length)
    expect([pack.title, pack.folder.name, pack.folder.folder]).toEqual([p.label, 'Chummer SR6', null])
    expect(res.counts[pack.collection]).toMatchObject({ label: p.label, created: p.docs.length, replaced: 0, books: { MUS: { created: p.docs.length, replaced: 0 } } })
    for (const d of pack.docs.values()) expect(pack.folderOf(d), d.name).toBe(d.flags[MODULE_ID].category)
  }
  expect(got('chummer-sr6-weapons').folders.map(f => [f.name, f.type, f.sorting])).toEqual([['Pocket Tasers', 'Item', 'a'], ['Glitter cannons', 'Item', 'a']])
  expect(got('chummer-sr6-martialarts').folders.map(f => f.name)).toEqual(['Styles', 'Striking techniques'])
  expect(folders.map(f => f.name)).toEqual(['Chummer SR6'])  // no per-book folder any more
})

test('two books merge into one pack per type, the category folders shared; the report counts each book', async () => {
  const res = await importBooks([tr(mus), tr(muz)])
  const weapons = got('chummer-sr6-weapons')
  expect([...weapons.docs.values()].map(cid)).toEqual(['MUS:weapons:mus.pocket-zapper', 'MUS:weapons:mus.glitter-cannon',
    'MUZ:weapons:mus.pocket-zapper', 'MUZ:weapons:mus.glitter-cannon'])
  expect(weapons.folders.map(f => f.name)).toEqual(['Pocket Tasers', 'Glitter cannons'])
  expect(res.counts['world.chummer-sr6-weapons'].books).toEqual({ MUS: { created: 2, replaced: 0 }, MUZ: { created: 2, replaced: 0 } })
  expect(packs.has('world.sr6-mus-weapons')).toBe(false)
})

test('a GM compendium: its own pack per type in "Chummer SR6 compendiums/<name> (<id>)"', async () => {
  const res = await importBooks([tr(comp.books[0])])
  expect(res.failed).toEqual([])
  expect([...packs.keys()]).toEqual(['world.chummer-sr6-c-street-weapons', 'world.chummer-sr6-c-street-npcs', 'world.chummer-sr6-c-street-spirits'])
  const p = got('chummer-sr6-c-street-weapons')
  expect([p.title, p.folder.name, p.folder.folder.name]).toEqual(['Weapons — STREET (House)', 'Street Kit (STREET)', 'Chummer SR6 compendiums'])
  expect(p.folders.map(f => f.name)).toEqual(['Zappers'])
})

test('Foundry picks every id: no _id and no keepId in any create', async () => {
  await importBooks([tr(mus)])
  const creates = log.filter(l => l[0] === 'create')
  expect(creates.length).toBeGreaterThan(5)
  for (const [, pack, keepId, hadId] of creates) expect([pack, keepId, hadId]).toEqual([pack, false, false])
})

test('re-import of one book: its entries updated in place (same _id, user image, GM entry and page kept, folders reused, a locked pack locked again); the other book’s left alone', async () => {
  await importBooks([tr(mus), tr(muz)])
  const weapons = got('chummer-sr6-weapons'), rules = got('chummer-sr6-rules')
  const zap = weapons.byKey('MUS:weapons:mus.pocket-zapper'), other = structuredClone(weapons.byKey('MUZ:weapons:mus.pocket-zapper'))
  zap.img = 'user/art.webp'
  weapons.docs.set('gm', { _id: 'gm', name: 'GM-made weapon' })
  const j = [...rules.docs.values()].find(d => d.flags[MODULE_ID].source === 'MUS')
  j.pages.push({ _id: 'gmpage', name: 'GM page' })
  weapons.locked = true
  const changed = structuredClone(mus)
  changed.entries.find(e => e.id === 'mus.pocket-zapper').name = 'Pocket Zapper II'
  log = []
  const res = await importBooks([tr(changed)])
  expect(res.failed).toEqual([])
  expect(res.counts['world.chummer-sr6-weapons']).toMatchObject({ created: 0, replaced: 2, books: { MUS: { created: 0, replaced: 2 } } })
  expect(weapons.docs.size).toBe(5)  // two books' two entries each, and the GM's
  expect(weapons.docs.get(zap._id)).toMatchObject({ name: 'Pocket Zapper II', img: 'user/art.webp' })
  expect(weapons.byKey('MUZ:weapons:mus.pocket-zapper')).toEqual(other)
  expect(weapons.docs.has('gm')).toBe(true)
  expect(weapons.locked).toBe(true)
  expect(log.filter(l => l[0] === 'lock')).toEqual([['lock', 'world.chummer-sr6-weapons', false], ['lock', 'world.chummer-sr6-weapons', true]])
  expect(log.filter(l => l[0] === 'folders' || l[0] === 'create')).toEqual([])  // nothing new: no entry, no folder
  expect(rules.docs.get(j._id).pages.map(p => p.name)).toEqual(['Made-up Basics', 'Made-up Detail', 'GM page'])
})

test('an entry already in another type pack is updated where it is, never copied into its new one', async () => {
  const gear = new FakePack('chummer-sr6-gear', 'Gear', 'Item')
  gear.docs.set('G1', { _id: 'G1', name: 'Made-up Spoiler', folder: 'mine', flags: { [MODULE_ID]: { chummerID: 'MUS:gear:mus.made-up-spoiler', chummerAliases: [] } } })
  const res = await importBooks([tr(mus)])
  expect(res.counts['world.chummer-sr6-gear']).toMatchObject({ replaced: 1, created: 1, books: { MUS: { replaced: 1, created: 1 } } })  // the spoiler, and the rope new
  expect(gear.docs.get('G1')).toMatchObject({ folder: 'mine', flags: { [MODULE_ID]: { category: 'Vehicle mods' } } })
  expect(got('chummer-sr6-mods').byKey('MUS:gear:mus.made-up-spoiler')).toBeUndefined()
  expect(got('chummer-sr6-mods').docs.size).toBe(1)  // the sight only
})

test('a renamed entry: found by its alias and updated in place, never a second copy', async () => {
  const gear = new FakePack('chummer-sr6-gear', 'Gear', 'Item')
  gear.docs.set('F1', { _id: 'F1', name: 'Glitter Line', img: 'user/rope.webp', flags: { [MODULE_ID]: { chummerID: 'MUS:gear:mus.glitter-line', chummerAliases: [] } } })
  const res = await importBooks([tr(mus)])
  expect(res.counts['world.chummer-sr6-gear']).toMatchObject({ replaced: 1 })
  expect(gear.docs.get('F1')).toMatchObject({ name: 'Glitter Rope', img: 'user/rope.webp',
    flags: { [MODULE_ID]: { chummerID: 'MUS:gear:mus.rope', chummerAliases: ['MUS:gear:mus.glitter-line'] } } })
  expect([...gear.docs.values()].filter(d => d.name === 'Glitter Rope')).toHaveLength(1)
})

test('0.3’s per-book packs are never read or written, and a new entry with the same key goes to the type pack', async () => {
  const old = new FakePack('sr6-mus-weapons', 'Weapons — MUS', 'Item')
  const before = { _id: 'O1', name: 'Pocket Zapper', flags: { [MODULE_ID]: { chummerID: 'MUS:weapons:mus.pocket-zapper', chummerAliases: [] } } }
  old.docs.set('O1', structuredClone(before))
  old.getIndex = async () => { throw new Error('read an old pack') }
  old.locked = true
  const res = await importBooks([tr(mus)])
  expect(res.failed).toEqual([])
  expect([...old.docs.values()]).toEqual([before])
  expect(log.filter(l => l[1] === 'world.sr6-mus-weapons')).toEqual([])
  expect(got('chummer-sr6-weapons').byKey('MUS:weapons:mus.pocket-zapper')).toBeTruthy()
})

test('a martial art style keeps the genesisID it has in the world, and the book’s technique follows it', async () => {
  const styles = new FakePack('chummer-sr6-martialarts', 'Martial arts', 'Item')
  styles.docs.set('S1', { _id: 'S1', name: 'Made-up Fist', system: { genesisID: 'kept-g' }, flags: { [MODULE_ID]: { chummerID: 'MUS:martialarts:mus.made-up-fist' } } })
  await importBooks([tr(mus)])
  expect(styles.docs.get('S1').system.genesisID).toBe('kept-g')
  expect(styles.byKey('MUS:martialtechniques:mus.made-up-sweep').system.style).toBe('kept-g')
})

test('big packs: creates and updates go in chunks of 100, the window told after each', async () => {
  const many = { ...mus, entries: Array.from({ length: 250 }, (_, i) => ({ ...mus.entries.find(e => e.kind === 'qualities'), id: `mus.q${i}`, name: `Quality ${i}` })) }
  const seen = []
  await importBooks([tr(many)], { onProgress: p => seen.push(p) })
  expect(log.filter(l => l[0] === 'create').map(l => l[4])).toEqual([100, 100, 50])
  expect(seen.map(p => [p.label, p.done, p.of])).toEqual([['Qualities', 0, 250], ['Qualities', 100, 250], ['Qualities', 200, 250], ['Qualities', 250, 250]])
  log = []
  await importBooks([tr(many)])
  expect(log.filter(l => l[0] === 'update').map(l => l[4])).toEqual([100, 100, 50])
})

test('a pack this run created is deleted when its write fails, its folders with it; the other packs carry on', async () => {
  failCreate = 'world.chummer-sr6-weapons'
  const res = await importBooks([tr(mus)])
  expect(res.failed.map(f => f.pack)).toEqual(['world.chummer-sr6-weapons'])
  expect(packs.has('world.chummer-sr6-weapons')).toBe(false)
  expect(packs.has('world.chummer-sr6-armor')).toBe(true)
})

test('a failed write into an existing pack: its new entries and new category folders go again, the pack stays', async () => {
  const weapons = new FakePack('chummer-sr6-weapons', 'Weapons', 'Item')
  failCreate = 'world.chummer-sr6-weapons'
  await importBooks([tr(mus)])
  expect(packs.get('world.chummer-sr6-weapons')).toBe(weapons)
  expect([weapons.docs.size, weapons.folders]).toEqual([0, []])
})

test('nothing written: the folders this run made are deleted again', async () => {
  const only = { ...mus, entries: mus.entries.filter(e => e.kind === 'weapons') }
  failCreate = 'world.chummer-sr6-weapons'
  const res = await importBooks([tr(only)])
  expect(res.failed).toHaveLength(1)
  expect(folders).toEqual([])
})

test('a pack of ours by that name holding another document type is refused, the rest carry on', async () => {
  new FakePack('chummer-sr6-weapons', 'Weapons', 'Actor')
  const res = await importBooks([tr(mus)])
  expect(res.failed.map(f => [f.pack, f.error.message])).toEqual([['world.chummer-sr6-weapons', expect.stringMatching(/^SR6I.PackTypeClash/)]])
  expect(packs.has('world.chummer-sr6-armor')).toBe(true)
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
  await importBooks([tr(mus)])
  const q = [...got('chummer-sr6-qualities').docs.values()].find(d => d.name === 'Lucky Break')
  expect(q.effects[0]).toMatchObject({ name: 'Lucky Break', transfer: true, disabled: false,
    system: { changes: [{ key: 'system.attributes.agi.mod', type: 'add', value: '1' }, { key: 'system.defenserating.physical.mod', type: 'add', value: '1' }] } })
  expect(q.effects[0]).not.toHaveProperty('changes')
})

test('re-import keeps a user’s effect on an entry and swaps only ours', async () => {
  await importBooks([tr(mus)])
  const q = got('chummer-sr6-qualities'), [entry] = q.docs.values()
  entry.effects.push({ _id: 'userfx', name: 'GM house rule', flags: {} })
  await importBooks([tr(mus)])
  const after = q.docs.get(entry._id)
  expect(after.effects.map(e => e.name)).toEqual(['Lucky Break', 'Lucky Break (conditional)', 'GM house rule'])
  expect(after.effects.filter(e => e.flags?.[MODULE_ID]?.chummer)).toHaveLength(2)
})

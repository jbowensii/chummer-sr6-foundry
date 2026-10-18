// Chummer 0.13.0 (owner, 2026-10-11): a rated or leveled catalog entry is one entry per level, each with `family` (the
// printed entry's id) and `level` in attrs and its rating in values; each imports as its own item, keyed by its own id,
// with its rating and its effects at it. Made-up data only.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import { translateBook } from '../scripts/lib/books.js'
import { planUpsert } from '../scripts/lib/chummer-id.js'

const M = 'chummer-sr6-importer'
const level = n => ({ id: `mus.boost.${n}`, kind: 'augmentations', name: `Made-up Boost ${n}`, source: 'MUS', page: 12, canon: true,
  attrs: { type: 'cyberware', category: 'Bodyware', rating: String(n), family: 'mus.boost', level: String(n), essence: 'Rating × 0.1', avail: '4', cost: 'Rating × 1000' },
  parts: [{ tag: 'effect', attrs: { target: 'attr:rea', op: 'add', value: 'R' }, text: '' }, { tag: 'alias', attrs: {}, text: 'Made-up Boost' }],
  values: { rating: n, cost: n * 1000, avail: 4, essence: n * 0.1 },
  effects: [{ target: 'attr:rea', op: 'add', value: 'R' }] })
const book = { source: { id: 'MUS', name: 'Made-Up Streets', publisher: 'Nobody', canon: true }, entries: [level(1), level(2), level(3)] }
const file = { format: 'chummer-sr6-export', version: 1, kind: 'books', exportedAt: '2026-10-11T00:00:00.000Z',
  app: { name: 'Chummer Anarchy 2.0', version: 'test' }, descriptions: false, books: [book] }

describe('one item per level', () => {
  test('the export schema takes family and level in attrs', () => {
    const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/sr6-export.schema.json', 'utf8')))
    expect(check(file), JSON.stringify(check.errors)).toBe(true)
  })

  test('each level is its own item with its own id, name, rating and effect at that rating', () => {
    const docs = translateBook(book, { exportedAt: file.exportedAt, appVersion: 'test' }).packs.cyberware
    expect(docs.map(d => [d.name, d.system.rating, d.flags[M].chummerID])).toEqual([
      ['Made-up Boost 1', 1, 'MUS:augmentations:mus.boost.1'], ['Made-up Boost 2', 2, 'MUS:augmentations:mus.boost.2'], ['Made-up Boost 3', 3, 'MUS:augmentations:mus.boost.3']])
    const rea = d => d.effects.flatMap(e => e.changes).filter(c => c.key === 'system.attributes.rea.mod').map(c => c.value)
    expect(docs.map(rea)).toEqual([[1], [2], [3]])
  })

  test('re-importing adds each level beside an older item of the rated parent (nothing is replaced or deleted)', () => {
    const docs = translateBook(book, { exportedAt: file.exportedAt, appVersion: 'test' }).packs.cyberware
    const old = { _id: 'F1', flags: { [M]: { chummerID: 'MUS:augmentations:mus.boost', chummerAliases: [] } } }
    const r = planUpsert([old], docs)
    expect(r.updates).toEqual([])
    expect(r.creates.map(d => d.name)).toEqual(['Made-up Boost 1', 'Made-up Boost 2', 'Made-up Boost 3'])
  })
})

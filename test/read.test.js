import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import { readExport } from '../scripts/lib/read.js'

const sample = n => readFileSync(`samples/test-${n}.json`, 'utf8')
const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/sr6-export.schema.json', 'utf8')))
describe('reading a Chummer SR6 file', () => {
  test.each(['runners', 'books', 'compendium'])('the %s sample is valid and reads', n => {
    expect(check(JSON.parse(sample(n))), JSON.stringify(check.errors)).toBe(true)
    expect(readExport(sample(n)).ok).toBe(true)
  })
  test.each([
    ['not JSON', 'nope', /isn’t a Chummer SR6 export/],
    ['another format', JSON.stringify({ format: 'x', version: 1 }), /isn’t a Chummer SR6 export/],
    ['an Anarchy file', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [{}] }), /Chummer Anarchy 2\.0 file.*Anarchy 2\.0 Importer/],
    ['a newer version', JSON.stringify({ format: 'chummer-sr6-export', version: 2, kind: 'runners' }), /version 2.*update this module/],
    ['no runners', JSON.stringify({ format: 'chummer-sr6-export', version: 1, kind: 'runners', runners: [] }), /no runners/],
    ['no books', JSON.stringify({ format: 'chummer-sr6-export', version: 1, kind: 'books', books: [] }), /no books/],
    ['a damaged runner', JSON.stringify({ format: 'chummer-sr6-export', version: 1, kind: 'runners', runners: [{ id: 'a' }] }), /damaged/],
    ['a book without entries', JSON.stringify({ format: 'chummer-sr6-export', version: 1, kind: 'books', books: [{ source: { id: 'X', name: 'X' } }] }), /damaged/],
    ['a JSON array', '[]', /isn’t a Chummer SR6 export/],
  ])('refuses %s', (_, text, reason) => {
    const r = readExport(text)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(reason)
  })
})

describe('the schema', () => {
  const runners = () => JSON.parse(sample('runners'))
  test('closes the runner, purchases and values', () => {
    const f = runners(); f.runners[0].extra = 1
    expect(check(f)).toBe(false)
    const g = runners(); g.runners[0].purchases[0].extra = 1
    expect(check(g)).toBe(false)
    const h = runners(); h.runners[0].purchases[3].accessories[0].values.dv = 'x'
    expect(check(h)).toBe(false)
  })
  test('portraits are PNG or JPEG data URLs or null', () => {
    const f = runners(); f.runners[0].portrait = 'https://example.invalid/a.png'
    expect(check(f)).toBe(false)
    f.runners[0].portrait = null
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
  })
  test('a runners file needs runners, a books file needs books', () => {
    expect(check({ format: 'chummer-sr6-export', version: 1, kind: 'runners', exportedAt: 'x', app: { name: 'a', version: 'b' }, descriptions: true })).toBe(false)
    expect(check({ format: 'chummer-sr6-export', version: 1, kind: 'books', exportedAt: 'x', app: { name: 'a', version: 'b' }, descriptions: true })).toBe(false)
  })
})

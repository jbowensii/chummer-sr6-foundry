// A Chummer SR6 export file (chummer-anarchy2 docs/sr6-export-format.md): checked before anything in the world changes.
import { FORMAT, OTHER_FORMAT, VERSION } from './constants.js'

const NOT_OURS = 'This file isn’t a Chummer SR6 export.'
const obj = x => x && typeof x === 'object' && !Array.isArray(x)
export function readExport(text) {
  let file
  try { file = JSON.parse(text) } catch { return { ok: false, reason: NOT_OURS } }
  if (obj(file) && file.format === OTHER_FORMAT)
    return { ok: false, reason: 'This is a Chummer Anarchy 2.0 file. Import it with the Chummer Anarchy 2.0 Importer in a Shadowrun Anarchy 2 (sra2) world.' }
  if (!obj(file) || file.format !== FORMAT) return { ok: false, reason: NOT_OURS }
  if (file.version !== VERSION) return { ok: false, reason: `This file is export format version ${file.version}; this module reads version ${VERSION}. Please update this module.` }
  if (file.kind === 'books') {
    if (!Array.isArray(file.books) || !file.books.length) return { ok: false, reason: 'This file has no books in it.' }
    for (const b of file.books)
      if (!obj(b?.source) || typeof b.source.id !== 'string' || typeof b.source.name !== 'string' || !Array.isArray(b.entries))
        return { ok: false, reason: 'This file is damaged: a book is missing its id, name or entries.' }
    return { ok: true, file }
  }
  if (file.kind !== 'runners' || !Array.isArray(file.runners) || !file.runners.length) return { ok: false, reason: 'This file has no runners in it.' }
  for (const r of file.runners)
    if (!obj(r) || typeof r.id !== 'string' || typeof r.streetName !== 'string' || !obj(r.attributes))
      return { ok: false, reason: 'This file is damaged: a runner is missing its id, name or attributes.' }
  return { ok: true, file }
}

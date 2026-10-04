// Copies the Anarchy module's default icons to icons/defaults/<SR6 key>.webp (tools/icon-defaults.json: SR6 key ->
// Anarchy key) and writes icons/index.json. Source: env ANARCHY_ICONS (default below). Re-runnable; no image tools needed.
// ponytail: copies, no new art; port the Anarchy make-icons.mjs (sharp) when the owner's PNG folder is back.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = process.env.ANARCHY_ICONS || 'C:/dev/chummer-anarchy2-foundry/icons/defaults'
const map = JSON.parse(fs.readFileSync(path.join(root, 'tools/icon-defaults.json'), 'utf8'))

fs.rmSync(path.join(root, 'icons/defaults'), { recursive: true, force: true })  // no stale keys
for (const [key, from] of Object.entries(map)) {
  const out = path.join(root, 'icons/defaults', key + '.webp')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.copyFileSync(path.join(src, from + '.webp'), out)
}

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.webp') ? [path.relative(root, path.join(d, e.name)).split(path.sep).join('/')] : [])
const index = walk(path.join(root, 'icons')).sort()
fs.writeFileSync(path.join(root, 'icons/index.json'), JSON.stringify(index, null, 1) + '\n')
console.log(`${index.length} icons`)

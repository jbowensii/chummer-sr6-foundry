// The module's icon list (icons/index.json), loaded once at init. Foundry globals only inside functions.
import { MODULE_ID } from '../lib/constants.js'

export const INDEX = `modules/${MODULE_ID}/icons/index.json`

// icons/index.json, or null (logged) when it can't be read: the importer then sets no images.
export async function loadIconIndex() {
  try {
    const res = await fetch(INDEX)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const list = await res.json()
    if (!Array.isArray(list)) throw new Error('not a list')
    return list
  } catch (e) {
    console.error(`${MODULE_ID} | ${INDEX} could not be read; imports get no icons`, e)
    return null
  }
}

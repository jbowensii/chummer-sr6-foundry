// The app's machine conditions on an effect's or bonus's `when` (docs/sr6-data-format/kinds.md "Machine conditions"):
// `attr:<abbr>>=N`, `attr:<abbr><=N`, a metatype's name (the runner's, or its parent's), a role (adept, magician, mystic
// adept, technomancer). The actor decides them; any other `when` is a situation only the table knows (a switch).
import { ATTRS, normKey } from './eden.js'

const ATTR_WHEN = /^attr:([a-z]{3})(>=|<=)(\d+)$/
// the metatype names the app's grammar can hold (the export has no list): the five and the variants SR6 prints. ponytail:
// a name missing here stays a switch (unless it is the runner's own); add it, or export the app's list, when one turns up.
const METATYPES = new Set(['human', 'elf', 'dwarf', 'ork', 'troll', 'dryad', 'nomad', 'hanuman', 'koborokuru', 'menehune', 'fomori', 'giant', 'minotaur', 'cyclops',
  'oni', 'hobgoblin', 'ogre', 'satyr', 'gnome', 'night_one', 'naga', 'centaur', 'pixie', 'sasquatch', 'gargoyle', 'shapeshifter'])
const ROLES = { adept: ['adept', 'mystic-adept'], magician: ['full', 'aspected', 'mystic-adept'], 'mystic adept': ['mystic-adept'], technomancer: ['technomancer'] }
// (ponytail: adept = powers, magician = spells, as effects.ts ROLES: an aspected magician counts as a magician)

/** What a runner's conditions are decided from: { attr(k), metatypes: [its name and its parent's], kind: the export's magic.kind }. */
export const whenFacts = r => ({
  attr: k => Number(r.attributes?.[k]?.augmented ?? r.attributes?.[k]?.natural) || 0,
  metatypes: [r.metatype?.name, r.metatype?.parent].filter(Boolean).map(normKey),
  kind: r.magic?.kind ?? 'mundane' })

/** The attribute and role grammar (no actor needed to know it is one): not for display. */
export const isMachineWhen = w => ATTR_WHEN.test(w ?? '') || normKey(w) in Object.fromEntries(Object.keys(ROLES).map(k => [normKey(k), 1]))

/** true/false when the facts decide it; undefined when it is prose or a metatype name we can't tell from prose (no facts: never). */
export function whenHolds(when, facts) {
  if (!when || !facts) return undefined
  const a = ATTR_WHEN.exec(when)
  if (a) return [...ATTRS, 'edg'].includes(a[1]) ? (a[2] === '>=' ? facts.attr(a[1]) >= +a[3] : facts.attr(a[1]) <= +a[3]) : undefined
  const n = normKey(when), role = Object.entries(ROLES).find(([k]) => normKey(k) === n)
  if (role) return role[1].includes(facts.kind)
  return METATYPES.has(n) || facts.metatypes.includes(n) ? facts.metatypes.includes(n) : undefined
}

/** How a row (effect or bonus) turns on once its machine `when` is decided: holds -> always on (its conditional switch
 *  and condition dropped); fails -> off:true (a disabled effect, no condition shown). Prose and no facts: as it was. */
export function decide(o, facts) {
  const h = whenHolds(o.when, facts)
  return h === undefined ? o : { ...o, when: undefined, ...(o.switch === 'conditional' ? { switch: undefined } : {}), ...(h ? {} : { off: true }) }
}

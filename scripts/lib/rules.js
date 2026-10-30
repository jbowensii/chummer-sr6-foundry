// Creation-cost RULE refs the app exports on an item (`rules`, e.g. POLYGLOT). shadowrun6-eden 4.0.11 has no Karma-spend
// flow (karma and skill points are plain fields the GM or player edits), so nothing in Eden calls these: they are the
// words on the item and the cost a language rank takes, for the sheet's note and for whatever buys the rank.
export const RULE_TEXT = { POLYGLOT: 'Polyglot: language ranks cost 1 Karma less (never below 1) and go to rank 4.' }
export const ruleLines = refs => (refs ?? []).flatMap(r => RULE_TEXT[r] ?? [])

/** Whether an actor's items (Foundry item data or documents) carry a rule ref, from our flags `rules`. */
export const hasRule = (items, ref, id = 'chummer-sr6-importer') => [...(items ?? [])].some(i => (i.flags?.[id]?.rules ?? []).includes(ref))

/** Karma for one rank of a language: perRank (the table's cost per rank), less 1 with Polyglot, never below 1. */
export const languageRankCost = (items, perRank) => (hasRule(items, 'POLYGLOT') ? Math.max(1, perRank - 1) : perRank)
/** The highest language rank: `most` (the table's), raised to 4 with Polyglot. */
export const languageMaxRank = (items, most) => (hasRule(items, 'POLYGLOT') ? Math.max(most, 4) : most)

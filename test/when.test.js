// Machine conditions (`when`) decided from the actor, situational bonuses with `on`, and quality bonuses. Invented data.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { translateRunner } from '../scripts/lib/translate.js'
import { decide, whenFacts, whenHolds } from '../scripts/lib/when.js'

const file = JSON.parse(readFileSync('samples/test-runners.json', 'utf8'))
const mara = () => structuredClone(file.runners[0])  // Elf, mystic adept, Strength 2, Agility 5 natural and 6 augmented (the condition counts the augmented one)
const facts = whenFacts(mara())
const OPTS = { exportedAt: file.exportedAt, appVersion: file.app.version }
const thing = (o = {}) => ({ uid: 'w1', kind: 'gear', name: 'Made-up Charm', canon: true, attrs: {}, parts: [], values: {}, qty: 1, accessories: [], ...o })
const effectsOf = (bonuses, effects = []) => {
  const r = mara()
  r.purchases.push(thing({ bonuses, effects }))
  const item = translateRunner(r, OPTS).items.find(i => i.name === 'Made-up Charm')
  return { item, fx: (item.effects ?? []).map(e => ({ name: e.name, disabled: e.disabled, changes: e.changes.map(c => [c.key, c.value]) })) }
}

describe('whenHolds', () => {
  test('attributes, metatype and its parent, roles; prose is undecided', () => {
    expect([whenHolds('attr:agi>=6', facts), whenHolds('attr:agi>=7', facts), whenHolds('attr:str<=2', facts), whenHolds('attr:str<=1', facts)]).toEqual([true, false, true, false])
    expect([whenHolds('Elf', facts), whenHolds('Troll', facts)]).toEqual([true, false])
    expect(whenHolds('Elf', whenFacts({ metatype: { name: 'Made-up Sylvan', parent: 'Elf' } }))).toBe(true)
    expect([whenHolds('mystic adept', facts), whenHolds('adept', facts), whenHolds('magician', facts), whenHolds('technomancer', facts)]).toEqual([true, true, true, false])
    expect([whenHolds('in animal form', facts), whenHolds('Missile', facts), whenHolds('attr:str>=6', undefined)]).toEqual([undefined, undefined, undefined])
  })
  test('decide: holds drops the conditional switch; fails turns it off; prose untouched', () => {
    expect(decide({ when: 'attr:agi>=6', switch: 'conditional' }, facts)).toMatchObject({ when: undefined, switch: undefined })
    expect(decide({ when: 'attr:agi>=6', switch: 'conditional' }, facts).off).toBeUndefined()
    expect(decide({ when: 'Troll', switch: 'conditional' }, facts)).toMatchObject({ when: undefined, off: true })
    const prose = { when: 'in animal form', switch: 'conditional' }
    expect(decide(prose, facts)).toBe(prose)
  })
})

describe('bonuses on a runner’s item', () => {
  test('a machine condition that holds is an always-on effect; one that fails is a disabled effect; neither shows the grammar', () => {
    const { fx, item } = effectsOf([{ target: 'agi', value: 1, when: 'attr:agi>=6', switch: 'conditional' }, { target: 'str', value: 2, when: 'Troll', switch: 'conditional' }])
    expect(fx).toEqual([{ name: 'Made-up Charm', disabled: false, changes: [['system.attributes.agi.mod', 1]] },
      { name: 'Made-up Charm', disabled: true, changes: [['system.attributes.str.mod', 2]] }])
    expect(JSON.stringify(item)).not.toContain('attr:agi')
  })
  test('a situational bonus is a disabled effect; with `on` it is enabled and times the count; without a count it is 1', () => {
    const { fx } = effectsOf([{ target: 'agi', value: 1, when: 'when sneaking', switch: 'conditional' },
      { target: 'wil', value: 2, when: 'per ally in sight', switch: 'conditional', on: 3 }, { target: 'log', value: 1, when: 'at night', switch: 'conditional', on: 1 }])
    expect(fx).toEqual([
      { name: 'Conditional: Made-up Charm (when sneaking)', disabled: true, changes: [['system.attributes.agi.mod', 1]] },
      { name: 'Conditional: Made-up Charm (per ally in sight)', disabled: false, changes: [['system.attributes.wil.mod', 6]] },
      { name: 'Conditional: Made-up Charm (at night)', disabled: false, changes: [['system.attributes.log.mod', 1]] }])
  })
  test('the catalog’s effects are decided the same way, and a fail leaves no note', () => {
    const { fx, item } = effectsOf(undefined, [{ target: 'attr:agi', op: 'add', value: '1', switch: 'conditional', when: 'attr:agi>=7' }, { target: 'attr:str', op: 'add', value: '1', switch: 'conditional', when: 'Troll' }, { target: 'matrix:attack', op: 'add', value: '1', switch: 'conditional', when: 'Troll' }])
    expect(fx.map(e => e.disabled)).toEqual([true])  // (one effect: same name and state; the Matrix one has no Eden field: a note, and a fail says nothing)
    expect(item.system.description).not.toContain('Troll')
  })
})

describe('a quality’s bonuses', () => {
  test('are effects like any item’s', () => {
    const r = mara()
    r.qualities.push({ uid: 'q9', kind: 'qualities', name: 'Made-up Knack', canon: true, attrs: {}, parts: [], values: {}, positive: true, level: 1,
      bonuses: [{ target: 'cha', value: 1, when: 'adept', switch: 'conditional' }, { target: 'wil', value: 1, when: 'technomancer', switch: 'conditional' }] })
    const q = translateRunner(r, OPTS).items.find(i => i.name === 'Made-up Knack')
    expect(q.effects.map(e => [e.name, e.disabled, e.changes[0].key])).toEqual([['Made-up Knack', false, 'system.attributes.cha.mod'], ['Made-up Knack', true, 'system.attributes.wil.mod']])
  })
})

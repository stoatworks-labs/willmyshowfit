import { describe, expect, it } from 'vitest'

import { DEVICES, deviceClass } from '../../data/index.ts'
import type { Provenance } from '../model/types.ts'

/**
 * The rules that keep the database honest. These are not style checks: each
 * one has already caught a real mistake, and they exist so a hurried edit
 * cannot quietly turn a guess into a stated fact.
 */

function allProvenance(): { where: string; prov: Provenance }[] {
  const out: { where: string; prov: Provenance }[] = []
  for (const d of DEVICES) {
    out.push({ where: `${d.model} (device)`, prov: d.provenance })
    for (const c of d.configs) {
      if (c.provenance) out.push({ where: `${d.model} / ${c.label}`, prov: c.provenance })
      for (const p of c.pools) {
        if (p.provenance) out.push({ where: `${d.model} / pool ${p.id}`, prov: p.provenance })
      }
    }
  }
  return out
}

describe('device database integrity', () => {
  it('has a unique id for every device', () => {
    const ids = DEVICES.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every device at least one configuration with plugs in both directions', () => {
    for (const d of DEVICES) {
      expect(d.configs.length, d.model).toBeGreaterThan(0)
      for (const c of d.configs) {
        expect(c.ports.some((p) => p.direction === 'in'), `${d.model} inputs`).toBe(true)
        expect(c.ports.some((p) => p.direction === 'out'), `${d.model} outputs`).toBe(true)
      }
    }
  })

  it('never marks a figure `documented` without a citation', () => {
    for (const { where, prov } of allProvenance()) {
      if (prov.confidence === 'documented') {
        expect(prov.citations.length, `${where} is documented but uncited`).toBeGreaterThan(0)
      }
    }
  })

  it('requires every citation to name a source and a date, not just a URL', () => {
    for (const { where, prov } of allProvenance()) {
      for (const c of prov.citations) {
        expect(c.claim.length, `${where}: empty claim`).toBeGreaterThan(10)
        expect(c.source.length, `${where}: empty source`).toBeGreaterThan(5)
        expect(c.source, `${where}: "${c.source}" is not a document`).not.toMatch(
          /^(the )?(vendor )?(website|web site|internet)$/i,
        )
        expect(c.read, `${where}: unreadable date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })

  it('makes every `unverified` figure explain itself in a note', () => {
    for (const { where, prov } of allProvenance()) {
      if (prov.confidence === 'unverified') {
        expect(prov.notes.length, `${where} is unverified and says nothing about why`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps port ids unique within a configuration', () => {
    for (const d of DEVICES) {
      for (const c of d.configs) {
        const ids = c.ports.map((p) => p.id)
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
        expect(dupes, `${d.model} / ${c.label} duplicate plug ids`).toEqual([])
      }
    }
  })

  it('points every layer costing at a pool the configuration actually has', () => {
    for (const d of DEVICES) {
      for (const c of d.configs) {
        const has = c.pools.some((p) => p.id === d.rules.layerCosting.poolId)
        expect(has, `${d.model} / ${c.label} has no ${d.rules.layerCosting.poolId} pool`).toBe(true)
      }
    }
  })

  it('sorts every layer class ladder so cheaper classes are smaller', () => {
    for (const d of DEVICES) {
      const classes = [...d.rules.layerCosting.classes].sort((a, b) => a.maxPixelRate - b.maxPixelRate)
      for (let i = 1; i < classes.length; i++) {
        expect(
          classes[i].cost,
          `${d.model}: a bigger layer class costs no more than a smaller one`,
        ).toBeGreaterThanOrEqual(classes[i - 1].cost)
      }
    }
  })

  it('splits the database into screen-management systems and vision mixers', () => {
    const kinds = new Set(DEVICES.map(deviceClass))
    expect(kinds).toEqual(new Set(['screen-management', 'vision-mixer']))
  })

  it('gives every vision mixer a caveat, because the comparison is not like for like', () => {
    for (const d of DEVICES.filter((x) => deviceClass(x) === 'vision-mixer')) {
      expect(d.caveats.length, `${d.model} has no caveats`).toBeGreaterThan(0)
    }
  })
})

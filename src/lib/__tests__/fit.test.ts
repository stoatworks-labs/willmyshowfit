import { describe, expect, it } from 'vitest'

import { cvtRbV2, requirementFor, sdiClassFor, timingFor } from '../model/signal.ts'
import { expandToPlugs, matchPorts, resourcesOf } from '../fit/solve.ts'
import { evaluateAll, evaluateConfig, type VideoDevice } from '../fit/evaluate.ts'
import { costLayer, emptyShow, type Show, type ShowScreen } from '../profiles/video.ts'
import { DEVICES } from '../../data/index.ts'
import { CAP, mirrored, run, selectOne } from '../../data/ports.ts'

// ------------------------------------------------------------------ signal

describe('pixel rates', () => {
  it('uses published timings for standard formats', () => {
    expect(timingFor({ hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' }))
      .toMatchObject({ pixelClockHz: 148.5e6, basis: 'standard' })
    expect(timingFor({ hActive: 3840, vActive: 2160, refreshHz: 60, bpc: 8, sampling: 'rgb444' }))
      .toMatchObject({ pixelClockHz: 594e6, basis: 'standard' })
  })

  it('charges blanking, not just active pixels', () => {
    // 1920x1080p60 active is 124.4 Mpix/s; the plug sees 148.5 MHz.
    const t = timingFor({ hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' })
    expect(t.pixelClockHz).toBeGreaterThan(1920 * 1080 * 60)
  })

  it('falls back to CVT-RB v2 for a custom LED raster', () => {
    const t = timingFor({ hActive: 3520, vActive: 1088, refreshHz: 60, bpc: 8, sampling: 'rgb444' })
    expect(t.basis).toBe('cvt-rb-v2')
    // RB v2 fixes horizontal blanking at 80 pixels.
    expect(t.hTotal).toBe(3600)
  })

  it('CVT-RB v2 matches the published figures for a known mode', () => {
    // 1920x1080p60 CVT-RB v2 is 2000x1111 at 133.32 MHz. Getting this wrong by
    // using the settled vertical total to recompute the line period lands on
    // ~1096 lines and a clock several MHz low.
    const t = cvtRbV2(1920, 1080, 60)
    expect(t.hTotal).toBe(2000)
    expect(t.vTotal).toBe(1111)
    expect(t.pixelClockHz).toBe(133_320_000)
  })

  it('CVT-RB v2 always leaves at least 460us of vertical blanking', () => {
    for (const [h, v, r] of [[1920, 1080, 60], [3520, 1088, 60], [2560, 1600, 50]] as const) {
      const t = cvtRbV2(h, v, r)
      const estLineUs = (1e6 / r - 460) / v
      expect((t.vTotal - v) * estLineUs).toBeGreaterThanOrEqual(460)
    }
  })

  it('picks the smallest SDI class that carries a format', () => {
    const f = (h: number, v: number, r: number) =>
      sdiClassFor({ hActive: h, vActive: v, refreshHz: r, bpc: 10, sampling: 'ycbcr422' })
    expect(f(1920, 1080, 30)).toBe('hd')
    expect(f(1920, 1080, 60)).toBe('3g')
    expect(f(3840, 2160, 30)).toBe('6g')
    expect(f(3840, 2160, 60)).toBe('12g')
  })

  it('refuses to put 4:4:4 down an SDI cable', () => {
    expect(
      sdiClassFor({ hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' }),
    ).toBeNull()
  })
})

// --------------------------------------------------------------- resources

describe('mirror and select groups', () => {
  it('counts a mirrored HDMI+SDI output as one resource, not two', () => {
    const ports = mirrored('OUT 1', [
      { id: 'OUT 1 (HDMI)', kind: 'hdmi', label: 'HDMI 2.0', direction: 'out', cap: CAP.hdmi20() },
      { id: 'OUT 1 (SDI)', kind: 'sdi', label: '12G-SDI', direction: 'out', cap: CAP.sdi12g() },
    ])
    const res = resourcesOf({ id: 'c', label: 'c', stock: true, ports, pools: [] })
    expect(res).toHaveLength(1)
    expect(res[0].kind).toBe('mirror')
  })

  it('counts an either/or input multi-plug as one resource', () => {
    const ports = selectOne('IN 1', [
      { id: 'IN 1 (HDMI)', kind: 'hdmi', label: 'HDMI 1.4', direction: 'in', cap: CAP.hdmi14() },
      { id: 'IN 1 (SDI)', kind: 'sdi', label: '3G-SDI', direction: 'in', cap: CAP.sdi3g() },
    ])
    const res = resourcesOf({ id: 'c', label: 'c', stock: true, ports, pools: [] })
    expect(res).toHaveLength(1)
    expect(res[0].kind).toBe('select')
  })
})

// ---------------------------------------------------------------- matching

const hd = { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8 as const, sampling: 'ycbcr422' as const }

function sdiDemand(id: string) {
  return {
    id,
    label: id,
    direction: 'in' as const,
    accepts: ['sdi' as const],
    need: requirementFor(hd),
    plugs: 1,
  }
}

describe('port matching', () => {
  it('is a matching, not a count: four SDI sources do not fit two SDI plugs', () => {
    const ports = [
      ...run('IN-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 2, 'in'),
      ...run('IN-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 6, 'in'),
    ]
    const res = resourcesOf({ id: 'c', label: 'c', stock: true, ports, pools: [] })
    const demands = expandToPlugs([1, 2, 3, 4].map((n) => sdiDemand(`SDI ${n}`)))

    // Eight plugs, four sources — a naive count says yes.
    expect(res).toHaveLength(8)
    const sol = matchPorts(res, demands)
    expect(sol.ok).toBe(false)
    expect(sol.unassigned).toHaveLength(2)
  })

  it('splits a dual-cable 4K60 feed into two half-rate signals', () => {
    const uhd = { hActive: 3840, vActive: 2160, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const }
    const [a, b] = expandToPlugs([
      {
        id: 'proj',
        label: 'Projector',
        direction: 'out',
        accepts: ['hdmi'],
        need: requirementFor(uhd),
        plugs: 2,
      },
    ])
    expect(a.need.pixelRateHz).toBe(594e6 / 2)
    expect(b.cable).toEqual({ index: 2, of: 2 })
    // …which is exactly why it now fits an HDMI 1.4 plug that 4K60 does not.
    const res = resourcesOf({
      id: 'c',
      label: 'c',
      stock: true,
      ports: run('OUT', 'hdmi', 'HDMI 1.4', CAP.hdmi14(340e6), 2, 'out'),
      pools: [],
    })
    expect(matchPorts(res, [a, b]).ok).toBe(true)
  })

  it('accepts a DVI plug for an HDMI source and names the adapter', () => {
    const res = resourcesOf({
      id: 'c',
      label: 'c',
      stock: true,
      ports: run('IN-DVI', 'dvi', 'Single-link DVI', CAP.dviSingle(), 1, 'in'),
      pools: [],
    })
    const sol = matchPorts(
      res,
      expandToPlugs([
        {
          id: 's',
          label: 'Laptop',
          direction: 'in',
          accepts: ['hdmi', 'dvi'],
          need: requirementFor({ ...hd, sampling: 'rgb444' }),
          plugs: 1,
        },
      ]),
    )
    expect(sol.ok).toBe(true)
    expect(sol.assignments[0].adapter).toContain('HDMI→DVI-D')
  })

  it('will not put a 4K60 source on an HDMI 1.4 plug', () => {
    const res = resourcesOf({
      id: 'c',
      label: 'c',
      stock: true,
      ports: run('IN', 'hdmi', 'HDMI 1.4a', CAP.hdmi14(297e6), 4, 'in'),
      pools: [],
    })
    const sol = matchPorts(
      res,
      expandToPlugs([
        {
          id: 's',
          label: '4K playback',
          direction: 'in',
          accepts: ['hdmi'],
          need: requirementFor({
            hActive: 3840,
            vActive: 2160,
            refreshHz: 60,
            bpc: 8,
            sampling: 'rgb444',
          }),
          plugs: 1,
        },
      ]),
    )
    expect(sol.ok).toBe(false)
    expect(sol.unassigned[0].reasons.join(' ')).toMatch(/tops out at 297/)
  })

  it('reserves multiviewer plugs for multiviewer feeds', () => {
    const res = resourcesOf({
      id: 'c',
      label: 'c',
      stock: true,
      ports: run('MVR', 'hdmi', 'HDMI 2.0 (MVR)', CAP.hdmi20(), 2, 'out', {
        roles: ['multiviewer'],
      }),
      pools: [],
    })
    const sol = matchPorts(
      res,
      expandToPlugs([
        {
          id: 'p',
          label: 'Main screen',
          direction: 'out',
          accepts: ['hdmi'],
          need: requirementFor({ ...hd, sampling: 'rgb444' }),
          roles: ['program'],
          plugs: 1,
        },
      ]),
    )
    expect(sol.ok).toBe(false)
  })
})

// ----------------------------------------------------------- layer costing

describe('layer costing', () => {
  const costing = {
    poolId: 'layers',
    classes: [
      { id: '2k', label: '2K', maxPixelRate: 2048 * 1200 * 60, cost: 0.25 },
      { id: '4k', label: '4K', maxPixelRate: 4096 * 2160 * 60, cost: 1 },
    ],
    splitFactor: 0.5,
  }

  it('charges the smallest class that holds the content', () => {
    const layer = {
      id: 'l',
      name: 'PIP',
      format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const },
      kind: 'mixing' as const,
    }
    expect(costLayer(layer, costing)).toMatchObject({ cost: 0.25 })
  })

  it('halves the cost of a split layer', () => {
    const layer = {
      id: 'l',
      name: 'Big',
      format: { hActive: 3840, vActive: 2160, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const },
      kind: 'split' as const,
    }
    expect(costLayer(layer, costing)).toMatchObject({ cost: 0.5 })
  })

  it('reports a layer no class can hold', () => {
    const layer = {
      id: 'l',
      name: 'Huge',
      format: { hActive: 7680, vActive: 2160, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const },
      kind: 'mixing' as const,
    }
    expect(costLayer(layer, costing)).toHaveProperty('tooBig', true)
  })
})

// ----------------------------------------------------------- whole shows

function screen(over: Partial<ShowScreen> = {}): ShowScreen {
  return {
    id: 'scr1',
    name: 'Main screen',
    canvas: { hActive: 1920, vActive: 1080, refreshHz: 60 },
    layers: [],
    liveBackground: false,
    destinations: [
      {
        id: 'd1',
        name: 'Main LED',
        format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
        connector: 'hdmi',
        count: 1,
      },
    ],
    ...over,
  }
}

function smallShow(): Show {
  return {
    ...emptyShow(),
    name: 'Small show',
    screens: [screen()],
    sources: [
      {
        id: 's1',
        name: 'Laptop',
        format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
        connector: 'hdmi',
        count: 2,
      },
    ],
  }
}

const byId = (id: string): VideoDevice => {
  const d = DEVICES.find((x) => x.id === id)
  if (!d) throw new Error(`no device ${id}`)
  return d
}

describe('evaluating a show', () => {
  it('fits a small show on a Pulse 4K', () => {
    const d = byId('aw-midra-pulse4k')
    const r = evaluateConfig(d, d.configs[0], smallShow())
    expect(r.verdict).toBe('fits')
  })

  it('blocks a live background on a QuickVu 4K, which cannot do one', () => {
    const d = byId('aw-midra-quickvu4k')
    const show = { ...smallShow(), screens: [screen({ liveBackground: true })] }
    const r = evaluateConfig(d, d.configs[0], show)
    expect(r.verdict).toBe('does-not-fit')
    expect(r.blockers.join(' ')).toMatch(/live input as its background/)
  })

  it('rejects a wide multi-output canvas on a vision mixer, by shape not by size', () => {
    const wide = screen({
      canvas: { hActive: 7680, vActive: 2160, refreshHz: 60 },
      destinations: [
        {
          id: 'd1',
          name: 'LED processor',
          format: { hActive: 3840, vActive: 2160, refreshHz: 60, bpc: 8, sampling: 'ycbcr422' },
          connector: 'sdi',
          count: 2,
        },
      ],
    })
    const d = byId('bmd-atem-4me-constellation-4k')
    const r = evaluateConfig(d, d.configs[0], { ...smallShow(), screens: [wide], sources: [] })
    expect(r.verdict).toBe('does-not-fit')
    expect(r.blockers.join(' ')).toMatch(/no edge blending/)
  })

  it('ranks devices that fit ahead of those that do not', () => {
    const results = evaluateAll(DEVICES, smallShow())
    const verdicts = results.map((r) => r.best.verdict)
    const firstFail = verdicts.findIndex((v) => v !== 'fits' && v !== 'fits-with-tradeoff')
    if (firstFail !== -1) {
      expect(verdicts.slice(firstFail).every((v) => v !== 'fits')).toBe(true)
    }
  })
})

// -------------------------------------------------------- layers on aux

describe('the layers-on-aux toggle', () => {
  const auxLayer = {
    id: 'al',
    name: 'Lower third',
    format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const },
    kind: 'mixing' as const,
  }

  function showWithAuxLayer(): Show {
    return {
      ...smallShow(),
      layersOnAux: true,
      auxes: [
        {
          id: 'aux1',
          name: 'Stage comfort',
          format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
          connector: 'hdmi',
          count: 1,
          layers: [auxLayer],
        },
      ],
    }
  }

  it('is ignored entirely when the toggle is off', () => {
    const d = byId('barco-e2-gen2')
    const off = { ...showWithAuxLayer(), layersOnAux: false }
    const r = evaluateConfig(d, d.configs[0], off)
    const layerUse = r.pools.usage.find((u) => u.pool.id === 'layers')
    expect(layerUse).toBeUndefined()
  })

  it('costs a LivePremier nothing — it borrows adjacent outputs', () => {
    const d = byId('aw-aquilon-rs2')
    const r = evaluateConfig(d, d.configs[0], showWithAuxLayer())
    const layerUse = r.pools.usage.find((u) => u.pool.id === 'layers')
    expect(layerUse).toBeUndefined()
    expect(r.warnings.join(' ')).toMatch(/cost this device nothing/)
  })

  it('costs an Event Master chassis from the same budget as a screen layer', () => {
    const d = byId('barco-e2-gen2')
    const r = evaluateConfig(d, d.configs[0], showWithAuxLayer())
    const layerUse = r.pools.usage.find((u) => u.pool.id === 'layers')
    expect(layerUse?.used).toBeGreaterThan(0)
  })

  it('rules out an ATEM, whose aux buses cannot carry a key at all', () => {
    const d = byId('bmd-atem-2me-constellation-4k')
    const r = evaluateConfig(d, d.configs[0], showWithAuxLayer())
    expect(r.verdict).toBe('impossible')
    expect(r.blockers.join(' ')).toMatch(/cannot build layers on an aux output/)
  })
})

// ------------------------------------------------------- pool scoping

describe('pool scopes', () => {
  it('charges PixelHue layers per output card, not per system', () => {
    const d = byId('pixelhue-f8')
    const threeBigLayers = screen({
      layers: [1, 2, 3].map((n) => ({
        id: `l${n}`,
        name: `Layer ${n}`,
        format: { hActive: 3840, vActive: 2160, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const },
        kind: 'mixing' as const,
      })),
      destinations: [
        {
          id: 'd1',
          name: 'Wall',
          format: { hActive: 3840, vActive: 2160, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
          connector: 'hdmi',
          count: 1,
        },
      ],
    })
    const r = evaluateConfig(d, d.configs[0], {
      ...smallShow(),
      sources: [],
      screens: [threeBigLayers],
    })
    // The chassis advertises 16x 4K layers; one card holds two.
    const use = r.pools.usage.find((u) => u.pool.id === 'layers')
    expect(use?.capacity).toBe(2)
    expect(use?.used).toBe(3)
    expect(r.verdict).toBe('does-not-fit')
  })

  it('offers Barco PGM-only mode as a trade-off rather than a flat refusal', () => {
    const d = byId('barco-s3-standalone')
    const huge = screen({
      canvas: { hActive: 7680, vActive: 4320, refreshHz: 60 },
      destinations: [
        {
          id: 'd1',
          name: 'Wall',
          format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
          connector: 'hdmi',
          count: 4,
        },
      ],
    })
    const r = evaluateConfig(d, d.configs[0], { ...smallShow(), sources: [], screens: [huge] })
    const canvas = r.pools.usage.find((u) => u.pool.id === 'canvas')
    expect(canvas?.used).toBeCloseTo(33.18, 1)
    expect(canvas?.rescuedBy?.capacity).toBe(40)
    expect(r.verdict).toBe('fits-with-tradeoff')
  })
})

// ------------------------------------------------- vision-mixer shape checks

describe('vision mixers are judged on shape, not just size', () => {
  it('counts output PLUGS, not destination entries, when deciding a screen spans outputs', () => {
    // One entry saying "LED processor x3" is three outputs. Counting entries
    // makes a three-projector blend look like a single-output screen.
    const blended = screen({
      canvas: { hActive: 5760, vActive: 1080, refreshHz: 60 },
      destinations: [
        {
          id: 'd1',
          name: 'LED processor',
          format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
          connector: 'sdi',
          count: 3,
        },
      ],
    })
    const d = byId('bmd-atem-4me-constellation-4k')
    const r = evaluateConfig(d, d.configs[0], { ...smallShow(), sources: [], screens: [blended] })
    expect(r.blockers.join(' ')).toMatch(/delivered on 3 output plugs/)
  })

  it('collapses a wall of identical plug failures into one line', () => {
    // Every HDMI signal fails the same way on an all-SDI chassis. Fifteen
    // identical lines is not a report.
    const d = byId('bmd-atem-1me-constellation-4k')
    const manyHdmi = {
      ...smallShow(),
      screens: [],
      sources: [
        {
          id: 's',
          name: 'Laptop',
          connector: 'hdmi' as const,
          count: 8,
          format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const },
        },
      ],
    }
    const r = evaluateConfig(d, d.configs[0], manyHdmi)
    const plugLines = r.blockers.filter((b) => b.includes('no plug'))
    expect(plugLines).toHaveLength(1)
    expect(plugLines[0]).toMatch(/8 signals have no plug/)
    expect(plugLines[0]).toMatch(/and 5 more/)
  })
})

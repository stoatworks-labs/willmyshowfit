import { describe, expect, it } from 'vitest'

import { DEVICES } from '../../data/index.ts'
import { evaluateConfig, type VideoDevice } from '../fit/evaluate.ts'
import { proposeLoadout, whyNoLoadout } from '../fit/loadout.ts'
import { emptyShow, type Show, type ShowScreen } from '../profiles/video.ts'

const byId = (id: string): VideoDevice => {
  const d = DEVICES.find((x) => x.id === id)
  if (!d) throw new Error(`no device ${id}`)
  return d
}

const HD = { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const }
const HD_SDI = { ...HD, bpc: 10 as const, sampling: 'ycbcr422' as const }

function screen(over: Partial<ShowScreen> = {}): ShowScreen {
  return {
    id: 'scr1',
    name: 'Main',
    canvas: { hActive: 1920, vActive: 1080, refreshHz: 60 },
    layers: [],
    liveBackground: false,
    destinations: [{ id: 'd1', name: 'Wall', format: HD, connector: 'hdmi', count: 1 }],
    ...over,
  }
}

/**
 * A show that a stock Aquilon cannot take, for one specific and fixable
 * reason: it wants more SDI inputs than any stock loadout carries. Every RS
 * model ships at most 8x 12G-SDI, and none ships an SDI *output* at all.
 */
function sdiHeavyShow(): Show {
  return {
    ...emptyShow(),
    name: 'SDI-heavy',
    sources: [{ id: 'cam', name: 'Cameras', connector: 'sdi', count: 12, format: HD_SDI }],
    screens: [
      screen({
        destinations: [{ id: 'd1', name: 'Wall', format: HD_SDI, connector: 'sdi', count: 4 }],
      }),
    ],
  }
}

describe('custom card loadouts', () => {
  it('says nothing to suggest when the stock loadout already fits', () => {
    const d = byId('aw-aquilon-rs2')
    const small: Show = {
      ...emptyShow(),
      sources: [{ id: 's', name: 'Laptop', connector: 'hdmi', count: 2, format: HD }],
      screens: [screen()],
    }
    expect(proposeLoadout(d, small).kind).toBe('stock-already-fits')
  })

  it('finds an SDI loadout for a show the stock Aquilon cannot take', () => {
    const d = byId('aw-aquilon-rs4')
    const show = sdiHeavyShow()

    // The stock chassis is all-HDMI on output and 4x SDI in: it must fail first.
    const stock = d.configs.find((c) => c.stock)!
    expect(evaluateConfig(d, stock, show).verdict).toBe('does-not-fit')

    const out = proposeLoadout(d, show)
    expect(out.kind).toBe('proposed')
    if (out.kind !== 'proposed') return

    expect(out.proposal.result.verdict).toBe('fits')
    expect(out.proposal.differsFromStock).toBe(true)

    // 12 SDI sources at 4 plugs a card is exactly 3 input cards, and 4 SDI
    // destinations is exactly 1 output card. Anything more is not minimal.
    const sdiIn = out.proposal.inputCards.find((c) => c.card.id === 'aq-in-12gsdi')
    expect(sdiIn?.count).toBe(3)
    const sdiOut = out.proposal.outputCards.find((c) => c.card.id === 'aq-out-12gsdi')
    expect(sdiOut?.count).toBe(1)
  })

  it('never proposes more cards than the chassis has slots for', () => {
    const d = byId('aw-aquilon-rs1')
    const out = proposeLoadout(d, sdiHeavyShow())
    if (out.kind !== 'proposed') return
    const { slotsUsed, slotsAvailable } = out.proposal
    expect(slotsUsed.input).toBeLessThanOrEqual(slotsAvailable.input + slotsAvailable.either)
    expect(slotsUsed.output).toBeLessThanOrEqual(slotsAvailable.output + slotsAvailable.either)
  })

  it('specifies the smallest card that does the job, not the most capable', () => {
    // One HDMI source: a four-connector HDMI card, not a six-connector
    // multi-format one that happens to have an HDMI plug on it.
    const d = byId('barco-e2-gen1')
    const show: Show = {
      ...emptyShow(),
      sources: [{ id: 's', name: 'PC', connector: 'hdmi', count: 1, format: HD }],
      screens: [
        screen({
          canvas: { hActive: 2560, vActive: 1600, refreshHz: 60 },
          destinations: [
            {
              id: 'd',
              name: 'Big display',
              format: { hActive: 2560, vActive: 1600, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
              connector: 'hdmi',
              count: 6,
            },
          ],
        }),
      ],
    }
    const out = proposeLoadout(d, show)
    if (out.kind !== 'proposed') return
    const inCard = out.proposal.inputCards[0]
    expect(inCard.count).toBe(1)
    expect(inCard.card.ports.length).toBeLessThanOrEqual(4)
  })

  it('prefers one card type over a mixture when both fit in the same slot count', () => {
    const d = byId('aw-aquilon-rs4')
    const out = proposeLoadout(d, sdiHeavyShow())
    if (out.kind !== 'proposed') return
    // Nothing but SDI is asked for, so nothing but SDI should be specified.
    expect(out.proposal.inputCards).toHaveLength(1)
    expect(out.proposal.outputCards).toHaveLength(1)
  })

  it('keeps the multiviewer plugs, which belong to the chassis and not a card', () => {
    const d = byId('aw-aquilon-rs4')
    const show = {
      ...sdiHeavyShow(),
      multiviewers: [{ id: 'mv', name: 'Rack', connector: 'hdmi' as const, count: 1, format: HD }],
    }
    const out = proposeLoadout(d, show)
    expect(out.kind).toBe('proposed')
    if (out.kind !== 'proposed') return
    const mv = out.proposal.config.ports.filter((p) => p.roles?.includes('multiviewer'))
    expect(mv.length).toBeGreaterThan(0)
    expect(out.proposal.result.verdict).toBe('fits')
  })

  it('reports honestly when no arrangement of cards is enough', () => {
    const d = byId('aw-aquilon-rs1')
    const huge: Show = {
      ...emptyShow(),
      // 64 SDI sources exceeds any RS1 loadout: 4 input slots x 4 plugs = 16.
      sources: [{ id: 'cam', name: 'Cameras', connector: 'sdi', count: 64, format: HD_SDI }],
      screens: [screen()],
    }
    const out = proposeLoadout(d, huge)
    expect(out.kind).toBe('no-loadout-fits')
  })

  it('searches the Event Master chassis now their card catalogue is known', () => {
    for (const id of ['barco-e2-gen1', 'barco-e2-gen2', 'barco-encore3', 'barco-s3-standalone']) {
      expect(whyNoLoadout(byId(id)), `${id} should be searchable`).toBeNull()
    }
  })

  it('offers ENCORE3 only Gen 2 cards, which is all it takes', () => {
    const d = byId('barco-encore3')
    const ids = (d.availableCards ?? []).map((c) => c.id)
    expect(ids.every((i) => i.endsWith('-g2'))).toBe(true)
    expect(ids.some((i) => i.endsWith('-g1'))).toBe(false)
  })

  /**
   * The four HDMI connectors on a Gen 1 output card are not equal: Barco rates
   * the top two at 297 MPix/s and the bottom two at 165. A model that treated
   * the card as four equal plugs would claim twice the 2560x1600 capability
   * the chassis has.
   */
  it('models the Gen 1 output card as two fast connectors and two slow', () => {
    const stock = byId('barco-e2-gen1').configs.find((c) => c.stock)!
    // Program outputs only — the two multiviewer plugs are a separate card.
    const hdmiOut = stock.ports.filter(
      (p) => p.direction === 'out' && p.kind === 'hdmi' && p.roles?.includes('program'),
    )
    const fast = hdmiOut.filter((p) => p.cap.maxPixelRateHz === 297e6)
    const slow = hdmiOut.filter((p) => p.cap.maxPixelRateHz === 165e6)
    // Eight HDMI outputs on two quad cards: four fast, four slow, not eight fast.
    expect(fast).toHaveLength(4)
    expect(slow).toHaveLength(4)
  })

  it('reaches for Gen 2 cards when they solve a Gen 1 chassis in fewer slots', () => {
    const d = byId('barco-e2-gen1')
    const wxga = { hActive: 2560, vActive: 1600, refreshHz: 60, bpc: 8 as const, sampling: 'rgb444' as const }
    const show: Show = {
      ...emptyShow(),
      sources: [{ id: 's', name: 'PC', connector: 'hdmi', count: 1, format: HD }],
      screens: [
        screen({
          canvas: { hActive: 2560, vActive: 1600, refreshHz: 60 },
          destinations: [{ id: 'd', name: 'Big display', format: wxga, connector: 'hdmi', count: 6 }],
        }),
      ],
    }
    // Stock has only four connectors fast enough, so it must miss.
    expect(evaluateConfig(d, d.configs.find((c) => c.stock)!, show).verdict).toBe('does-not-fit')

    const out = proposeLoadout(d, show)
    expect(out.kind).toBe('proposed')
    if (out.kind !== 'proposed') return

    // Gen 2 cards drop into a Gen 1 chassis, and two HDMI 2.0 quad cards give
    // eight full-rate outputs — better than the three Gen 1 cards it would
    // take, since each of those contributes only two fast connectors.
    const g2 = out.proposal.outputCards.find((c) => c.card.id === 'bem-out-hdmi20-quad-g2')
    expect(g2?.count).toBe(2)
    expect(out.proposal.outputCards).toHaveLength(1)

    // Every 2560x1600 feed lands somewhere that carries it.
    const outs = out.proposal.result.ports.assignments.filter((a) => a.demand.direction === 'out')
    expect(outs).toHaveLength(6)
    expect(outs.every((a) => a.port.cap.maxPixelRateHz >= 268.5e6)).toBe(true)
  })

  it('reaches for a Tri-combo card when a show wants SDI and a little of everything', () => {
    const d = byId('barco-e2-gen2')
    const show: Show = {
      ...emptyShow(),
      sources: [
        { id: 'cam', name: 'Cameras', connector: 'sdi', count: 20, format: HD_SDI },
      ],
      screens: [screen()],
    }
    const out = proposeLoadout(d, show)
    if (out.kind !== 'proposed') return
    const sdiPlugs = out.proposal.config.ports.filter(
      (p) => p.direction === 'in' && p.kind === 'sdi',
    ).length
    expect(sdiPlugs).toBeGreaterThanOrEqual(20)
  })

  it('says a fixed-connector switcher has no cards to choose', () => {
    const d = byId('aw-midra-pulse4k')
    expect(whyNoLoadout(d)).toMatch(/fixed connectors/)
  })

  it('marks a generated loadout as inferred, never documented', () => {
    const out = proposeLoadout(byId('aw-aquilon-rs4'), sdiHeavyShow())
    if (out.kind !== 'proposed') return
    expect(out.proposal.config.provenance?.confidence).toBe('inferred')
    expect(out.proposal.config.provenance?.notes.join(' ')).toMatch(/not a product/)
  })

  it('re-scopes PixelHue per-card layer capacity across the cards it proposes', () => {
    const d = byId('pixelhue-f8')
    const show: Show = {
      ...emptyShow(),
      sources: [{ id: 's', name: 'Cam', connector: 'sdi', count: 8, format: HD_SDI }],
      screens: [screen({ destinations: [{ id: 'd1', name: 'Wall', format: HD, connector: 'hdmi', count: 2 }] })],
    }
    const out = proposeLoadout(d, show)
    if (out.kind !== 'proposed') return
    const layerPool = out.proposal.config.pools.find((p) => p.id === 'layers')
    expect(layerPool?.scope).toBe('per-output-card')
    expect(layerPool?.capacity).toBe(2)
  })
})

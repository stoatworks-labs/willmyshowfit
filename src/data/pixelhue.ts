/**
 * PixelHue — F4 and F8 multi-screen presentation switchers.
 *
 * PixelHue is the one family in this database that budgets mixing layers **per
 * output card** rather than per system, which is why `PoolScope` exists at all:
 *
 *   "Each output card supports up to 8x SL mixing layers, 4x DL mixing layers
 *    or 2x 4K mixing layers."
 *
 * An F8 therefore advertises 16x 4K layers and still cannot put three 4K layers
 * on a screen living on one output card. The engine charges a screen's layers
 * to every output card carrying one of its destinations — see the note on
 * `retargetCardScopedDemands`, which explains why that rule is inferred.
 *
 * PixelHue publishes no standard card loadout for either chassis: they are sold
 * configured to order. The loadouts here are representative, marked `inferred`,
 * and exist so the chassis can be compared at all.
 */

import type { Card, DeviceConfig, Pool, Port } from '../lib/model/types.ts'
import type { VideoDevice } from '../lib/fit/evaluate.ts'
import { CAP, run } from './ports.ts'

const READ = '2026-08-20'
const PIXELHUE = 'PixelHue'

const cite = (claim: string, source: string, url: string) => ({ claim, source, url, read: READ })

const URLS = {
  f8: 'https://en-pixelhue001.oss-us-east-1.aliyuncs.com/Specifications/F8%20Seamless%20Switcher%20Specifications.pdf',
  f4: 'https://en-pixelhue001.oss-us-east-1.aliyuncs.com/Specifications/F4%20Seamless%20Switcher%20Specifications.pdf',
}

/**
 * PixelHue's own layer ladder, denominated here in 4K mixing layers.
 * "8x SL or 4x DL or 2x 4K" per output card gives SL = 1/4, DL = 1/2, 4K = 1.
 * The connector definitions give each class its size:
 *   SL = 2K1K@60, DL = 4K1K@60, 4K = 4K2K@60.
 */
const PH_LAYER_CLASSES = [
  { id: 'sl', label: 'SL layer (up to 2K1K@60)', maxPixelRate: 2048 * 1080 * 60, cost: 0.25 },
  { id: 'dl', label: 'DL layer (up to 4K1K@60)', maxPixelRate: 4096 * 1080 * 60, cost: 0.5 },
  { id: '4k', label: '4K layer (up to 4K2K@60)', maxPixelRate: 4096 * 2160 * 60, cost: 1 },
]

/** The published I/O module catalogue, shared by both chassis. */
const PH_CARDS: Card[] = [
  {
    id: 'ph-in-4k',
    label: '4K HDMI 2.0 / DP 1.2 Input Card',
    slot: 'input',
    ports: [
      { kind: 'hdmi', label: 'HDMI 2.0', direction: 'in', cap: CAP.hdmi20() },
      { kind: 'displayport', label: 'DisplayPort 1.2', direction: 'in', cap: CAP.dp12() },
    ],
  },
  {
    id: 'ph-in-4k-dual',
    label: 'Dual 4K HDMI 2.0 / DP 1.2 Input Card',
    slot: 'input',
    ports: [
      { kind: 'hdmi', label: 'HDMI 2.0', direction: 'in', cap: CAP.hdmi20() },
      { kind: 'hdmi', label: 'HDMI 2.0', direction: 'in', cap: CAP.hdmi20() },
      { kind: 'displayport', label: 'DisplayPort 1.2', direction: 'in', cap: CAP.dp12() },
      { kind: 'displayport', label: 'DisplayPort 1.2', direction: 'in', cap: CAP.dp12() },
    ],
  },
  {
    id: 'ph-in-sdi',
    label: '3G-SDI Quad Input Card',
    slot: 'input',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'sdi' as const,
      label: '3G-SDI',
      direction: 'in' as const,
      cap: CAP.sdi3g(),
    })),
  },
  {
    id: 'ph-in-dvi',
    label: 'SL-DVI Quad Input Card',
    slot: 'input',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'dvi' as const,
      label: 'Single-link DVI',
      direction: 'in' as const,
      cap: CAP.dviSingle(),
    })),
  },
  {
    id: 'ph-in-dp11',
    label: 'DP 1.1 Quad Input Card',
    slot: 'input',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'displayport' as const,
      label: 'DisplayPort 1.1',
      direction: 'in' as const,
      cap: CAP.dp11(),
    })),
  },
  {
    id: 'ph-out-4k',
    label: '4K HDMI 2.0 / OPT Output Card',
    slot: 'output',
    ports: [
      { kind: 'hdmi', label: 'HDMI 2.0', direction: 'out', cap: CAP.hdmi20() },
      { kind: 'fiber', label: '10G OPT', direction: 'out', cap: CAP.sfpPlus() },
    ],
  },
  {
    id: 'ph-out-dvi',
    label: 'DVI (HDMI 1.4) Quad Output Card',
    slot: 'output',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'dvi' as const,
      label: 'DVI (HDMI 1.4)',
      direction: 'out' as const,
      cap: CAP.dviSingle(),
    })),
  },
]

/** One output card's worth of layer budget, scoped to that card. */
function cardLayerPool(): Pool {
  return {
    id: 'layers',
    label: 'Mixing layers per output card',
    capacity: 2,
    unit: '4K mixing layers',
    scope: 'per-output-card',
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          '"Each output card supports up to 8x SL mixing layers, 4x DL mixing layers or 2x 4K mixing layers."',
          'PixelHue, F8 Seamless Switcher Specifications, "Layers"',
          URLS.f8,
        ),
      ],
      notes: [
        'This is a per-card budget, not a system one. The headline system figure (16x 4K on the F8) is simply this number times the output card count, and it is only reachable when the layers are spread evenly across cards.',
      ],
    },
  }
}

function pixelhue(opts: {
  id: string
  model: string
  inputSlots: number
  outputSlots: number
  maxInputs: number
  maxOutputs: number
  system4kLayers: number
  slotNote: string
  url: string
}): VideoDevice {
  // Representative loadout: 4K cards on half the input slots, SDI and DVI on
  // the rest, 4K output cards throughout.
  const ports: Port[] = []
  const cards: DeviceConfig['cards'] = []

  const fourKInputCards = Math.ceil(opts.inputSlots / 2)
  const sdiInputCards = opts.inputSlots - fourKInputCards
  let n = 1
  for (let c = 0; c < fourKInputCards; c++) {
    const cardId = `in-${c + 1}`
    ports.push(
      ...run('IN-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 2, 'in', { cardId, from: n }),
      ...run('IN-DP', 'displayport', 'DisplayPort 1.2', CAP.dp12(), 2, 'in', { cardId, from: n }),
    )
    n += 2
  }
  cards.push({ cardId: 'ph-in-4k-dual', count: fourKInputCards })
  let s = 1
  for (let c = 0; c < sdiInputCards; c++) {
    const cardId = `in-${fourKInputCards + c + 1}`
    ports.push(...run('IN-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 4, 'in', { cardId, from: s }))
    s += 4
  }
  if (sdiInputCards > 0) cards.push({ cardId: 'ph-in-sdi', count: sdiInputCards })

  let o = 1
  for (let c = 0; c < opts.outputSlots; c++) {
    const cardId = `out-${c + 1}`
    ports.push(
      ...run('OUT-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 2, 'out', {
        cardId,
        from: o,
        roles: ['program', 'aux'],
      }),
    )
    o += 2
  }
  cards.push({ cardId: 'ph-out-4k', count: opts.outputSlots })

  ports.push(
    ...run('MVR', 'hdmi', 'HDMI 1.3 (Multiviewer, 1920x1080p60 fixed)', CAP.hdmi14(165e6), 2, 'out', {
      roles: ['multiviewer'],
    }),
  )

  return {
    id: opts.id,
    vendor: PIXELHUE,
    family: 'F Series',
    model: opts.model,
    profile: 'video',
    slots: { input: opts.inputSlots, output: opts.outputSlots, either: 0 },
    availableCards: PH_CARDS,
    configs: [
      {
        id: 'representative',
        label: `Representative loadout (${fourKInputCards}x dual-4K + ${sdiInputCards}x SDI in, ${opts.outputSlots}x 4K out)`,
        stock: false,
        ports,
        cards,
        pools: [
          cardLayerPool(),
          {
            id: 'input-plugs',
            label: 'Input connectors',
            capacity: opts.maxInputs,
            unit: 'plugs',
            scope: 'system',
          },
          {
            id: 'output-plugs',
            label: 'Output connectors',
            capacity: opts.maxOutputs,
            unit: 'plugs',
            scope: 'system',
          },
        ],
        provenance: {
          confidence: 'inferred',
          citations: [],
          notes: [
            'PixelHue does not publish a standard card loadout for this chassis — it is configured to order. This loadout is a plausible general-purpose fill of the published slot count, chosen so the chassis can be compared against the others at all. Treat the connector mix as an example, not a product.',
          ],
        },
      },
    ],
    rules: {
      layerCosting: { poolId: 'layers', classes: PH_LAYER_CLASSES, splitFactor: 0.5 },
      liveBackground: true,
      maxScreens: opts.outputSlots * 2,
      auxLayers: 'from-pool',
    },
    caveats: [
      `Mixing layers on the ${opts.model} are budgeted per output card (2x 4K, 4x DL or 8x SL each), not across the chassis. The system figure of ${opts.system4kLayers}x 4K layers is only reachable spread evenly across all ${opts.outputSlots} output cards.`,
      'This tool charges a screen\'s layers to every output card feeding it. PixelHue does not publish what happens to a screen spanning two cards, so a wide screen may be reported as needing more layer resource than it really does.',
      opts.slotNote,
      'Cards may only go in their designated slots — "installing a card into an incorrect slot will cause device failure". Any custom loadout must be checked against PixelHue\'s slot diagram.',
    ],
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          `"${opts.model} is designed with ${opts.inputSlots} input slots and ${opts.outputSlots} output slots" and supports "at most ${opts.system4kLayers * 4}x SL mix layers, or ${opts.system4kLayers * 2}x DL mix layers or ${opts.system4kLayers}x 4K mix layers"`,
          `PixelHue, ${opts.model} Seamless Switcher Specifications`,
          opts.url,
        ),
      ],
      notes: [],
    },
  }
}

export const PIXELHUE_DEVICES: VideoDevice[] = [
  pixelhue({
    id: 'pixelhue-f4',
    model: 'F4',
    inputSlots: 8,
    outputSlots: 6,
    maxInputs: 32,
    maxOutputs: 24,
    system4kLayers: 12,
    slotNote:
      'PixelHue publishes the F4 as 8 input slots and 6 output slots, which matches its 12x 4K layer figure at 2 per output card.',
    url: URLS.f4,
  }),
  pixelhue({
    id: 'pixelhue-f8',
    model: 'F8',
    inputSlots: 8,
    outputSlots: 8,
    maxInputs: 32,
    maxOutputs: 32,
    system4kLayers: 16,
    slotNote:
      "⚠️ PixelHue's own F8 datasheet disagrees with itself on output slots: the body copy says 8 input and 8 output cards (which matches both the 32-output maximum and the 16x 4K layer figure at 2 per card), while the card-layout diagram on a later page is labelled 6 output slots. Eight is used here because two independent figures agree on it; confirm against the chassis before ordering.",
    url: URLS.f8,
  }),
]

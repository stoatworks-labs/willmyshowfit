/**
 * Analog Way — Midra 4K, Alta 4K and LivePremier (Aquilon).
 *
 * RULES FOR EDITING, and they are not negotiable:
 *
 *  1. Every `documented` figure carries a citation naming the document it was
 *     read from, not "the vendor website".
 *  2. Layer costs are the vendor's own arithmetic. Analog Way charges a 4K
 *     mixing layer twice what it charges a DL/2K one because that is what its
 *     spec sheets say ("Up to 8x 4K or 16x DL/2K mixing layers"). Do not
 *     "improve" that into a pixel-count ratio.
 *  3. Nothing in this file has been checked against hardware. It is paperwork.
 */

import type { Card, DeviceConfig, Pool } from '../lib/model/types.ts'
import type { VideoDevice } from '../lib/fit/evaluate.ts'
import { CAP, mirrored, run, selectOne } from './ports.ts'

const READ = '2026-08-20'
const AW = 'Analog Way'

const cite = (claim: string, source: string, url: string) => ({ claim, source, url, read: READ })

// ============================================================== Midra 4K

const MIDRA_MANUAL =
  'https://impact-even.com/userfiles/files/telechargement/video/analogway_pls4k_manuel.pdf'

/**
 * Every Midra 4K model has identical plugs; only the operating modes differ.
 * Manual v3.1, "Inputs and Outputs", Table 1 - Midra 4K family.
 */
function midraPorts(): DeviceConfig['ports'] {
  return [
    // Inputs 1 & 2: one multi-plug each, HDMI 1.4 *or* 3G-SDI, not both.
    ...selectOne('IN 1', [
      { id: 'IN 1 (HDMI)', kind: 'hdmi', label: 'HDMI 1.4', direction: 'in', cap: CAP.hdmi14() },
      { id: 'IN 1 (SDI)', kind: 'sdi', label: '3G-SDI', direction: 'in', cap: CAP.sdi3g() },
    ]),
    ...selectOne('IN 2', [
      { id: 'IN 2 (HDMI)', kind: 'hdmi', label: 'HDMI 1.4', direction: 'in', cap: CAP.hdmi14() },
      { id: 'IN 2 (SDI)', kind: 'sdi', label: '3G-SDI', direction: 'in', cap: CAP.sdi3g() },
    ]),
    ...run('IN', 'sdi', '12G-SDI', CAP.sdi12g(), 2, 'in', { from: 3 }),
    ...run('IN', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 4, 'in', { from: 5 }),
    ...run('IN', 'displayport', 'DisplayPort 1.2', CAP.dp12(), 2, 'in', { from: 9 }),
    // Outputs 1 & 2: HDMI and 12G-SDI carrying identical content.
    ...mirrored('OUT 1', [
      {
        id: 'OUT 1 (HDMI)',
        kind: 'hdmi',
        label: 'HDMI 2.0',
        direction: 'out',
        cap: CAP.hdmi20(),
        roles: ['program', 'aux'],
      },
      {
        id: 'OUT 1 (SDI)',
        kind: 'sdi',
        label: '12G-SDI',
        direction: 'out',
        cap: CAP.sdi12g(),
        roles: ['program', 'aux'],
      },
    ]),
    ...mirrored('OUT 2', [
      {
        id: 'OUT 2 (HDMI)',
        kind: 'hdmi',
        label: 'HDMI 2.0',
        direction: 'out',
        cap: CAP.hdmi20(),
        roles: ['program', 'aux'],
      },
      {
        id: 'OUT 2 (SDI)',
        kind: 'sdi',
        label: '12G-SDI',
        direction: 'out',
        cap: CAP.sdi12g(),
        roles: ['program', 'aux'],
      },
    ]),
    ...mirrored('MVR', [
      {
        id: 'MVR (HDMI)',
        kind: 'hdmi',
        label: 'HDMI 2.0',
        direction: 'out',
        cap: CAP.hdmi20(),
        roles: ['multiviewer'],
      },
      {
        id: 'MVR (SDI)',
        kind: 'sdi',
        label: '12G-SDI',
        direction: 'out',
        cap: CAP.sdi12g(),
        roles: ['multiviewer'],
      },
    ]),
  ]
}

const MIDRA_4K_LAYER_CLASS = {
  id: '4k',
  label: '4K mixing layer',
  maxPixelRate: 4096 * 2160 * 60,
  cost: 1,
}

/** A Midra layer pool, scoped per screen because the modes allocate per output. */
function midraLayerPool(capacity: number): Pool {
  return {
    id: 'layers',
    label: 'Mixing layers',
    capacity,
    unit: 'mixing layers',
    scope: 'per-screen',
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          'Table 1 - Midra 4K family: per-model layer counts per output, e.g. Pulse 4K Mixer mode "2 ML or 4 SL"',
          'Analog Way, USER MANUAL Midra 4K unit (V3.1), section 4 "Introducing Midra 4K"',
          MIDRA_MANUAL,
        ),
      ],
      notes: ['ML = mixing layer, SL = split layer. Two split layers cost one mixing layer.'],
    },
  }
}

const MIDRA_PROV = {
  confidence: 'documented' as const,
  citations: [
    cite(
      'All models have the same input and output plugs: IN1&2 HDMI 1.4 or 3G-SDI multi-plug, IN3&4 12G-SDI, IN5-8 HDMI 2.0, IN9&10 DisplayPort 1.2, OUT1&2 HDMI 2.0 + 12G-SDI multi-plug, Multiviewer HDMI 2.0 + 12G-SDI',
      'Analog Way, USER MANUAL Midra 4K unit (V3.1), "Inputs and Outputs"',
      MIDRA_MANUAL,
    ),
  ],
  notes: [
    'The two plugs of an output can be used at the same time and carry identical content, so a Midra output is one resource with two connectors — not two outputs.',
  ],
}

function midra(
  id: string,
  model: string,
  configs: DeviceConfig[],
  liveBackground: boolean,
  caveats: string[],
): VideoDevice {
  return {
    id,
    vendor: AW,
    family: 'Midra 4K',
    model,
    profile: 'video',
    configs,
    rules: {
      layerCosting: { poolId: 'layers', classes: [MIDRA_4K_LAYER_CLASS], splitFactor: 0.5 },
      liveBackground,
      maxScreens: configs[0].id.startsWith('matrix') ? 2 : 1,
    },
    caveats,
    provenance: MIDRA_PROV,
  }
}

function midraConfig(id: string, label: string, layers: number, screens: number): DeviceConfig {
  return {
    id,
    label,
    stock: true,
    ports: midraPorts(),
    pools: [
      midraLayerPool(layers),
      {
        id: 'screens',
        label: 'Screens',
        capacity: screens,
        unit: 'screens',
        scope: 'system',
      },
    ],
  }
}

const MIDRA_DEVICES: VideoDevice[] = [
  midra(
    'aw-midra-quickvu4k',
    'QuickVu 4K',
    [midraConfig('mixer', 'Mixer mode (Screen + Aux)', 1, 1)],
    false,
    [
      'QuickVu 4K is Mixer mode only: one Screen plus one Aux screen, and Output 2 is always the Aux. It cannot run two independent program screens.',
      'Backgrounds on this model can only be still images, not live inputs.',
    ],
  ),
  midra(
    'aw-midra-quickmatrix4k',
    'QuickMatrix 4K',
    [midraConfig('matrix', 'Matrix mode (two Screens)', 1, 2)],
    false,
    [
      'QuickMatrix 4K is Matrix mode only: two Screens and no Aux screen.',
      'Backgrounds on this model can only be still images, not live inputs.',
    ],
  ),
  midra(
    'aw-midra-pulse4k',
    'Pulse 4K',
    [
      midraConfig('mixer', 'Mixer mode (Screen + Aux)', 2, 1),
      midraConfig('matrix', 'Matrix mode (two Screens)', 1, 2),
    ],
    true,
    ['Mixer mode gives one screen two mixing layers; Matrix mode gives two screens one each.'],
  ),
  midra(
    'aw-midra-eikos4k',
    'Eikos 4K',
    [
      midraConfig('mixer', 'Mixer mode (Screen + Aux)', 2, 1),
      midraConfig('matrix', 'Matrix mode (two Screens)', 1, 2),
      midraConfig('blend', 'Blend mode (one edge-blended screen)', 2, 1),
    ],
    true,
    [
      'Blend mode joins both outputs into one edge-blended widescreen and is the only Midra 4K mode that does so.',
    ],
  ),
]

// ============================================================== Alta 4K

const ALTA_URL = 'https://www.analogway.com/alta-4k-presentation-switchers'

const ALTA_LAYER_CLASSES = [
  { id: 'split', label: '4K split layer', maxPixelRate: 4096 * 2160 * 60, cost: 0.5 },
  { id: '4k', label: '4K mixing layer', maxPixelRate: 4096 * 2160 * 60, cost: 1 },
]

function altaDevice(
  id: string,
  model: string,
  opts: {
    hdmiIn: number
    dpIn: number
    sdiIn: number
    selectIn: number
    outputsWithSfp: number
    outputsPlain: number
    mixingLayers: number
    programOutputs: number
  },
): VideoDevice {
  const ports: DeviceConfig['ports'] = [
    ...run('IN', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), opts.hdmiIn, 'in'),
    ...run('IN-DP', 'displayport', 'DisplayPort 1.2', CAP.dp12(), opts.dpIn, 'in'),
    ...run('IN-SDI', 'sdi', '12G-SDI', CAP.sdi12g(), opts.sdiIn, 'in'),
  ]
  // The 2K60 inputs are a user-selectable HDMI *or* SDI multi-plug pair.
  for (let i = 1; i <= opts.selectIn; i++) {
    ports.push(
      ...selectOne(`IN-2K ${i}`, [
        {
          id: `IN-2K ${i} (HDMI)`,
          kind: 'hdmi',
          label: 'HDMI (2K60)',
          direction: 'in',
          cap: { ...CAP.hdmi14(), maxPixelRateHz: 165e6 },
        },
        {
          id: `IN-2K ${i} (SDI)`,
          kind: 'sdi',
          label: '3G-SDI (2K60)',
          direction: 'in',
          cap: CAP.sdi3g(),
        },
      ]),
    )
  }
  let outIndex = 1
  for (let i = 0; i < opts.outputsWithSfp; i++, outIndex++) {
    ports.push(
      ...mirrored(`OUT ${outIndex}`, [
        {
          id: `OUT ${outIndex} (HDMI)`,
          kind: 'hdmi',
          label: 'HDMI 2.0',
          direction: 'out',
          cap: CAP.hdmi20(),
          roles: ['program', 'aux'],
        },
        {
          id: `OUT ${outIndex} (SDI)`,
          kind: 'sdi',
          label: '12G-SDI',
          direction: 'out',
          cap: CAP.sdi12g(),
          roles: ['program', 'aux'],
        },
        {
          id: `OUT ${outIndex} (SFP+)`,
          kind: 'sfp',
          label: 'SFP+',
          direction: 'out',
          cap: CAP.sfpPlus(),
          roles: ['program', 'aux'],
        },
      ]),
    )
  }
  for (let i = 0; i < opts.outputsPlain; i++, outIndex++) {
    ports.push(
      ...mirrored(`OUT ${outIndex}`, [
        {
          id: `OUT ${outIndex} (HDMI)`,
          kind: 'hdmi',
          label: 'HDMI 2.0',
          direction: 'out',
          cap: CAP.hdmi20(),
          roles: ['program', 'aux'],
        },
        {
          id: `OUT ${outIndex} (SDI)`,
          kind: 'sdi',
          label: '12G-SDI',
          direction: 'out',
          cap: CAP.sdi12g(),
          roles: ['program', 'aux'],
        },
      ]),
    )
  }
  ports.push(
    ...run('MVR', 'hdmi', 'HDMI 2.0 (Multiviewer)', CAP.hdmi20(), 1, 'out', {
      roles: ['multiviewer'],
    }),
  )

  return {
    id,
    vendor: AW,
    family: 'Alta 4K',
    model,
    profile: 'video',
    configs: [
      {
        id: 'standard',
        label: 'Standard',
        stock: true,
        ports,
        pools: [
          {
            id: 'layers',
            label: 'Mixing layers',
            capacity: opts.mixingLayers,
            unit: '4K mixing layers',
            scope: 'system',
            provenance: {
              confidence: 'documented',
              citations: [
                cite(
                  `${model}: "Up to ${opts.mixingLayers * 2}x 4K split layers (or ${opts.mixingLayers}x 4K mixing layers)"`,
                  'Analog Way, Alta 4K presentation switchers product page',
                  ALTA_URL,
                ),
              ],
              notes: [],
            },
          },
          {
            id: 'screens',
            label: 'Program screens',
            capacity: opts.programOutputs,
            unit: 'screens',
            scope: 'system',
          },
        ],
      },
    ],
    rules: {
      layerCosting: { poolId: 'layers', classes: ALTA_LAYER_CLASSES, splitFactor: 0.5 },
      liveBackground: true,
      maxScreens: opts.programOutputs,
    },
    caveats: [
      'Alta 4K outputs are mirrored plugs: HDMI 2.0, 12G-SDI and (on some outputs) SFP+ all carry the same picture, so they are one output each, not two or three.',
    ],
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          `${model} input and output connector counts and layer capacity`,
          'Analog Way, Alta 4K presentation switchers product page',
          ALTA_URL,
        ),
      ],
      notes: [
        'The 4K60 input plug counts (8x HDMI 2.0, 4x DP 1.2, 2x 12G-SDI) are as published for the series. Analog Way publishes the same connector breakdown for both models while quoting different input totals, so the Zenith 100 breakdown here is the series figure and may over-state that model — treat the Zenith 100 plug mix as inferred until a datasheet confirms it.',
      ],
    },
  }
}

const ALTA_DEVICES: VideoDevice[] = [
  altaDevice('aw-alta-zenith100', 'Zenith 100', {
    hdmiIn: 8,
    dpIn: 4,
    sdiIn: 2,
    selectIn: 2,
    outputsWithSfp: 2,
    outputsPlain: 2,
    mixingLayers: 3,
    programOutputs: 3,
  }),
  altaDevice('aw-alta-zenith200', 'Zenith 200', {
    hdmiIn: 8,
    dpIn: 4,
    sdiIn: 2,
    selectIn: 2,
    outputsWithSfp: 4,
    outputsPlain: 2,
    mixingLayers: 4,
    programOutputs: 4,
  }),
]

// ============================================== LivePremier (Aquilon)

const aqUrl = (m: string) =>
  `https://s3.eu-west-3.amazonaws.com/aw.store01/Site+Internet/Series/LivePremier/Products/Aquilon+${m}/Technical+Datasheet/Aquilon-${m}-datasheet-en.pdf`

/**
 * LivePremier layer arithmetic, from the datasheets' own wording:
 * "Up to 8x 4K or 16x Dual/2K mixing layers per system (x2 if split layers)".
 * So the pool is denominated in 4K mixing layers, a Dual/2K layer costs half,
 * and a split layer costs half again.
 */
const AQ_LAYER_CLASSES = [
  { id: '2k', label: 'Dual/2K mixing layer', maxPixelRate: 2048 * 1200 * 60, cost: 0.5 },
  { id: '4k', label: '4K mixing layer', maxPixelRate: 4096 * 2160 * 60, cost: 1 },
]

/** Field-swappable I/O cards, the same catalogue across the LivePremier range. */
const AQ_CARDS: Card[] = [
  {
    id: 'aq-in-hdmi20',
    label: '4x HDMI 2.0 input card',
    slot: 'input',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'hdmi' as const,
      label: 'HDMI 2.0',
      direction: 'in' as const,
      cap: CAP.hdmi20(),
    })),
  },
  {
    id: 'aq-in-dp12',
    label: '4x DisplayPort 1.2 input card',
    slot: 'input',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'displayport' as const,
      label: 'DisplayPort 1.2',
      direction: 'in' as const,
      cap: CAP.dp12(),
    })),
  },
  {
    id: 'aq-in-12gsdi',
    label: '4x 12G-SDI input card',
    slot: 'input',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'sdi' as const,
      label: '12G-SDI',
      direction: 'in' as const,
      cap: CAP.sdi12g(),
    })),
  },
  {
    id: 'aq-in-hdmi14x8',
    label: '8x HDMI 1.4 input card',
    slot: 'input',
    ports: Array.from({ length: 8 }, () => ({
      kind: 'hdmi' as const,
      label: 'HDMI 1.4',
      direction: 'in' as const,
      cap: { ...CAP.hdmi14(), maxPixelRateHz: 300e6 },
    })),
  },
  {
    id: 'aq-out-hdmi20',
    label: '4x HDMI 2.0 output card',
    slot: 'output',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'hdmi' as const,
      label: 'HDMI 2.0',
      direction: 'out' as const,
      cap: CAP.hdmi20(),
      roles: ['program', 'aux'] as const as Card['ports'][number]['roles'],
    })),
  },
  {
    id: 'aq-out-dp12',
    label: '4x DisplayPort 1.2 output card',
    slot: 'output',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'displayport' as const,
      label: 'DisplayPort 1.2',
      direction: 'out' as const,
      cap: CAP.dp12(),
      roles: ['program', 'aux'] as const as Card['ports'][number]['roles'],
    })),
  },
  {
    id: 'aq-out-12gsdi',
    label: '4x 12G-SDI output card',
    slot: 'output',
    ports: Array.from({ length: 4 }, () => ({
      kind: 'sdi' as const,
      label: '12G-SDI',
      direction: 'out' as const,
      cap: CAP.sdi12g(),
      roles: ['program', 'aux'] as const as Card['ports'][number]['roles'],
    })),
  },
]

interface AquilonSpec {
  id: string
  model: string
  /** Stock input plug mix. */
  hdmiIn: number
  dpIn: number
  sdiIn: number
  /** Stock output plugs, all HDMI 2.0 on the RS line. */
  hdmiOut: number
  mixingLayers4k: number
  megapixels: number
  rackUnits: number
  stillChannels: number
}

const AQUILON_RS: AquilonSpec[] = [
  { id: 'aw-aquilon-rsalpha', model: 'Aquilon RS alpha', hdmiIn: 8, dpIn: 0, sdiIn: 0, hdmiOut: 4, mixingLayers4k: 4, megapixels: 40, rackUnits: 4, stillChannels: 12 },
  { id: 'aw-aquilon-rs1', model: 'Aquilon RS1', hdmiIn: 8, dpIn: 4, sdiIn: 4, hdmiOut: 8, mixingLayers4k: 4, megapixels: 40, rackUnits: 4, stillChannels: 12 },
  { id: 'aw-aquilon-rs2', model: 'Aquilon RS2', hdmiIn: 8, dpIn: 4, sdiIn: 4, hdmiOut: 12, mixingLayers4k: 8, megapixels: 80, rackUnits: 4, stillChannels: 12 },
  { id: 'aw-aquilon-rs3', model: 'Aquilon RS3', hdmiIn: 12, dpIn: 8, sdiIn: 4, hdmiOut: 12, mixingLayers4k: 8, megapixels: 80, rackUnits: 5, stillChannels: 24 },
  { id: 'aw-aquilon-rs4', model: 'Aquilon RS4', hdmiIn: 12, dpIn: 8, sdiIn: 4, hdmiOut: 16, mixingLayers4k: 12, megapixels: 120, rackUnits: 5, stillChannels: 24 },
  { id: 'aw-aquilon-rs5', model: 'Aquilon RS5', hdmiIn: 16, dpIn: 8, sdiIn: 8, hdmiOut: 16, mixingLayers4k: 12, megapixels: 120, rackUnits: 6, stillChannels: 24 },
  { id: 'aw-aquilon-rs6', model: 'Aquilon RS6', hdmiIn: 16, dpIn: 8, sdiIn: 8, hdmiOut: 20, mixingLayers4k: 16, megapixels: 160, rackUnits: 6, stillChannels: 24 },
]

function aquilon(spec: AquilonSpec): VideoDevice {
  const suffix = spec.model.replace('Aquilon ', '').replace(' ', '-')
  const url = aqUrl(spec.model === 'Aquilon RS alpha' ? 'RS+alpha' : suffix)

  const ports: DeviceConfig['ports'] = [
    ...run('IN', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), spec.hdmiIn, 'in'),
    ...run('IN-DP', 'displayport', 'DisplayPort 1.2', CAP.dp12(), spec.dpIn, 'in'),
    ...run('IN-SDI', 'sdi', '12G-SDI', CAP.sdi12g(), spec.sdiIn, 'in'),
    ...run('OUT', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), spec.hdmiOut, 'out', {
      roles: ['program', 'aux'],
    }),
    ...run('MVR', 'hdmi', 'HDMI 2.0 (Multiviewer)', CAP.hdmi20(), 2, 'out', {
      roles: ['multiviewer'],
    }),
  ]

  return {
    id: spec.id,
    vendor: AW,
    family: 'LivePremier',
    model: spec.model,
    profile: 'video',
    slots: { input: spec.hdmiIn / 4 + spec.dpIn / 4 + spec.sdiIn / 4, output: spec.hdmiOut / 4, either: 0 },
    availableCards: AQ_CARDS,
    configs: [
      {
        id: 'stock',
        label: `Stock loadout (${spec.rackUnits}RU)`,
        stock: true,
        ports,
        pools: [
          {
            id: 'layers',
            label: 'Mixing layers',
            capacity: spec.mixingLayers4k,
            unit: '4K mixing layers',
            scope: 'system',
            alternates: [
              {
                id: 'split',
                label: 'split-layer mode',
                capacity: spec.mixingLayers4k * 2,
                tradeoff:
                  'split layers cut or fade to black instead of cross-fading, so a layer cannot seamlessly change source',
              },
            ],
            provenance: {
              confidence: 'documented',
              citations: [
                cite(
                  `"Up to ${spec.mixingLayers4k}x 4K or ${spec.mixingLayers4k * 2}x Dual/2K mixing layers per system (x2 if split layers), depending on the screens setup"`,
                  `Analog Way, ${spec.model} technical datasheet, "LAYERS & BACKGROUND"`,
                  url,
                ),
              ],
              notes: [],
            },
          },
          {
            id: 'canvas',
            label: 'Program throughput',
            capacity: spec.megapixels,
            unit: 'megapixels',
            scope: 'system',
            provenance: {
              confidence: 'documented',
              citations: [
                cite(
                  `"${spec.megapixels} Megapixels throughput at 10-bit 4:4:4 on Program, without restricting Preview or Multiviewer"`,
                  `Analog Way, ${spec.model} technical datasheet, "Key features"`,
                  url,
                ),
              ],
              notes: [
                'Counted here as the sum of every screen canvas in megapixels. Analog Way states the figure at 60 Hz, so a canvas running slower than 60 Hz is charged the same as one at 60 Hz — conservative, and it will under-report headroom on a 30 Hz canvas.',
              ],
            },
          },
        ],
        cards: [
          { cardId: 'aq-in-hdmi20', count: spec.hdmiIn / 4 },
          ...(spec.dpIn ? [{ cardId: 'aq-in-dp12', count: spec.dpIn / 4 }] : []),
          ...(spec.sdiIn ? [{ cardId: 'aq-in-12gsdi', count: spec.sdiIn / 4 }] : []),
          { cardId: 'aq-out-hdmi20', count: spec.hdmiOut / 4 },
        ],
      },
    ],
    rules: {
      layerCosting: { poolId: 'layers', classes: AQ_LAYER_CLASSES, splitFactor: 0.5 },
      liveBackground: true,
      // "One unscaled background mixer per output" — screens are formed from
      // outputs, so the practical screen ceiling is the output count.
      maxScreens: spec.hdmiOut,
      // Documented outright on every LivePremier datasheet: "Ability to create
      // layers on AUX outputs without using processing resources (using
      // adjacent outputs to increase the layer count)". This is the only
      // family in the database that gets aux layers for free, and it is a real
      // reason to pick one for a show heavy on IMAG-with-graphics feeds.
      auxLayers: 'free',
      mixers: { total: 64, pixelsPerSlice: 4096 },
    },
    caveats: [
      'Every LivePremier I/O card is field-swappable, so this stock plug mix is a starting point rather than a fixed property of the chassis. A custom loadout may well fit a show this one does not.',
      'Layer capacity is stated "depending on the screens setup" — Analog Way allocates mixer resources per screen, so a show that spreads layers thinly across many screens can hit a wall before the headline number says it should.',
    ],
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          `${spec.model}: ${spec.hdmiIn + spec.dpIn + spec.sdiIn}x 4K60p inputs (${spec.hdmiIn}x HDMI 2.0${spec.dpIn ? `, ${spec.dpIn}x DP 1.2` : ''}${spec.sdiIn ? `, ${spec.sdiIn}x 12G-SDI` : ''}), ${spec.hdmiOut}x 4K60p active outputs (${spec.hdmiOut}x HDMI 2.0), 2x HDMI 2.0 multiviewer outputs`,
          `Analog Way, ${spec.model} technical datasheet, "INPUTS" / "OUTPUTS" / "MULTIVIEWER OUTPUTS"`,
          url,
        ),
      ],
      notes: [],
    },
  }
}

export const ANALOG_WAY_DEVICES: VideoDevice[] = [
  ...MIDRA_DEVICES,
  ...ALTA_DEVICES,
  ...AQUILON_RS.map(aquilon),
]

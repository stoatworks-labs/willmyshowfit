/**
 * Analog Way — the two lines that came before Midra 4K and LivePremier:
 * **Midra** (the pre-4K platform) and **LiveCore**.
 *
 * Both are discontinued and both are still everywhere in the rental market,
 * which is the reason they are here: the question "will my show fit" gets asked
 * about the box in the flight case far more often than about the one in the
 * brochure.
 *
 * RULES FOR EDITING, same as `analogway.ts` and equally not negotiable:
 *
 *  1. Every `documented` figure carries a citation naming the document.
 *  2. Layer counts are the vendor's own, per operating mode. Analog Way states
 *     these as "up to N layers on Still Background" and a *smaller* number on a
 *     live background; the number recorded is the still-background one and the
 *     caveat says what a live background costs. Do not average them.
 *  3. Nothing here has been checked against hardware. It is paperwork.
 *
 * ☠️ TWO TRAPS THIS FILE PAYS FOR, both of which cost real capability:
 *
 *  - **The Universal Analog plugs are deliberately absent.** Every Midra takes
 *    four HD15/DVI-A analog inputs and puts an analog plug on each output, and
 *    every LiveCore has eight or twelve more. The tool has no analog-video
 *    connector kind, so those plugs are not modelled at all — which means the
 *    plug counts here are lower than the vendor's headline. The vendor's own
 *    "10 digital input plugs" / "12 digital input plugs" subtotals are what is
 *    modelled, and they match exactly.
 *  - **A Midra input is a select-one multi-plug, not a set of inputs.** Input 3
 *    carries a DVI-D *and* an HDMI socket and only one of them can be live.
 *    Counting sockets makes an eight-input Pulse² look like a ten-input
 *    machine. Same trap as the Midra 4K inputs 1 & 2 in `analogway.ts`.
 */

import type { DeviceConfig, Pool, Port } from '../lib/model/types.ts'
import type { VideoDevice } from '../lib/fit/evaluate.ts'
import { CAP, mirrored, run, selectOne } from './ports.ts'

const READ = '2026-08-21'
const AW = 'Analog Way'

const cite = (claim: string, source: string, url: string) => ({ claim, source, url, read: READ })

// =========================================================== Midra (pre-4K)

/**
 * Datasheets, one per model. There is no single Midra manual covering the
 * family the way the Midra 4K manual does, so each model is cited to its own
 * sheet — except the family comparison table, which is printed on the Saphyr
 * and QuickVu sheets and covers all six models at once.
 */
const MIDRA_SHEETS = {
  quickvu: {
    source: 'Analog Way, QuickVu 3G technical datasheet (QVU150-3G)',
    url: 'http://legacy.theatrixx.com/media/video/analog-way/QUICKVU/downloads/quickvu-3g-datasheet-en.pdf',
  },
  quickmatrix: {
    source: 'Analog Way, QuickMatriX technical datasheet (QMX150)',
    url: 'https://avsupply.com/wp-content/uploads/2024/05/qmx150.pdf',
  },
  pulse2: {
    source: 'Analog Way, Pulse² technical datasheet (PLS350)',
    url: 'http://legacy.theatrixx.com/media/video/analog-way/PLS350/downloads/PLS350_Datasheet_English.pdf',
  },
  smartmatrix2: {
    source: 'Analog Way, SmartMatriX² technical datasheet (SMX250)',
    url: 'https://avsupply.com/wp-content/uploads/2024/05/smx250.pdf',
  },
  saphyr: {
    source: 'Analog Way, Saphyr technical datasheet (SPX450)',
    url: 'http://legacy.theatrixx.com/media/video/analog-way/SAPHYR/downloads/saphyr-datasheet-en.pdf',
  },
  eikos2: {
    source: 'Analog Way, Eikos² technical datasheet (EKS550)',
    url: 'https://s3.eu-west-3.amazonaws.com/aw.store01/Site+Internet/Series/Midra/Products/Eikos%C2%B2/Technical+Datasheet/eikos2-datasheet-en.pdf',
  },
} as const

/**
 * The Midra platform ceiling, and it is the number that decides most verdicts.
 *
 * Every Midra plug — in and out, digital and analog — is quoted at
 * "2048x1152@60Hz", and the Pulse² sheet gives the underlying figure as
 * "FpxMax = 165MHz". So a Midra is a single-link machine: 1080p60 and
 * 1920x1200 fit comfortably, 2560x1600 and anything 4K do not, and no operating
 * mode changes that.
 */
const MIDRA_MAX_HZ = 165e6

/** The largest thing a Midra layer can hold, in active pixels per second. */
const MIDRA_LAYER_CLASS = {
  id: '2k',
  label: '2K layer',
  maxPixelRate: 2048 * 1152 * 60,
  cost: 1,
}

/**
 * A Midra's inputs, as multi-plug select-one groups.
 *
 * Published identically on every sheet in the family, and the grouping is the
 * part that matters: DVI-D lives on inputs 1-4, HDMI on inputs 3-6, SDI on the
 * rest. Inputs 3 and 4 therefore carry two digital sockets each and can still
 * only take one signal.
 */
function midraLegacyInputs(inputs: 8 | 10): Port[] {
  const ports: Port[] = []
  for (let i = 1; i <= inputs; i++) {
    const plugs: Omit<Port, 'selectGroup'>[] = []
    if (i <= 4) {
      plugs.push({
        id: `IN ${i} (DVI-D)`,
        kind: 'dvi',
        label: 'DVI-D (HDMI compliant)',
        direction: 'in',
        cap: { ...CAP.dviSingle(), maxPixelRateHz: MIDRA_MAX_HZ },
      })
    }
    if (i >= 3 && i <= 6) {
      plugs.push({
        id: `IN ${i} (HDMI)`,
        kind: 'hdmi',
        label: 'HDMI',
        direction: 'in',
        cap: { ...CAP.hdmi14(), maxPixelRateHz: MIDRA_MAX_HZ },
      })
    }
    if (i >= 7) {
      plugs.push({
        id: `IN ${i} (SDI)`,
        kind: 'sdi',
        label: '3G/HD/SD-SDI',
        direction: 'in',
        cap: CAP.sdi3g(),
      })
    }
    ports.push(...selectOne(`IN ${i}`, plugs))
  }
  return ports
}

interface MidraOutputOpts {
  /** True when Output #2 is a preview rather than a second usable program feed. */
  out2Preview: boolean
  /** The separate 3G-SDI "video output", present on every model except QuickMatriX. */
  videoOut: boolean
}

function midraLegacyOutputs(opts: MidraOutputOpts): Port[] {
  const ports: Port[] = [
    ...run('OUT', 'dvi', 'DVI-I', { ...CAP.dviSingle(), maxPixelRateHz: MIDRA_MAX_HZ }, 1, 'out', {
      roles: ['program', 'aux'],
    }),
    ...run(
      'OUT',
      'dvi',
      'DVI-I',
      { ...CAP.dviSingle(), maxPixelRateHz: MIDRA_MAX_HZ },
      1,
      'out',
      { roles: opts.out2Preview ? ['multiviewer'] : ['program', 'aux'], from: 2 },
    ),
  ]
  if (opts.videoOut) {
    ports.push(
      ...run('VIDEO OUT', 'sdi', '3G-SDI (video out / program clone)', CAP.sdi3g(), 1, 'out', {
        roles: ['aux', 'multiviewer'],
      }),
    )
  }
  return ports
}

function midraLayerPool(capacity: number, sheet: { source: string; url: string }, claim: string): Pool {
  return {
    id: 'layers',
    label: 'Live layers',
    capacity,
    unit: 'layers',
    scope: 'per-screen',
    provenance: {
      confidence: 'documented',
      citations: [cite(claim, `${sheet.source}, "OPERATING MODES"`, sheet.url)],
      notes: [
        'Analog Way quotes a Midra layer count per operating mode and a lower one when the background is a live input rather than a still. The still-background figure is the one recorded; the device caveats say what a live background costs.',
      ],
    },
  }
}

interface MidraLegacySpec {
  id: string
  model: string
  sheet: { source: string; url: string }
  inputs: 8 | 10
  digitalPlugs: 10 | 12
  out2Preview: boolean
  videoOut: boolean
  liveBackground: boolean
  modes: { id: string; label: string; layers: number; screens: number; claim: string }[]
  caveats: string[]
}

function midraLegacy(spec: MidraLegacySpec): VideoDevice {
  const ports = [
    ...midraLegacyInputs(spec.inputs),
    ...midraLegacyOutputs({ out2Preview: spec.out2Preview, videoOut: spec.videoOut }),
  ]

  const configs: DeviceConfig[] = spec.modes.map((m) => ({
    id: m.id,
    label: m.label,
    stock: true,
    ports,
    pools: [
      midraLayerPool(m.layers, spec.sheet, m.claim),
      {
        id: 'input-plugs',
        label: 'Seamless inputs',
        capacity: spec.inputs,
        unit: 'inputs',
        scope: 'system',
        provenance: {
          confidence: 'documented',
          citations: [
            cite(
              `"${spec.inputs} seamless inputs, ${spec.inputs === 8 ? 14 : 16} total input plugs"`,
              `${spec.sheet.source}, "INPUTS"`,
              spec.sheet.url,
            ),
          ],
          notes: [],
        },
      },
    ],
  }))

  return {
    id: spec.id,
    vendor: AW,
    family: 'Midra',
    model: spec.model,
    profile: 'video',
    configs,
    rules: {
      layerCosting: {
        poolId: 'layers',
        classes: [MIDRA_LAYER_CLASS],
        // No Midra publishes a half-price "split" layer the way Midra 4K and
        // LivePremier do — a live layer is a live layer. Charging one at half
        // rate would invent capacity the platform does not have.
        splitFactor: 1,
      },
      liveBackground: spec.liveBackground,
      maxScreens: Math.max(...spec.modes.map((m) => m.screens)),
      // No soft edge anywhere on the pre-4K platform. Every operating mode
      // Analog Way publishes for these six is Mixer, Native Matrix or
      // Quadravision — a blend mode arrived with Midra 4K, and Analog Way
      // advertises soft edge loudly wherever it exists. So a screen here has
      // to fit on ONE output, which is the single most common reason a modern
      // show misses one of these.
      edgeBlending: false,
      // ...but a Saphyr is not a vision mixer. It has freely placed, resized,
      // cross-faded layers; it just cannot join two outputs into one picture.
      category: 'screen-management',
    },
    discontinued: true,
    caveats: [
      `A Midra is a single-link machine: every plug is quoted at 2048x1152@60Hz and the platform's own figure is "FpxMax = 165MHz". 1080p60 and 1920x1200 fit; 2560x1600 and anything 4K do not, in any mode.`,
      'No Midra of this generation has edge blending: the published modes are Mixer, Native Matrix and (on the Eikos²) Quadravision, and soft edge arrived with the Midra 4K platform. A screen has to fit on one output — two outputs cannot be joined into one wide picture.',
      'The four Universal Analog (HD15 / DVI-A) input plugs and the analog plug on each output are not modelled — this tool has no analog-video connector, so only the vendor\'s own digital-plug subtotal is counted here.',
      ...spec.caveats,
    ],
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          `${spec.model}: ${spec.inputs} seamless inputs over ${spec.inputs === 8 ? 14 : 16} input plugs (${spec.digitalPlugs} digital: DVI-D on inputs 1-4, HDMI on inputs 3-6, 3G/HD/SD-SDI on inputs 7-${spec.inputs}); ${spec.out2Preview ? '1 output plus a preview' : '2 outputs'} with 2 plugs each${spec.videoOut ? ', plus a 3G-SDI video output usable as a program clone' : ''}`,
          `${spec.sheet.source}, "INPUTS" / "OUTPUTS" / "Connectors - rear panel"`,
          spec.sheet.url,
        ),
      ],
      notes: [],
    },
  }
}

const MIDRA_LEGACY_DEVICES: VideoDevice[] = [
  midraLegacy({
    id: 'aw-midra-quickvu3g',
    model: 'QuickVu 3G',
    sheet: MIDRA_SHEETS.quickvu,
    inputs: 8,
    digitalPlugs: 10,
    out2Preview: true,
    videoOut: true,
    liveBackground: true,
    modes: [
      {
        id: 'mixer',
        label: 'Seamless Mixer mode (Screen + Preview)',
        layers: 1,
        screens: 1,
        claim: 'Mixer mode: "Seamless switching with full preview", "1 true Seamless Live + 1 keyed layer"',
      },
    ],
    caveats: [
      'QuickVu 3G has one screen: Output #2 is the preview, not a second program feed.',
      'The second of its two layers is a keyed layer — a title or key over the live one — not a second freely placed and resized layer. Only the live layer is counted here.',
    ],
  }),
  midraLegacy({
    id: 'aw-midra-quickmatrix',
    model: 'QuickMatriX',
    sheet: MIDRA_SHEETS.quickmatrix,
    inputs: 8,
    digitalPlugs: 10,
    out2Preview: false,
    videoOut: false,
    liveBackground: true,
    modes: [
      {
        id: 'matrix',
        label: 'Native Matrix mode (two outputs)',
        layers: 1,
        screens: 2,
        claim: 'Operating modes: "1 operating mode: Native Matrix mode", "Seamless switching on each output", "1 Title on Live Background on each output"',
      },
    ],
    caveats: [
      'QuickMatriX is the "Basic version (Only Background)" of the matrix: each output shows one seamlessly switched source with a title over it. The single layer counted here IS that title — there is no freely placed, resizable PIP.',
      'It is the only Midra with no separate video output: the 3G-SDI clone the rest of the family carries is absent.',
    ],
  }),
  midraLegacy({
    id: 'aw-midra-pulse2',
    model: 'Pulse²',
    sheet: MIDRA_SHEETS.pulse2,
    inputs: 8,
    digitalPlugs: 10,
    out2Preview: false,
    videoOut: false,
    liveBackground: true,
    modes: [
      {
        id: 'mixer',
        label: 'Mixer mode (Screen + Preview)',
        layers: 2,
        screens: 1,
        claim: 'Operating modes: "2 layers on Still Background in Mixer mode", "1 layer on Live Background in Mixer mode", "1 Title on Live Background in Mixer"',
      },
      {
        id: 'matrix',
        label: 'Native Matrix mode (two outputs)',
        layers: 1,
        screens: 2,
        claim: 'Operating modes: "Seamless switching in Native Matrix mode", "1 Live Background in Native Matrix mode"',
      },
    ],
    caveats: [
      'Mixer mode gives two layers over a STILL background. Put a live input behind them and the allowance drops to one layer plus a title — the tool records the still-background figure, so a Pulse² show with a live background has one layer less than this says.',
      'This is the base PLS350, which has no SDI output. The PLS350-3G variant adds a 3G-SDI video output usable as a program clone; if that is the unit in the case, it has one more output plug than modelled here.',
    ],
  }),
  midraLegacy({
    id: 'aw-midra-smartmatrix2',
    model: 'SmartMatriX²',
    sheet: MIDRA_SHEETS.smartmatrix2,
    inputs: 10,
    digitalPlugs: 12,
    out2Preview: false,
    videoOut: true,
    liveBackground: true,
    modes: [
      {
        id: 'matrix',
        label: 'Native Matrix mode (two outputs)',
        layers: 2,
        screens: 2,
        claim: 'Operating modes: "1 operating mode: Native Matrix mode", "2 layers on Still Background", "1 layer on Live Background", "1 Title on Live Background on each output"',
      },
    ],
    caveats: [
      'Matrix mode only — there is no mixer mode on a SmartMatriX², so the two outputs are always independent and cannot be joined into one wide screen.',
      'The two layers are over a still background. On a live background it is one layer plus a title.',
    ],
  }),
  midraLegacy({
    id: 'aw-midra-saphyr',
    model: 'Saphyr',
    sheet: MIDRA_SHEETS.saphyr,
    inputs: 10,
    digitalPlugs: 12,
    out2Preview: false,
    videoOut: true,
    liveBackground: true,
    modes: [
      {
        id: 'mixer',
        label: 'Seamless Mixer mode (Screen + Preview)',
        layers: 3,
        screens: 1,
        claim: 'Mixer mode: "Up to 2 Layers on Live Background", "Up to 3 Layers on Still Background"',
      },
      {
        id: 'matrix',
        label: 'Native Matrix mode (two outputs)',
        layers: 1,
        screens: 2,
        claim: 'Matrix mode: "Seamless switching", "1 Layer on Live or Still Background"',
      },
    ],
    caveats: [
      'Mixer mode is three layers on a still background and TWO on a live one. The larger figure is the one recorded.',
    ],
  }),
  midraLegacy({
    id: 'aw-midra-eikos2',
    model: 'Eikos²',
    sheet: MIDRA_SHEETS.eikos2,
    inputs: 10,
    digitalPlugs: 12,
    out2Preview: false,
    videoOut: true,
    liveBackground: true,
    modes: [
      {
        id: 'mixer',
        label: 'Seamless Mixer mode (Screen + Preview)',
        layers: 3,
        screens: 1,
        claim: 'Mixer mode: "Up to 2 Layers on Live Background", "Up to 3 Layers on Still Background"',
      },
      {
        id: 'matrix',
        label: 'Native Matrix mode (two outputs)',
        layers: 2,
        screens: 2,
        claim: 'Matrix mode: "1 Layer on Live Background on each output", "Up to 2 Layers on Still Background on each output"',
      },
      {
        id: 'quadravision',
        label: 'Quadravision mode (four layers, one screen)',
        layers: 4,
        screens: 1,
        claim: 'Quadravision: "Seamless switching", "Up to 4 Layers on still Background"',
      },
    ],
    caveats: [
      'Quadravision is the only way to get four layers out of an Eikos², and it needs a STILL background — a live input behind four layers is not a mode the machine has.',
      'The Eikos² is the top of the Midra line, and its ceiling is still 165 MHz per plug. Four layers on a 2K screen is what it is for.',
    ],
  }),
]

// ================================================================= LiveCore

const LIVECORE_SHEETS = {
  nextage08: {
    source: 'Analog Way, NeXtage 08 - 4K technical datasheet (NXT0802-4K)',
    url: 'http://legacy.theatrixx.com/media/video/analog-way/NEXTAGE-08/downloads/nextage08-4k-datasheet-en.pdf',
  },
  nextage16: {
    source: 'Analog Way, NeXtage 16 - 4K technical datasheet (NXT1604-4K)',
    url: 'http://legacy.theatrixx.com/media/video/analog-way/NEXTAGE-16/downloads/nextage16-4k_en.pdf',
  },
  ascender16: {
    source: 'Analog Way, Ascender 16 - 4K technical datasheet (ASC1602-4K)',
    url: 'http://legacy.theatrixx.com/media/video/analog-way/ASCENDER-16/downloads/ascender_16_4k_en.pdf',
  },
  ascender32: {
    source: 'Analog Way, Ascender 32 - 4K - PL technical datasheet (ASC3204-4K-PL)',
    url: 'http://legacy.theatrixx.com/media/video/analog-way/ASCENDER-32/downloads/ascender32_4k_en.pdf',
  },
  ascender48: {
    source: 'Analog Way, Ascender 48 - 4K - PL technical datasheet (ASC4806-4K-PL)',
    url: 'http://legacy.theatrixx.com/media/video/analog-way/ASCENDER-48/downloads/ascender48_4k_en.pdf',
  },
  smxUltra: {
    source: 'SVC Online, "Analog Way NeXtage 16 and SmartMatriX Ultra" product announcement',
    url: 'https://www.svconline.com/products/analog-way-nextage-16-and-smartmatrix-ultra-368150',
  },
} as const

/**
 * The LiveCore input ceiling: "Input formats up to Dual Link 60hz 4:4:4 or
 * 4k30hz 4:4:4". 4K30 4:4:4 is 297 MPix/s with blanking, and that is the number
 * every 4K-capable LiveCore plug is held to here — including the DisplayPort
 * ones, whose 4-lane link could carry far more but whose processing cannot.
 */
const LIVECORE_4K30_HZ = 297e6

/** 2560x1600@60 CVT-RB, the "DVI Dual-Link up to 2560x1600" the sheets quote. */
const LIVECORE_DL_HZ = 268.5e6

const LIVECORE_LAYER_CLASS = {
  id: '4k30',
  label: 'True-Seamless scaled layer',
  maxPixelRate: 4096 * 2160 * 30,
  cost: 1,
}

/**
 * LiveCore input plugs.
 *
 * The chassis are built from identical four-input modules — 4x SDI, 4x
 * universal analog, 3x DVI-I, 2x HDMI and 1x DisplayPort each — so a NeXtage is
 * two modules (8 inputs, 28 plugs) and an Ascender or SmartMatriX Ultra is
 * three (12 inputs, 42 plugs). Both breakdowns are published and both add up.
 *
 * ⚠️ The 42 or 28 plugs are grouped into 12 or 8 SEAMLESS INPUTS, and plugs
 * sharing an input cannot be live at once. Analog Way does not publish which
 * plug belongs to which input, so the grouping is not modelled: the plugs are
 * listed individually and an `input-plugs` pool caps the total at the seamless
 * count. Right in both directions — it can never claim more simultaneous
 * sources than the chassis has — but it will accept a mix of connectors that a
 * particular input assignment might not.
 */
function liveCoreInputs(inputs: 8 | 12): Port[] {
  const modules = inputs / 4
  const hdmi4k = modules // 1 per module: "incl. 3 x 4K HDMI plugs" on a 12-input chassis
  const hdmiPlain = modules
  const dviDual = modules
  const dviSingle = modules * 2
  const dp = modules
  const sdi = modules * 4

  return [
    ...run('IN-HDMI4K', 'hdmi', 'HDMI (4K30)', CAP.hdmi20(LIVECORE_4K30_HZ), hdmi4k, 'in'),
    ...run('IN-HDMI', 'hdmi', 'HDMI 1.4', CAP.hdmi14(), hdmiPlain, 'in'),
    ...run('IN-DVI-DL', 'dvi', 'DVI-I Dual-Link', CAP.dviDual(), dviDual, 'in'),
    ...run('IN-DVI', 'dvi', 'DVI-I Single-Link', CAP.dviSingle(), dviSingle, 'in'),
    ...run('IN-DP', 'displayport', 'DisplayPort (4-lane)', CAP.dp12(LIVECORE_4K30_HZ), dp, 'in'),
    ...run('IN-SDI', 'sdi', '3G/HD/SD-SDI', CAP.sdi3g(), sdi, 'in'),
  ]
}

/**
 * LiveCore outputs: five plugs per output, of which three are modelled.
 *
 * Each output is ONE resource carrying the same picture on a DVI connector, a
 * 3G-SDI BNC and an optical SFP cage. The two Universal Analog plugs of each
 * output are not modelled, as everywhere else in this file.
 *
 * The DVI connector alternates by output number, and this is a real capability
 * difference rather than a labelling one: outputs #1 and #3 are DVI Dual-Link
 * up to 2560x1600, outputs #2 and #4 carry HDMI 4K30 through the DVI shell. A
 * 4K display has to go on an even-numbered output.
 */
function liveCoreOutputs(outputs: 2 | 4): Port[] {
  const ports: Port[] = []
  for (let i = 1; i <= outputs; i++) {
    const fourK = i % 2 === 0
    const dvi: Omit<Port, 'mirrorGroup'> = fourK
      ? {
          id: `OUT ${i} (DVI/HDMI 4K)`,
          kind: 'hdmi',
          label: 'DVI/HDMI 4K (4K30)',
          direction: 'out',
          cap: CAP.hdmi20(LIVECORE_4K30_HZ),
          roles: ['program', 'aux'],
        }
      : {
          id: `OUT ${i} (DVI-I DL)`,
          kind: 'dvi',
          label: 'DVI-I Dual-Link (2560x1600)',
          direction: 'out',
          cap: { ...CAP.dviDual(), maxPixelRateHz: LIVECORE_DL_HZ },
          roles: ['program', 'aux'],
        }
    ports.push(
      ...mirrored(`OUT ${i}`, [
        dvi,
        {
          id: `OUT ${i} (SDI)`,
          kind: 'sdi',
          label: '3G/HD/SD-SDI',
          direction: 'out',
          cap: CAP.sdi3g(),
          roles: ['program', 'aux'],
        },
        {
          id: `OUT ${i} (SFP)`,
          kind: 'sfp',
          label: 'Optical SFP (SDI over fibre)',
          direction: 'out',
          cap: CAP.sdi3g(),
          roles: ['program', 'aux'],
        },
      ]),
    )
  }

  // The monitoring output: one picture, several connectors, one resource.
  ports.push(
    ...mirrored('MVR', [
      {
        id: 'MVR (DVI-I)',
        kind: 'dvi',
        label: 'DVI-I (monitoring)',
        direction: 'out',
        cap: { ...CAP.dviDual(), maxPixelRateHz: LIVECORE_DL_HZ },
        roles: ['multiviewer'],
      },
      {
        id: 'MVR (SDI)',
        kind: 'sdi',
        label: '3G/HD/SD-SDI (monitoring)',
        direction: 'out',
        cap: CAP.sdi3g(),
        roles: ['multiviewer'],
      },
    ]),
  )
  return ports
}

interface LiveCoreSpec {
  id: string
  model: string
  sheet: { source: string; url: string }
  inputs: 8 | 12
  outputs: 2 | 4
  /** True-Seamless scaled layers per output, on top of the native background. */
  layers: number
  /** Set when the model's figures are not from its own datasheet. */
  unverified?: string[]
  caveats: string[]
}

function liveCore(spec: LiveCoreSpec): VideoDevice {
  const plugs = spec.inputs === 12 ? 42 : 28
  const ports = [...liveCoreInputs(spec.inputs), ...liveCoreOutputs(spec.outputs)]
  const confidence = spec.unverified ? ('unverified' as const) : ('documented' as const)

  return {
    id: spec.id,
    vendor: AW,
    family: 'LiveCore',
    model: spec.model,
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
            label: 'True-Seamless scaled layers',
            capacity: spec.layers,
            unit: 'layers',
            scope: 'per-screen',
            provenance: {
              confidence,
              citations: spec.unverified
                ? []
                : [
                    cite(
                      `"${spec.layers} True-Seamless scaled layers per output" plus "1 native background layer per output"`,
                      `${spec.sheet.source}, "LAYERS"`,
                      spec.sheet.url,
                    ),
                  ],
              notes: spec.unverified ?? [
                'The native background is separate from this count and does not spend a layer, which is why a LiveCore takes a live-background show that its layer number alone would seem to rule out.',
              ],
            },
          },
          {
            id: 'input-plugs',
            label: 'Seamless inputs',
            capacity: spec.inputs,
            unit: 'inputs',
            scope: 'system',
            provenance: {
              confidence,
              citations: spec.unverified
                ? []
                : [
                    cite(
                      `"${spec.inputs} active inputs, ${plugs} total input plugs"`,
                      `${spec.sheet.source}, "INPUTS"`,
                      spec.sheet.url,
                    ),
                  ],
              notes: spec.unverified ?? [],
            },
          },
        ],
      },
    ],
    rules: {
      layerCosting: {
        poolId: 'layers',
        classes: [LIVECORE_LAYER_CLASS],
        // LiveCore publishes one kind of layer and it is true-seamless. There
        // is no cheaper cut-only layer to charge at half rate.
        splitFactor: 1,
      },
      // "Native background using still images or live sources" — documented on
      // every LiveCore datasheet, and it costs nothing from the layer count.
      liveBackground: true,
      maxScreens: spec.outputs,
    },
    discontinued: true,
    caveats: [
      `A LiveCore output is five plugs carrying one picture. Outputs #1 and #3 are DVI Dual-Link up to 2560x1600; outputs #2 and #4 carry 4K30 through a DVI connector. A 4K display has to land on an even-numbered output.`,
      'The platform ceiling is 4K 30Hz 4:4:4 in and out. The datasheets also quote 4K 60Hz 4:2:0 and a four-quadrant 4K60 4:4:4 output mode, neither of which is modelled — to check a 4K60 display here, describe it as a destination fed by four cables and the tool will size the quadrants.',
      'Each output also carries two Universal Analog plugs, which this tool has no connector kind for and does not count.',
      ...spec.caveats,
    ],
    provenance: {
      confidence,
      citations: spec.unverified
        ? []
        : [
            cite(
              `${spec.model}: "${spec.inputs} active inputs, ${plugs} total input plugs" and "${spec.outputs} outputs with 5 plugs per output", plus an independent preview/mosaic/monitoring output`,
              `${spec.sheet.source}, "INPUTS" / "OUTPUTS" / "MONITORING OUTPUT"`,
              spec.sheet.url,
            ),
          ],
      notes: spec.unverified ?? [
        'The per-input plug grouping is not published: 42 plugs across 12 seamless inputs means plugs share inputs, and only one plug of an input can be live. Modelled as an input-plugs pool capped at the seamless count rather than as select-one groups.',
      ],
    },
  }
}

const LIVECORE_DEVICES: VideoDevice[] = [
  liveCore({
    id: 'aw-livecore-nextage08',
    model: 'NeXtage 08 - 4K',
    sheet: LIVECORE_SHEETS.nextage08,
    inputs: 8,
    outputs: 2,
    layers: 2,
    caveats: [
      'The smallest LiveCore: two outputs, two layers each. Its own comparison table puts it beside the NeXtage 16 - 4K, which is the identical chassis with twice the layers.',
    ],
  }),
  liveCore({
    id: 'aw-livecore-nextage16',
    model: 'NeXtage 16 - 4K',
    sheet: LIVECORE_SHEETS.nextage16,
    inputs: 8,
    outputs: 2,
    layers: 4,
    caveats: [
      'The NeXtage 16 - 4K datasheet contradicts itself on plug count: the "at a glance" panel says "8 seamless inputs and 42 input plugs" while the INPUTS panel says "8 active inputs, 28 total input plugs". 28 is right — it is what the listed connectors add up to, and 42 is the Ascender figure copied across. 28 is what is modelled.',
    ],
  }),
  liveCore({
    id: 'aw-livecore-ascender16',
    model: 'Ascender 16 - 4K',
    sheet: LIVECORE_SHEETS.ascender16,
    inputs: 12,
    outputs: 4,
    layers: 2,
    caveats: [
      'Ascender 16 / 32 / 48 are one chassis with one input board and one output board; the only thing that changes is the layer count — two, four and six per screen. If an Ascender 16 misses this show on layers alone, a 32 or a 48 in the same rack space takes it.',
    ],
  }),
  liveCore({
    id: 'aw-livecore-ascender32',
    model: 'Ascender 32 - 4K',
    sheet: LIVECORE_SHEETS.ascender32,
    inputs: 12,
    outputs: 4,
    layers: 4,
    caveats: [
      'The PL variant swaps some of the layer budget for Perspective Layers — "4 true-Seamless scaled layers or 2 True-Seamless Perspective Layers". The scaled-layer figure is the one modelled; a show built on perspective layers gets half of it.',
    ],
  }),
  liveCore({
    id: 'aw-livecore-ascender48',
    model: 'Ascender 48 - 4K',
    sheet: LIVECORE_SHEETS.ascender48,
    inputs: 12,
    outputs: 4,
    layers: 6,
    caveats: [
      'The PL variant swaps some of the layer budget for Perspective Layers — "6 True-Seamless scaled layers or 3 True-Seamless Perspective Layers". The scaled-layer figure is the one modelled; a show built on perspective layers gets half of it.',
      'Associative modularity synchronises up to four units into one blend of up to 16 outputs, and additive modularity links two chassis to share inputs and outputs. Neither is modelled — this is one chassis on its own.',
    ],
  }),
  liveCore({
    id: 'aw-livecore-smartmatrix-ultra',
    model: 'SmartMatriX Ultra',
    sheet: LIVECORE_SHEETS.smxUltra,
    inputs: 12,
    outputs: 4,
    layers: 1,
    unverified: [
      'Analog Way\'s own datasheet for the SMX12x4 could not be retrieved — the product page is archived with its downloads removed. The input figures here ("12 inputs and 42 plugs: six HDMI, nine DVI-D, three DisplayPort, 12 3G-SDI, and 12 universal analog") come from a trade-press specification listing, not from Analog Way.',
      'The output plug mix is ASSUMED identical to the Ascender\'s four-output board, on the strength of the shared LiveCore platform and the 12x4 model number. It is not published for this model.',
      'The layer figure of one per output is a reading of "scaled native matrix", not a published number. Analog Way states no layer count for this chassis anywhere this pass could find. Treat every verdict involving this device as a shape, not an answer.',
    ],
    caveats: [
      'This device is UNVERIFIED throughout: no Analog Way document for it could be retrieved. Confirm against the chassis before ordering anything on the strength of it.',
      'A SmartMatriX Ultra is a scaled native matrix — each output takes one seamlessly switched, scaled source. If the show needs layers over a background, this is the wrong LiveCore; an Ascender is the same platform with layers.',
    ],
  }),
]

export const ANALOG_WAY_LEGACY_DEVICES: VideoDevice[] = [
  ...MIDRA_LEGACY_DEVICES,
  ...LIVECORE_DEVICES,
]

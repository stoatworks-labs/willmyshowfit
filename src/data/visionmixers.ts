/**
 * Roland and Blackmagic Design — vision mixers.
 *
 * READ THIS BEFORE COMPARING THEM WITH THE REST OF THE DATABASE.
 *
 * Everything else here is a screen-management system: it builds an arbitrary
 * canvas, spreads it across several outputs and edge-blends the joins. A vision
 * mixer does not do that. Every output is one raster at the switcher's own
 * format, and "layers" are keyers and DVEs sitting over a program bus — a fixed
 *, small number of them, at full frame size.
 *
 * That is why `edgeBlending: false` is set on every device in this file. A show
 * with a 7680x2160 canvas is not "too big" for an ATEM in the way it is too big
 * for a Midra; it is the wrong shape entirely, and the tool says so in those
 * words rather than reporting a near miss on layer count.
 *
 * These are worth having in the comparison anyway, because a great many shows
 * that people reach for a presentation switcher to solve are one screen, one
 * raster, a handful of sources and two keys — and a vision mixer does that for
 * a fraction of the money.
 */

import type { Port } from '../lib/model/types.ts'
import type { VideoDevice } from '../lib/fit/evaluate.ts'
import { CAP, run } from './ports.ts'

const READ = '2026-08-20'

const cite = (claim: string, source: string, url: string) => ({ claim, source, url, read: READ })

/** One keyer or DVE, at the switcher's own frame size. Everything costs 1. */
function keyerClasses(maxPixelRate: number) {
  return [{ id: 'key', label: 'keyer / DVE layer', maxPixelRate, cost: 1 }]
}

const HD60 = 1920 * 1080 * 60
const UHD60 = 3840 * 2160 * 60

// ================================================================== Roland

const ROLAND = 'Roland'

const V160HD: VideoDevice = {
  id: 'roland-v160hd',
  vendor: ROLAND,
  family: 'V Series',
  model: 'V-160HD',
  profile: 'video',
  configs: [
    {
      id: 'standard',
      label: 'Standard',
      stock: true,
      ports: [
        ...run('IN-HDMI', 'hdmi', 'HDMI (1080p60)', CAP.hdmi14(165e6), 8, 'in'),
        ...run('IN-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 8, 'in'),
        ...run('OUT-HDMI', 'hdmi', 'HDMI (1080p60)', CAP.hdmi14(165e6), 3, 'out', {
          roles: ['program', 'aux'],
        }),
        ...run('OUT-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 3, 'out', { roles: ['program', 'aux'] }),
      ],
      pools: [
        {
          id: 'layers',
          label: 'Compositing layers (PinP, keyers, DSK)',
          capacity: 8,
          unit: 'layers',
          scope: 'system',
          provenance: {
            confidence: 'documented',
            citations: [
              cite(
                '"eight-layer video effects engine"; composition is PinP x4, Keyer x4 (luminance/chroma), DSK x2',
                'Roland V-160HD product specifications',
                'https://proav.roland.com/global/products/v-160hd/',
              ),
            ],
            notes: [
              'Roland quotes both "eight-layer" and a breakdown (4 PinP + 4 keyer + 2 DSK) that adds to ten. Eight is used here as the headline engine figure, which is the more conservative of the two.',
            ],
          },
        },
        { id: 'input-plugs', label: 'Input connectors', capacity: 16, unit: 'plugs', scope: 'system' },
        { id: 'output-plugs', label: 'Output connectors', capacity: 6, unit: 'plugs', scope: 'system' },
      ],
    },
  ],
  rules: {
    layerCosting: { poolId: 'layers', classes: keyerClasses(HD60), splitFactor: 1 },
    liveBackground: true,
    maxScreens: 1,
    edgeBlending: false,
    auxLayers: 'none',
  },
  caveats: [
    'The V-160HD is an HD switcher: 1080p60 is its ceiling on every plug. A 4K source or destination does not fit at any layer count.',
    'Split layers do not exist on a vision mixer — a keyer is a keyer. This tool charges split and mixing layers the same here, which is why a Roland can look more capable than a presentation switcher on layer count alone. It is not: the layers are fixed full-frame keys, not freely sized and positioned PIPs on a large canvas.',
  ],
  provenance: {
    confidence: 'documented',
    citations: [
      cite(
        '"8 x HDMI and 8 x 3G-SDI inputs with up to 1080p60"; three SDI and three HDMI outputs plus a USB-C webcam output',
        'Roland V-160HD published specifications',
        'https://proav.roland.com/global/products/v-160hd/',
      ),
    ],
    notes: [
      'The USB-C webcam output is not modelled as a video output here — it is a stream destination, not a plug you can send a screen to.',
    ],
  },
}

const VR400UHD: VideoDevice = {
  id: 'roland-vr400uhd',
  vendor: ROLAND,
  family: 'VR Series',
  model: 'VR-400UHD',
  profile: 'video',
  configs: [
    {
      id: 'standard',
      label: 'Standard',
      stock: true,
      ports: [
        ...run('IN-HDMI', 'hdmi', 'HDMI 2.0 (4K60)', CAP.hdmi20(), 7, 'in'),
        ...run('OUT-HDMI', 'hdmi', 'HDMI 2.0 (4K60)', CAP.hdmi20(), 2, 'out', {
          roles: ['program', 'aux'],
        }),
        ...run('OUT-HD', 'hdmi', 'HDMI (HD)', CAP.hdmi14(165e6), 1, 'out', {
          roles: ['program', 'aux', 'multiviewer'],
        }),
      ],
      pools: [
        {
          id: 'layers',
          label: 'Compositing layers',
          capacity: 3,
          unit: 'layers',
          scope: 'system',
          provenance: {
            confidence: 'documented',
            citations: [
              cite(
                '"Composition includes Background, Layer 1 (PinP + Key), Layer 2 (PinP + Key), and DSK (Downstream Keyer)"',
                'Roland VR-400UHD published specifications',
                'https://proav.roland.com/global/products/vr-400uhd/',
              ),
            ],
            notes: [
              'Counted as Layer 1 + Layer 2 + DSK. The background is not counted as a layer, matching how every other device in this database treats it.',
            ],
          },
        },
        {
          id: 'input-plugs',
          label: 'Input connectors',
          capacity: 7,
          unit: 'plugs',
          scope: 'system',
        },
        { id: 'output-plugs', label: 'Output connectors', capacity: 3, unit: 'plugs', scope: 'system' },
      ],
    },
  ],
  rules: {
    layerCosting: { poolId: 'layers', classes: keyerClasses(UHD60), splitFactor: 1 },
    liveBackground: true,
    maxScreens: 1,
    edgeBlending: false,
    auxLayers: 'none',
  },
  caveats: [
    'Seven HDMI inputs, but Roland states only four can be used at once in a composition. This tool counts the plugs; if the show needs more than four live sources on screen simultaneously, check that limit by hand.',
  ],
  provenance: {
    confidence: 'documented',
    citations: [
      cite(
        '"Seven HDMI inputs with up to 4K/60p resolution, and you can use up to four inputs at once to create video compositions"; "Two 4K HDMI outputs… and a dedicated HDMI HD output"',
        'Roland VR-400UHD published specifications',
        'https://proav.roland.com/global/products/vr-400uhd/',
      ),
    ],
    notes: [],
  },
}

const V600UHD: VideoDevice = {
  id: 'roland-v600uhd',
  vendor: ROLAND,
  family: 'V Series',
  model: 'V-600UHD',
  profile: 'video',
  configs: [
    {
      id: 'standard',
      label: 'Standard',
      stock: true,
      ports: [
        ...run('IN-HDMI', 'hdmi', 'HDMI 2.0 (4K60)', CAP.hdmi20(), 4, 'in'),
        ...run('IN-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 2, 'in'),
        ...run('OUT-HDMI', 'hdmi', 'HDMI 2.0 (4K60)', CAP.hdmi20(), 3, 'out', {
          roles: ['program', 'aux'],
        }),
        ...run('OUT-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 1, 'out', { roles: ['program', 'aux'] }),
        ...run('MVR', 'hdmi', 'HDMI (Multiview)', CAP.hdmi14(165e6), 1, 'out', {
          roles: ['multiviewer'],
        }),
      ],
      pools: [
        {
          id: 'layers',
          label: 'Compositing layers',
          capacity: 2,
          unit: 'layers',
          scope: 'system',
          provenance: {
            confidence: 'unverified',
            citations: [],
            notes: [
              'Roland does not publish a layer count for the V-600UHD in the material read for this entry. Two — a PinP and a DSK — is the floor for a switcher of this class and is recorded as UNVERIFIED. Do not rely on it; check the manual before speccing a show on this number.',
            ],
          },
        },
        { id: 'input-plugs', label: 'Input connectors', capacity: 7, unit: 'plugs', scope: 'system' },
        { id: 'output-plugs', label: 'Output connectors', capacity: 5, unit: 'plugs', scope: 'system' },
      ],
    },
  ],
  rules: {
    layerCosting: { poolId: 'layers', classes: keyerClasses(UHD60), splitFactor: 1 },
    liveBackground: true,
    maxScreens: 1,
    edgeBlending: false,
    auxLayers: 'none',
  },
  caveats: [
    'The V-600UHD layer count in this database is UNVERIFIED — Roland does not publish one in the material read. Every other figure for this model is documented; the layer verdict is not.',
    'The V-600UHD also has an analogue RGB (VGA) input, which this tool does not model because none of the other devices in the comparison have one.',
  ],
  provenance: {
    confidence: 'documented',
    citations: [
      cite(
        '"4 HDMI inputs, 2 SDI inputs, and 1 RGB input"; "3 HDMI outputs plus Multiview, and 1 SDI output"',
        'Roland V-600UHD published specifications',
        'https://proav.roland.com/global/products/v-600uhd/',
      ),
    ],
    notes: [],
  },
}

// ==================================================== Blackmagic Design

const BMD = 'Blackmagic Design'
const ATEM_SPECS = 'https://www.blackmagicdesign.com/products/atemconstellation/techspecs'

/**
 * ATEM Constellation 4K: every output is a routable aux, which is why the
 * ports below are all 12G-SDI marked program/aux rather than split into fixed
 * program and aux banks.
 */
function atem(opts: {
  id: string
  model: string
  inputs: number
  auxOutputs: number
  multiviews: number
  upstreamKeyers: number
  downstreamKeyers: number
  meUnits: number
  superSource: number
  specUrl: string
  claim: string
}): VideoDevice {
  const ports: Port[] = [
    ...run('IN', 'sdi', '12G-SDI', CAP.sdi12g(), opts.inputs, 'in'),
    ...run('AUX', 'sdi', '12G-SDI (aux)', CAP.sdi12g(), opts.auxOutputs, 'out', {
      roles: ['program', 'aux'],
    }),
    ...run('MV', 'sdi', '12G-SDI (multiview)', CAP.sdi12g(), opts.multiviews, 'out', {
      roles: ['multiviewer'],
    }),
  ]

  const layers = opts.upstreamKeyers + opts.downstreamKeyers

  return {
    id: opts.id,
    vendor: BMD,
    family: 'ATEM Constellation 4K',
    model: opts.model,
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
            label: 'Keyers (upstream + downstream)',
            capacity: layers,
            unit: 'keyers',
            scope: 'system',
            provenance: {
              confidence: 'documented',
              citations: [
                cite(
                  `${opts.model}: ${opts.upstreamKeyers} upstream / advanced keyers, ${opts.downstreamKeyers} downstream keyer${opts.downstreamKeyers === 1 ? '' : 's'}`,
                  `Blackmagic Design, ${opts.model} technical specifications`,
                  opts.specUrl,
                ),
              ],
              notes: [
                `Upstream keyers are shared across the ${opts.meUnits} M/E unit${opts.meUnits === 1 ? '' : 's'}, so this is a system total and not a per-screen figure.`,
                ...(opts.superSource > 0
                  ? [
                      `${opts.superSource} SuperSource processor${opts.superSource === 1 ? '' : 's'} can composite four more sources into a single input, which this tool does not count as layers.`,
                    ]
                  : []),
              ],
            },
          },
          {
            id: 'input-plugs',
            label: 'Input connectors',
            capacity: opts.inputs,
            unit: 'plugs',
            scope: 'system',
          },
          {
            id: 'output-plugs',
            label: 'Aux output connectors',
            capacity: opts.auxOutputs,
            unit: 'plugs',
            scope: 'system',
          },
        ],
      },
    ],
    rules: {
      layerCosting: { poolId: 'layers', classes: keyerClasses(UHD60), splitFactor: 1 },
      liveBackground: true,
      maxScreens: opts.meUnits,
      edgeBlending: false,
      // An ATEM aux is a clean routed feed. Keys live on an M/E, not on the aux
      // bus, so a layer cannot be built on an aux at all — which is exactly the
      // distinction the "layers on aux" toggle exists to expose.
      auxLayers: 'none',
    },
    caveats: [
      'Every input is 12G-SDI. HDMI sources need external converters, and this tool will report them as unfittable rather than silently assuming a converter is in the budget.',
      `Screens map to M/E units on an ATEM, and this model has ${opts.meUnits}. Aux outputs can carry a routed source or an M/E's program, but an aux is not an independent composited screen.`,
      'ATEM inputs are standards-converted, so a source at the wrong frame rate will lock rather than fail — an advantage over most of the presentation switchers here, and not something this tool scores.',
    ],
    provenance: {
      confidence: 'documented',
      citations: [cite(opts.claim, `Blackmagic Design, ${opts.model} technical specifications`, opts.specUrl)],
      notes: [],
    },
  }
}

const ATEM_DEVICES: VideoDevice[] = [
  atem({
    id: 'bmd-atem-1me-constellation-4k',
    model: 'ATEM 1 M/E Constellation 4K',
    inputs: 10,
    auxOutputs: 6,
    multiviews: 1,
    upstreamKeyers: 4,
    downstreamKeyers: 1,
    meUnits: 1,
    superSource: 0,
    specUrl: `${ATEM_SPECS}/W-APS-40`,
    claim:
      '10 standards-converted 12G-SDI inputs, 6 12G-SDI aux outputs, 1 x 12G-SDI multiview, 1 M/E, 4 upstream (advanced chroma) keyers, 1 downstream keyer, up to 2160p60',
  }),
  atem({
    id: 'bmd-atem-2me-constellation-4k',
    model: 'ATEM 2 M/E Constellation 4K',
    inputs: 20,
    auxOutputs: 12,
    multiviews: 2,
    upstreamKeyers: 8,
    downstreamKeyers: 2,
    meUnits: 2,
    superSource: 1,
    specUrl: `${ATEM_SPECS}/W-APS-41`,
    claim:
      '20 standards-converted 12G-SDI inputs, 12 12G-SDI aux outputs, 2 multiview outputs, 2 M/E, 8 ATEM Advanced Keyers, 2 downstream keyers, 1 SuperSource, up to 2160p60',
  }),
  atem({
    id: 'bmd-atem-4me-constellation-4k',
    model: 'ATEM 4 M/E Constellation 4K',
    inputs: 40,
    auxOutputs: 24,
    multiviews: 4,
    upstreamKeyers: 16,
    downstreamKeyers: 4,
    meUnits: 4,
    superSource: 2,
    specUrl: ATEM_SPECS,
    claim:
      '40 standards-converted 12G-SDI inputs, 24 12G-SDI aux outputs, 4 independent Ultra HD multiviews, 4 M/E, 16 ATEM Advanced Chroma Keyers, 4 DVEs, 2 SuperSource processors',
  }),
]

export const VISION_MIXER_DEVICES: VideoDevice[] = [V160HD, VR400UHD, V600UHD, ...ATEM_DEVICES]

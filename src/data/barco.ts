/**
 * Barco Event Master — S3 standalone, E2 Gen 1, E2 Gen 2 and ENCORE3 (E3).
 *
 * Same rules as the Analog Way file: cited or badged, never invented.
 *
 * One thing to know before editing. Barco quotes layer capacity three ways
 * across these four sheets — "16 mixable or 32 single", "2K mode: 16 / DL mode:
 * 8 / 4K mode: 4", and "4 mixable / 8 single per output screen" — and they are
 * all the same arithmetic seen from different sides:
 *
 *   • mixable : single      is always 1 : 2
 *   • 4K : DL : 2K          is always 1 : 2 : 4
 *
 * So the pool here is denominated in **4K mixable layers** and everything else
 * is a fraction of one. That is a restatement of Barco's numbers, not a model
 * of them.
 */

import type { Pool, Port } from '../lib/model/types.ts'
import type { VideoDevice } from '../lib/fit/evaluate.ts'
import { CAP, run } from './ports.ts'

const READ = '2026-08-20'
const BARCO = 'Barco'

const cite = (claim: string, source: string, url: string) => ({ claim, source, url, read: READ })

const URLS = {
  s3: 'https://assets.barco.com/m/756a8d099e81f90f/original/S3-Standalone-en-Spec-sheet.pdf',
  e2g1: 'https://assets.barco.com/m/753c2b29df077031/original/E2-en-Spec-sheet.pdf',
  e2g2: 'https://assets.barco.com/m/1da1a218bfbbede6/original/E2-Gen-2-en-Spec-sheet.pdf',
  e3: 'https://assets.barco.com/m/3dde766e9029e7f4/original/ENCORE3-en-Spec-sheet.pdf',
}

/** Barco's layer ladder, in 4K-mixable-layer units. */
const EM_LAYER_CLASSES = [
  { id: '2k', label: '2K layer', maxPixelRate: 2048 * 1200 * 60, cost: 0.25 },
  { id: 'dl', label: 'Dual-link layer', maxPixelRate: 2048 * 1200 * 60 * 2, cost: 0.5 },
  { id: '4k', label: '4K layer', maxPixelRate: 4096 * 2160 * 60, cost: 1 },
]

/**
 * The Event Master canvas budget, which every one of these chassis states the
 * same way: a smaller figure with preview available, a larger one without.
 */
function canvasPool(pvw: number, pgmOnly: number, at30: number | null, url: string, model: string): Pool {
  const alternates = [
    {
      id: 'pgm-only',
      label: 'PGM-only mode',
      capacity: pgmOnly,
      tradeoff: 'no preview and no multiviewer — you are cutting blind',
    },
  ]
  if (at30 != null) {
    alternates.push({
      id: 'pgm-30',
      label: 'PGM-only at 30p',
      capacity: at30,
      tradeoff: 'no preview, and the whole canvas drops to 30 Hz',
    })
  }
  return {
    id: 'canvas',
    label: 'Live effects canvas',
    capacity: pvw,
    unit: 'megapixels',
    scope: 'system',
    alternates,
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          `"Live effects canvas: Up to ${pvw} Megapixels PVW/PGM, ${pgmOnly} Megapixels PGM only${at30 != null ? `, ${at30} Megapixels @30p and PGM only` : ''}"`,
          `Barco, ${model} spec sheet, "General specifications"`,
          url,
        ),
      ],
      notes: [],
    },
  }
}

// =========================================================== S3 standalone

const s3Ports: Port[] = [
  ...run('IN-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 4, 'in', { cardId: 'in-1' }),
  ...run('IN-HDMI', 'hdmi', 'HDMI 1.4a', CAP.hdmi14(297e6), 4, 'in', { cardId: 'in-2' }),
  ...run('IN-DP', 'displayport', 'DisplayPort 1.1', CAP.dp11(300e6), 4, 'in', { cardId: 'in-3' }),
  ...run('OUT-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 4, 'out', {
    cardId: 'out-1',
    roles: ['program', 'aux'],
  }),
  ...run('OUT-HDMI', 'hdmi', 'HDMI 1.4a', CAP.hdmi14(297e6), 4, 'out', {
    cardId: 'out-2',
    roles: ['program', 'aux'],
  }),
  // Third output card: two plugs as a dedicated multiviewer, or four as a
  // standard output card. Modelled as four plugs that will do either job, with
  // the trade-off called out in the caveats.
  ...run('OUT-AUX', 'hdmi', 'HDMI 1.4a', CAP.hdmi14(297e6), 4, 'out', {
    cardId: 'out-3',
    roles: ['program', 'aux', 'multiviewer'],
  }),
]

const S3_STANDALONE: VideoDevice = {
  id: 'barco-s3-standalone',
  vendor: BARCO,
  family: 'Event Master',
  model: 'S3 standalone (NGS-3U)',
  profile: 'video',
  slots: { input: 3, output: 3, either: 0 },
  configs: [
    {
      id: 'stock',
      label: 'Stock loadout (3 in / 3 out cards)',
      stock: true,
      ports: s3Ports,
      pools: [
        {
          id: 'layers',
          label: 'Scalable PIP/key layers',
          capacity: 4,
          unit: '4K mixable layers',
          scope: 'system',
          alternates: [
            {
              id: 'single',
              label: 'single-layer mode',
              capacity: 8,
              tradeoff: 'single layers cut rather than mix, so a layer cannot cross-fade source',
            },
          ],
          provenance: {
            confidence: 'documented',
            citations: [
              cite(
                '"Flexible layer allocation – 4 mixable or 8 single scalable PIP/key layers assignable to any Program output screen"',
                'Barco, S3 STANDALONE spec sheet, "Mixers"',
                URLS.s3,
              ),
            ],
            notes: [
              'Barco states this figure without naming a layer resolution for the S3 standalone. Read here as 4K layers, consistent with the S3-4K BTO sheet\'s own 4K:DL:2K ladder — this is INFERRED, and a 2K-only reading would make the chassis four times more capable than shown.',
            ],
          },
        },
        canvasPool(20, 40, null, URLS.s3, 'S3 STANDALONE'),
        { id: 'output-plugs', label: 'Output connectors', capacity: 12, unit: 'plugs', scope: 'system' },
        { id: 'input-plugs', label: 'Input connectors', capacity: 12, unit: 'plugs', scope: 'system' },
      ],
    },
  ],
  rules: {
    layerCosting: { poolId: 'layers', classes: EM_LAYER_CLASSES, splitFactor: 0.5 },
    liveBackground: true,
    maxScreens: 8,
  },
  caveats: [
    'The third output card is either 2x HDMI dedicated to the multiviewer or 4x HDMI as a standard output — you cannot have both. If this show uses all twelve outputs, it has no multiviewer.',
    'Every input card here is HD-class: the S3 standalone takes up to 3x 4K inputs only by combining plugs, not on a single connector.',
  ],
  provenance: {
    confidence: 'documented',
    citations: [
      cite(
        '"12 HD inputs via 3 input cards: 4x SD/HD/3G SDI, 4x HDMI 1.4a (297 MHz max), 4x DisplayPort 1.1 (300 MHz max)" and "12 HD outputs via 3 output cards"',
        'Barco, S3 STANDALONE spec sheet, "Video inputs" / "Video outputs"',
        URLS.s3,
      ),
    ],
    notes: [],
  },
}

// ================================================================ E2 Gen 1

const E2_GEN1: VideoDevice = {
  id: 'barco-e2-gen1',
  vendor: BARCO,
  family: 'Event Master',
  model: 'E2 Gen 1 (NGS-4U)',
  profile: 'video',
  slots: { input: 8, output: 4, either: 0 },
  configs: [
    {
      id: 'stock',
      label: 'Stock loadout (8 in / 4 out cards)',
      stock: true,
      ports: [
        ...run('IN-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 12, 'in'),
        ...run('IN-HDMI', 'hdmi', 'HDMI 1.4a', CAP.hdmi14(297e6), 10, 'in'),
        ...run('IN-DP', 'displayport', 'DisplayPort 1.1', CAP.dp11(330e6), 10, 'in'),
        ...run('OUT-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 4, 'out', { roles: ['program', 'aux'] }),
        ...run('OUT-HDMI', 'hdmi', 'HDMI 1.4a', CAP.hdmi14(297e6), 8, 'out', {
          roles: ['program', 'aux'],
        }),
        ...run('MVR', 'hdmi', 'HDMI 1.4a (Multiviewer)', CAP.hdmi14(297e6), 2, 'out', {
          roles: ['multiviewer'],
        }),
      ],
      pools: [
        {
          id: 'layers',
          label: 'Seamless mixable PIP / key layers',
          capacity: 4,
          unit: '4K mixable layers',
          scope: 'system',
          alternates: [
            {
              id: 'single',
              label: 'single-layer mode',
              capacity: 8,
              tradeoff: 'single layers cut rather than mix',
            },
          ],
          provenance: {
            confidence: 'documented',
            citations: [
              cite(
                '"PIP layers (per chassis): 2K mode: 16 seamless mixable PiPs or key overlays; DL mode: 8; 4K mode: 4"',
                'Barco, E2 spec sheet, "PIP layers (per chassis)"',
                URLS.e2g1,
              ),
            ],
            notes: [
              'This is the clearest layer statement Barco publishes for any Event Master chassis, and it is where the 4K : DL : 2K = 1 : 2 : 4 ladder used across this file comes from.',
            ],
          },
        },
        canvasPool(20, 40, 80, URLS.e2g1, 'E2'),
        { id: 'input-plugs', label: 'Input connectors', capacity: 32, unit: 'plugs', scope: 'system' },
        { id: 'output-plugs', label: 'Output connectors', capacity: 14, unit: 'plugs', scope: 'system' },
      ],
    },
  ],
  rules: {
    layerCosting: { poolId: 'layers', classes: EM_LAYER_CLASSES, splitFactor: 0.5 },
    liveBackground: true,
    maxScreens: 16,
  },
  caveats: [
    'E2 Gen 1 is an HD-plug chassis: its HDMI is 1.4a at 297 MHz and its DisplayPort is 1.1. A single-cable 4K60 source will not go into it — 4K arrives as 2 or 4 cables, and the sheet caps the chassis at 8x 4K inputs and 3x 4K outputs however they are wired.',
    "Barco's own E2 Gen 1 spec sheet duplicates the Scaled Aux text into its Mixers row, so that row says nothing about layers. The layer figures here come from the separate \"PIP layers (per chassis)\" section instead.",
  ],
  provenance: {
    confidence: 'documented',
    citations: [
      cite(
        '"32 inputs via 8 input cards: 12 x SD/HD/3G SDI, 10 x HDMI 1.4a (297 Mpix/sec max), 10 x DisplayPort 1.1 (330 Mpix/sec max)" and "14 outputs via 4 output cards: 4 x SD/HD/3G SDI, 8 x HDMI 1.4a, 2 x HDMI 1.4a for Multiviewer"',
        'Barco, E2 spec sheet, "Video inputs" / "Video outputs"',
        URLS.e2g1,
      ),
    ],
    notes: [],
  },
}

// ================================================================ E2 Gen 2

const E2_GEN2: VideoDevice = {
  id: 'barco-e2-gen2',
  vendor: BARCO,
  family: 'Event Master',
  model: 'E2 Gen 2 (NGS-4U-V2)',
  profile: 'video',
  slots: { input: 8, output: 4, either: 0 },
  configs: [
    {
      id: 'stock',
      label: 'Stock loadout (8 in / 4 out Gen 2 cards)',
      stock: true,
      ports: [
        ...run('IN-SDI', 'sdi', '12G-SDI', CAP.sdi12g(), 16, 'in'),
        ...run('IN-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(600e6), 12, 'in'),
        ...run('IN-DP', 'displayport', 'DisplayPort 1.2', CAP.dp12(600e6), 12, 'in'),
        ...run('OUT-SDI', 'sdi', '12G-SDI', CAP.sdi12g(), 4, 'out', { roles: ['program', 'aux'] }),
        // Barco: "WITH MVR: Up to 6x 4K60p outputs and either 4x HDMI for FHD
        // Multi-viewers (1920x1200 max) OR 1x HDMI for UHD/4K60p Multi-viewer".
        // There is no dedicated multiviewer plug on this chassis — a multiviewer
        // costs you program outputs, which the caveat spells out.
        ...run('OUT-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(600e6), 13, 'out', {
          roles: ['program', 'aux', 'multiviewer'],
        }),
        ...run('OUT-DP', 'displayport', 'DisplayPort', CAP.dp12(660e6), 1, 'out', {
          roles: ['program', 'aux'],
        }),
      ],
      pools: [
        {
          id: 'layers',
          label: 'Scalable PIP/key layers',
          capacity: 16,
          unit: '4K mixable layers',
          scope: 'system',
          alternates: [
            {
              id: 'single',
              label: 'single-layer mode',
              capacity: 32,
              tradeoff: 'single layers cut rather than mix',
            },
          ],
          provenance: {
            confidence: 'documented',
            citations: [
              cite(
                '"up to 16 mixable or 32 single scalable PIP/key layers assignable to Program output screens"',
                'Barco, E2 GEN 2 spec sheet, "Mixers"',
                URLS.e2g2,
              ),
            ],
            notes: [
              'Barco does not restate the 4K/DL/2K ladder on the Gen 2 sheet; the ladder applied here is the Gen 1 sheet\'s, which is INFERRED for this chassis. Barco\'s own body copy ("With up to 32 layers available in HD… configured to support a mixture of HD and 4K") is consistent with it.',
            ],
          },
        },
        canvasPool(20, 40, 80, URLS.e2g2, 'E2 GEN 2'),
        { id: 'input-plugs', label: 'Input connectors', capacity: 40, unit: 'plugs', scope: 'system' },
        { id: 'output-plugs', label: 'Output connectors', capacity: 18, unit: 'plugs', scope: 'system' },
      ],
    },
  ],
  rules: {
    layerCosting: { poolId: 'layers', classes: EM_LAYER_CLASSES, splitFactor: 0.5 },
    liveBackground: true,
    maxScreens: 16,
  },
  caveats: [
    'The multiviewer costs outputs on E2 Gen 2: 8x 4K60 outputs with no multiviewer, or 6x 4K60 plus multiviewer feeds. This tool counts the plugs but does not model that swap — if the show uses a multiviewer, check the 4K output count by hand.',
    'The chassis carries 16x 4K inputs of the 40 connectors. A show wanting more than 16 single-cable 4K sources will not fit even though the plug count says otherwise.',
  ],
  provenance: {
    confidence: 'documented',
    citations: [
      cite(
        '"40 inputs via 8 input cards: 16 x SD/HD/3G/6G/12G connectors, 12 x HDMI 2.0 (600 MHz max), 12 x DisplayPort 1.2 (600 MHz max)" and "Up to 18 output connectors among 4 output cards: 4 x SDI, 13 x HDMI (up to 600 MHz), 1 x DisplayPort (up to 660 MHz)"',
        'Barco, E2 GEN 2 spec sheet, "Video inputs" / "Video outputs"',
        URLS.e2g2,
      ),
    ],
    notes: [],
  },
}

// ============================================================= ENCORE3 (E3)

/**
 * ENCORE3's standard configuration is quoted as connector *maxima* that add up
 * to more than the chassis runs: "up to 4x SDI, up to 9x HDMI 2.0, up to 5x DP
 * 1.2" for a system carrying 16 inputs. All eighteen plugs are listed and the
 * `input-plugs` pool caps the total at sixteen, which is correct in both
 * directions — a nine-HDMI show fits, a seventeen-source show does not.
 */
const E3: VideoDevice = {
  id: 'barco-encore3',
  vendor: BARCO,
  family: 'ENCORE3',
  model: 'ENCORE3 (E3)',
  profile: 'video',
  slots: { input: 7, output: 4, either: 0 },
  configs: [
    {
      id: 'standard',
      label: 'Standard configuration (4 in / 2 out Gen2 cards)',
      stock: true,
      ports: [
        ...run('IN-SDI', 'sdi', '12G-SDI', CAP.sdi12g(), 4, 'in'),
        ...run('IN-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 9, 'in'),
        ...run('IN-DP', 'displayport', 'DisplayPort 1.2', CAP.dp12(), 5, 'in'),
        ...run('OUT-SDI', 'sdi', '12G-SDI', CAP.sdi12g(), 4, 'out', {
          cardId: 'out-1',
          roles: ['program', 'aux'],
        }),
        ...run('OUT-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 5, 'out', {
          cardId: 'out-2',
          roles: ['program', 'aux'],
        }),
        ...run('OUT-DP', 'displayport', 'DisplayPort', CAP.dp12(), 1, 'out', {
          cardId: 'out-2',
          roles: ['program', 'aux'],
        }),
        ...run('MVR', 'hdmi', 'HDMI 2.0 (Multiviewer)', CAP.hdmi20(), 2, 'out', {
          roles: ['multiviewer'],
        }),
      ],
      pools: [
        {
          id: 'layers',
          label: 'Scalable PIP/key layers per screen',
          capacity: 4,
          unit: '4K mixable layers',
          scope: 'per-screen',
          alternates: [
            {
              id: 'expanded',
              label: 'expanded allocation',
              capacity: 16,
              tradeoff:
                'the pre-assigned allocation is 4 mixable per screen; going beyond it reallocates resource from other screens, so not every screen can have 16',
            },
          ],
          provenance: {
            confidence: 'documented',
            citations: [
              cite(
                '"Pre-assigned 4 mixable / 8 single (up to 16 mixable / 32 single) scalable PIP/key layers per output screen"',
                'Barco, ENCORE3 spec sheet, "Mixers"',
                URLS.e3,
              ),
            ],
            notes: [
              'The 4-per-screen figure is what a screen gets without reallocation, which is why it is the capacity and 16 is the alternate. Barco does not publish the reallocation rules, so the alternate is offered as a trade-off rather than modelled.',
            ],
          },
        },
        {
          id: 'input-plugs',
          label: 'Input connectors',
          capacity: 16,
          unit: 'plugs',
          scope: 'system',
          provenance: {
            confidence: 'documented',
            citations: [
              cite(
                '"Standard Encore3 Configuration: 16x 4K @60p inputs; up to 4x HD/3G/6G/12G SDI connectors; up to 9x HDMI 2.0; up to 5x DisplayPort 1.2"',
                'Barco, ENCORE3 spec sheet, "Video inputs"',
                URLS.e3,
              ),
            ],
            notes: [],
          },
        },
        {
          id: 'output-plugs',
          label: 'Output connectors',
          capacity: 8,
          unit: 'plugs',
          scope: 'system',
          provenance: {
            confidence: 'documented',
            citations: [
              cite(
                '"Standard Encore3 Configuration: 8x 4K@60p outputs; up to 4x HD/3G/6G/12G SDI connectors; up to 5x HDMI 2.0; up to 1x DisplayPort"',
                'Barco, ENCORE3 spec sheet, "Video outputs"',
                URLS.e3,
              ),
            ],
            notes: [],
          },
        },
      ],
    },
  ],
  rules: {
    layerCosting: { poolId: 'layers', classes: EM_LAYER_CLASSES, splitFactor: 0.5 },
    liveBackground: true,
    maxScreens: 8,
  },
  caveats: [
    'ENCORE3 is a Build-To-Order chassis with 7 input-capable and 4 output-capable card slots; the standard configuration fills 4 and 2 of them. A show that misses on plug count may well fit a different card loadout — that is what the custom-loadout view is for.',
    'The standard configuration\'s published connector counts (4 SDI + 9 HDMI + 5 DP) add up to 18 for a 16-input system, so the connector mix is flexible within a 16-input total. This tool caps the total at 16 rather than fixing the mix.',
  ],
  provenance: {
    confidence: 'documented',
    citations: [
      cite(
        '"Up to 7 input capable card slots… each input card supports up to 4x 4K @60p inputs" and "Up to 4 output capable card slots… each output card supports up to 4x 4K @60p outputs"; standard configuration 16x in / 8x out',
        'Barco, ENCORE3 spec sheet, "Video inputs" / "Video outputs"',
        URLS.e3,
      ),
    ],
    notes: [],
  },
}

export const BARCO_DEVICES: VideoDevice[] = [S3_STANDALONE, E2_GEN1, E2_GEN2, E3]

/** Re-exported so tests can assert the ladder has not been quietly changed. */
export { EM_LAYER_CLASSES }

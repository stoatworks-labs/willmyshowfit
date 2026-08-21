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

import type { Card, Pool, Port } from '../lib/model/types.ts'
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
  e2tri: 'https://assets.barco.com/m/3d46b7fb2bf0dda9/original/E2-Tri-combo-en-Spec-sheet.pdf',
  s3tri: 'https://assets.barco.com/m/75c834964686437e/original/S3-Tri-combo-Gen-2-en-Spec-sheet.pdf',
}

// ===================================================== the card catalogue
//
// Barco does not publish a per-card connector table in the four chassis spec
// sheets this file was built from — which is why loadout suggestions were
// unavailable for Event Master at first. The **Tri-combo** sheets do publish
// it, in passing, while describing their own pre-loaded configurations:
//
//   "40 inputs via 8 input cards (HDMI/DP combo 4 inputs, Tri-combo 6 inputs
//    per card)"                                                  — E2 Tri-combo
//   "TriCombo output card supports 4 x SD/HD/3G/6G/12G 1x HDMI 2.0, and
//    1x DisplayPort 1.2 connectors"                              — E2 Tri-combo
//   "14 FHD@60 inputs via 3 input cards (DP1.2 and HDMI 2.0 4 inputs ea,
//    Tri-combo 6 inputs)"                                — S3 Tri-combo Gen 2
//
// Those three statements pin the Gen 2 cards outright, and the Gen 1 cards
// fall out of chassis arithmetic that reconciles exactly on three different
// chassis — see the note on each card. Where a card is arithmetic rather than
// print, it says `inferred`.

/** Two connectors on one card with different ceilings — a real Barco quirk. */
const hdmi14Asym = (fast: boolean): Port['cap'] => CAP.hdmi14(fast ? 297e6 : 165e6)

const BEM_GEN1_CARDS: Card[] = [
  {
    id: 'bem-in-sdi-quad-g1',
    label: '4x 3G-SDI input card (Gen 1)',
    slot: 'input',
    max4k60: 1,
    ports: Array.from({ length: 4 }, () => ({
      kind: 'sdi' as const,
      label: '3G-SDI',
      direction: 'in' as const,
      cap: CAP.sdi3g(),
    })),
    provenance: {
      confidence: 'inferred',
      citations: [
        cite(
          'E2 Gen 1: "32 inputs via 8 input cards … 12 x SD/HD/3G SDI, 10 x HDMI 1.4a, 10 x DisplayPort 1.1"',
          'Barco, E2 spec sheet, "Video inputs"',
          URLS.e2g1,
        ),
      ],
      notes: [
        'Four SDI per card is arithmetic, not print: 12 SDI over 3 cards plus 10 HDMI and 10 DP over 5 combo cards is exactly the 8 input cards the sheet states. No other split of those 32 inputs across 8 cards works.',
      ],
    },
  },
  {
    id: 'bem-in-hdmi-dp-combo-g1',
    label: '2x HDMI 1.4a + 2x DP 1.1 combo input card (Gen 1)',
    slot: 'input',
    max4k60: 1,
    ports: [
      { kind: 'hdmi' as const, label: 'HDMI 1.4a', direction: 'in' as const, cap: CAP.hdmi14(297e6) },
      { kind: 'hdmi' as const, label: 'HDMI 1.4a', direction: 'in' as const, cap: CAP.hdmi14(297e6) },
      { kind: 'displayport' as const, label: 'DisplayPort 1.1', direction: 'in' as const, cap: CAP.dp11(300e6) },
      { kind: 'displayport' as const, label: 'DisplayPort 1.1', direction: 'in' as const, cap: CAP.dp11(300e6) },
    ],
    provenance: {
      confidence: 'inferred',
      citations: [
        cite(
          '"40 inputs via 8 input cards (HDMI/DP combo 4 inputs, Tri-combo 6 inputs per card)" and "Up to 12x 4K inputs — (HDMI/DP combo 1x 4K@60p, Tri-Combo 2x 4K@60p per card)"',
          'Barco, E2 Tri-combo spec sheet, "Video inputs"',
          URLS.e2tri,
        ),
      ],
      notes: [
        'Barco names this card and states it carries four inputs, but not the 2+2 split. That split is forced by the chassis totals: the E2 Tri-combo lists 8x HDMI 1.4a and 8x DP 1.1 across four of these cards.',
      ],
    },
  },
  {
    id: 'bem-out-sdi-quad-g1',
    label: '4x 3G-SDI output card (Gen 1)',
    slot: 'output',
    max4k60: 1,
    ports: Array.from({ length: 4 }, () => ({
      kind: 'sdi' as const,
      label: '3G-SDI',
      direction: 'out' as const,
      cap: CAP.sdi3g(),
      roles: ['program', 'aux'] as Port['roles'],
    })),
    provenance: {
      confidence: 'inferred',
      citations: [
        cite(
          'E2 Gen 1: "14 outputs via 4 output cards … 4 x SD/HD/3G SDI, 8 x HDMI 1.4a, 2 x HDMI 1.4a for Multiviewer"',
          'Barco, E2 spec sheet, "Video outputs"',
          URLS.e2g1,
        ),
      ],
      notes: ['Four per card, matching the input side and the chassis totals.'],
    },
  },
  {
    id: 'bem-out-hdmi14-quad-g1',
    label: '4x HDMI 1.4a output card (Gen 1)',
    slot: 'output',
    max4k60: 1,
    ports: [
      // ☠️ The four connectors on this card are NOT equal. Barco: "The top two
      // connectors of the card support up to 297 MPix/sec (2560x1600 typical).
      // The bottom two connectors support 165 MPix/sec (1920x1200 typical)."
      // Modelling all four at 297 would claim two outputs the card has not got.
      { kind: 'hdmi' as const, label: 'HDMI 1.4a (top, 297 MPix/s)', direction: 'out' as const, cap: hdmi14Asym(true), roles: ['program', 'aux'] as Port['roles'] },
      { kind: 'hdmi' as const, label: 'HDMI 1.4a (top, 297 MPix/s)', direction: 'out' as const, cap: hdmi14Asym(true), roles: ['program', 'aux'] as Port['roles'] },
      { kind: 'hdmi' as const, label: 'HDMI 1.4a (bottom, 165 MPix/s)', direction: 'out' as const, cap: hdmi14Asym(false), roles: ['program', 'aux'] as Port['roles'] },
      { kind: 'hdmi' as const, label: 'HDMI 1.4a (bottom, 165 MPix/s)', direction: 'out' as const, cap: hdmi14Asym(false), roles: ['program', 'aux'] as Port['roles'] },
    ],
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          '"3x HDMI 1.4a output cards support 4 HDMI connectors each. The top two connectors of the card support up to 297 MPix/sec (2560x1600 typical). The bottom two connectors support 165 MPix/sec (1920x1200 typical)."',
          'Barco, E2 Tri-combo spec sheet, "Video outputs"',
          URLS.e2tri,
        ),
      ],
      notes: [
        'The four connectors are not equal, and it matters: a show wanting four 2560x1600 outputs needs two of these cards, not one.',
      ],
    },
  },
]

const BEM_GEN2_CARDS: Card[] = [
  {
    id: 'bem-in-tricombo-g2',
    label: '4K60 Tri-combo input card (Gen 2)',
    slot: 'input',
    max4k60: 2,
    ports: [
      ...Array.from({ length: 4 }, () => ({
        kind: 'sdi' as const,
        label: '12G-SDI',
        direction: 'in' as const,
        cap: CAP.sdi12g(),
      })),
      { kind: 'hdmi' as const, label: 'HDMI 2.0', direction: 'in' as const, cap: CAP.hdmi20() },
      { kind: 'displayport' as const, label: 'DisplayPort 1.2', direction: 'in' as const, cap: CAP.dp12() },
    ],
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          '"Tri-combo 6 inputs per card" and "TriCombo output card supports 4 x SD/HD/3G/6G/12G 1x HDMI 2.0, and 1x DisplayPort 1.2 connectors"; the S3 Tri-combo Gen 2 sheet lists "4x SD/HD/3G/6G/12G SDI connectors (Tri-Combo card)"',
          'Barco, E2 Tri-combo and S3 Tri-combo Gen 2 spec sheets',
          URLS.e2tri,
        ),
      ],
      notes: [
        'Six connectors, but Barco caps the card at 2x 4K@60p — so all six cannot be 4K at once. This tool counts the plugs and does not model that cap; check it by hand on a 4K-heavy build.',
      ],
    },
  },
  {
    id: 'bem-in-hdmi20-quad-g2',
    label: '4x HDMI 2.0 input card (Gen 2)',
    slot: 'input',
    max4k60: 2,
    ports: Array.from({ length: 4 }, () => ({
      kind: 'hdmi' as const,
      label: 'HDMI 2.0',
      direction: 'in' as const,
      cap: CAP.hdmi20(),
    })),
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          '"14 FHD@60 inputs via 3 input cards (DP1.2 and HDMI™ 2.0 4 inputs ea, Tri-combo 6 inputs)"',
          'Barco, S3 Tri-combo Gen 2 spec sheet, "Video inputs"',
          URLS.s3tri,
        ),
      ],
      notes: [],
    },
  },
  {
    id: 'bem-in-dp12-quad-g2',
    label: '4x DisplayPort 1.2 input card (Gen 2)',
    slot: 'input',
    max4k60: 2,
    ports: Array.from({ length: 4 }, () => ({
      kind: 'displayport' as const,
      label: 'DisplayPort 1.2',
      direction: 'in' as const,
      cap: CAP.dp12(600e6),
    })),
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          '"14 FHD@60 inputs via 3 input cards (DP1.2 and HDMI™ 2.0 4 inputs ea, Tri-combo 6 inputs)"',
          'Barco, S3 Tri-combo Gen 2 spec sheet, "Video inputs"',
          URLS.s3tri,
        ),
      ],
      notes: [],
    },
  },
  {
    id: 'bem-out-tricombo-g2',
    label: '4K60 Tri-combo output card (Gen 2)',
    slot: 'output',
    max4k60: 2,
    ports: [
      ...Array.from({ length: 4 }, () => ({
        kind: 'sdi' as const,
        label: '12G-SDI',
        direction: 'out' as const,
        cap: CAP.sdi12g(),
        roles: ['program', 'aux'] as Port['roles'],
      })),
      { kind: 'hdmi' as const, label: 'HDMI 2.0', direction: 'out' as const, cap: CAP.hdmi20(), roles: ['program', 'aux'] as Port['roles'] },
      { kind: 'displayport' as const, label: 'DisplayPort 1.2', direction: 'out' as const, cap: CAP.dp12(), roles: ['program', 'aux'] as Port['roles'] },
    ],
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          '"TriCombo output card supports 4 x SD/HD/3G/6G/12G 1x HDMI 2.0, and 1x DisplayPort 1.2 connectors" and "Tri-combo supports 2 4K60p or 6 HD"',
          'Barco, E2 Tri-combo spec sheet, "Video outputs"',
          URLS.e2tri,
        ),
      ],
      notes: ['Six connectors, capped at 2x 4K60p — the plug count is not the 4K count.'],
    },
  },
  {
    id: 'bem-out-hdmi20-quad-g2',
    label: '4x HDMI 2.0 output card (Gen 2)',
    slot: 'output',
    max4k60: 2,
    ports: Array.from({ length: 4 }, () => ({
      kind: 'hdmi' as const,
      label: 'HDMI 2.0',
      direction: 'out' as const,
      cap: CAP.hdmi20(),
      roles: ['program', 'aux'] as Port['roles'],
    })),
    provenance: {
      confidence: 'documented',
      citations: [
        cite(
          '"14x FHD@60 /12x 4K@30 / 6x 4K@60 outputs via 3 output cards (HDMI™ 2.0 4 outputs ea, Tri-combo 6 outputs)"; "HDMI output card supports 1 4K60p or 4 HD"',
          'Barco, S3 Tri-combo Gen 2 and E2 Tri-combo spec sheets, "Video outputs"',
          URLS.s3tri,
        ),
      ],
      notes: ['Four HD outputs or one 4K60 — the plug count is not the 4K count.'],
    },
  },
]

/** Gen 2 cards drop into the Gen 1 chassis too; the reverse is not true of E3. */
const BEM_ALL_CARDS: Card[] = [...BEM_GEN1_CARDS, ...BEM_GEN2_CARDS]

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


/**
 * Barco's two capacity limits, both separate from the connector count and both
 * usually the binding one. The per-card one lives on `DeviceConfig.cardCapacity`
 * (per slot, since a chassis can mix card ratings); this builds the other.
 *
 * **Per card.** "HDMI output card supports 1 4K60p or 4 HD" — a Gen 1 card has
 * four connectors and takes exactly one 4K60 signal, so a single 4K60 source
 * consumes the whole card and the other three sockets are dead.
 *
 * **Per chassis.** The backplane caps the box below the sum of its cards. An
 * E2 Gen 1 has four output cards good for one 4K60 each and is still limited to
 * three 4K outputs.
 *
 * Both are denominated in 4K60 signals and spent on Barco's own 1 : 2 : 4
 * ladder — 4K60 costs 1, 4K30 or dual-link 0.5, HD 0.25 — which makes four HD
 * signals exactly fill a one-4K60 card, as the vendor's wording says they do.
 */
function chassisCapacity(
  direction: 'in' | 'out',
  total4k: number,
  claim: string,
  url: string,
  model: string,
): Pool {
  return {
    id: direction === 'in' ? 'chassis-4k-in' : 'chassis-4k-out',
    label: `4K60 ${direction === 'in' ? 'inputs' : 'outputs'} for the whole chassis`,
    capacity: total4k,
    unit: '4K60 signals',
    scope: 'system',
    provenance: {
      confidence: 'documented',
      citations: [cite(claim, `Barco, ${model} spec sheet`, url)],
      notes: [
        'The backplane limit, which can be lower than the sum of the fitted cards — the E2 Gen 1 has four output cards good for one 4K60 each and still caps at three.',
      ],
    },
  }
}

/** Ports for one card, tagged with its slot id so capacity can be charged. */
function card(
  cardId: string,
  ports: Omit<Port, 'cardId'>[],
): Port[] {
  return ports.map((p) => ({ ...p, cardId }))
}

const sdi3g = (id: string, n: number, dir: 'in' | 'out', from: number, cardId: string): Port[] =>
  card(cardId, run(id, 'sdi', '3G-SDI', CAP.sdi3g(), n, dir, {
    from,
    ...(dir === 'out' ? { roles: ['program', 'aux'] as Port['roles'] } : {}),
  }))

const sdi12g = (id: string, n: number, dir: 'in' | 'out', from: number, cardId: string): Port[] =>
  card(cardId, run(id, 'sdi', '12G-SDI', CAP.sdi12g(), n, dir, {
    from,
    ...(dir === 'out' ? { roles: ['program', 'aux'] as Port['roles'] } : {}),
  }))

// =========================================================== S3 standalone

const s3Ports: Port[] = [
  ...run('IN-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 4, 'in', { cardId: 'in-1' }),
  ...run('IN-HDMI', 'hdmi', 'HDMI 1.4a', CAP.hdmi14(297e6), 4, 'in', { cardId: 'in-2' }),
  ...run('IN-DP', 'displayport', 'DisplayPort 1.1', CAP.dp11(300e6), 4, 'in', { cardId: 'in-3' }),
  ...run('OUT-SDI', 'sdi', '3G-SDI', CAP.sdi3g(), 4, 'out', {
    cardId: 'out-1',
    roles: ['program', 'aux'],
  }),
  // Same Gen 1 quad output card as the E2: two fast connectors, two slow.
  ...run('OUT-HDMI', 'hdmi', 'HDMI 1.4a (297 MPix/s)', CAP.hdmi14(297e6), 2, 'out', {
    cardId: 'out-2',
    roles: ['program', 'aux'],
  }),
  ...run('OUT-HDMI-B', 'hdmi', 'HDMI 1.4a (165 MPix/s)', CAP.hdmi14(165e6), 2, 'out', {
    cardId: 'out-2',
    roles: ['program', 'aux'],
  }),
  // Third output card: two plugs as a dedicated multiviewer, or four as a
  // standard output card. Modelled as four plugs that will do either job, with
  // the trade-off called out in the caveats.
  ...run('OUT-AUX', 'hdmi', 'HDMI 1.4a (297 MPix/s)', CAP.hdmi14(297e6), 2, 'out', {
    cardId: 'out-3',
    roles: ['program', 'aux', 'multiviewer'],
  }),
  ...run('OUT-AUX-B', 'hdmi', 'HDMI 1.4a (165 MPix/s)', CAP.hdmi14(165e6), 2, 'out', {
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
  availableCards: BEM_ALL_CARDS,
  configs: [
    {
      id: 'stock',
      label: 'Stock loadout (3 in / 3 out cards)',
      stock: true,
      ports: s3Ports,
      // Gen 1 cards: four connectors, one 4K60 between them.
      cardCapacity: { 'in-1': 1, 'in-2': 1, 'in-3': 1, 'out-1': 1, 'out-2': 1, 'out-3': 1 },
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
        chassisCapacity('in', 3, '"Up to 3x 4K inputs"', URLS.s3, 'S3 STANDALONE'),
        chassisCapacity('out', 3, '"Up to 3x 4K outputs"', URLS.s3, 'S3 STANDALONE'),
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
    'The HDMI outputs are not interchangeable. On each Gen 1 quad output card the top two connectors run to 297 MPix/s and the bottom two only to 165, so half the HDMI outputs will not carry 2560x1600.',
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
  availableCards: BEM_ALL_CARDS,
  configs: [
    {
      id: 'stock',
      label: 'Stock loadout (8 in / 4 out cards)',
      stock: true,
      ports: [
        // 32 inputs over 8 cards: three quad-SDI, five HDMI/DP combo (2+2).
        ...[0, 1, 2].flatMap((c) => sdi3g('IN-SDI', 4, 'in', c * 4 + 1, `in-${c + 1}`)),
        ...[0, 1, 2, 3, 4].flatMap((c) => [
          ...card(`in-${c + 4}`, run('IN-HDMI', 'hdmi', 'HDMI 1.4a', CAP.hdmi14(297e6), 2, 'in', { from: c * 2 + 1 })),
          ...card(`in-${c + 4}`, run('IN-DP', 'displayport', 'DisplayPort 1.1', CAP.dp11(330e6), 2, 'in', { from: c * 2 + 1 })),
        ]),
        // 14 outputs over 4 cards: one quad-SDI, three quad-HDMI (2 fast + 2 slow each).
        ...sdi3g('OUT-SDI', 4, 'out', 1, 'out-1'),
        ...[0, 1].flatMap((c) => [
          ...card(`out-${c + 2}`, run(`OUT-HDMI${c ? '-C' : ''}`, 'hdmi', 'HDMI 1.4a (297 MPix/s)', CAP.hdmi14(297e6), 2, 'out', { from: 1, roles: ['program', 'aux'] })),
          ...card(`out-${c + 2}`, run(`OUT-HDMI${c ? '-D' : '-B'}`, 'hdmi', 'HDMI 1.4a (165 MPix/s)', CAP.hdmi14(165e6), 2, 'out', { from: 1, roles: ['program', 'aux'] })),
        ]),
        ...card('out-4', run('MVR', 'hdmi', 'HDMI 1.4a (Multiviewer)', CAP.hdmi14(297e6), 2, 'out', {
          roles: ['multiviewer'],
        })),
      ],
      // "Up to 8 x 4K inputs - each input card supports up to 4K@60p": one
      // 4K60 per Gen 1 card, whatever its four connectors happen to be.
      cardCapacity: Object.fromEntries([
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`in-${n}`, 1]),
        ...[1, 2, 3, 4].map((n) => [`out-${n}`, 1]),
      ]),
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
        chassisCapacity('in', 8, '"Up to 8 x 4K inputs"', URLS.e2g1, 'E2'),
        chassisCapacity('out', 3, '"Up to 3 x 4K outputs" — three, though four output cards are fitted', URLS.e2g1, 'E2'),
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
    'An Event Master Gen 1 card takes ONE 4K60 signal across its four connectors — Barco\'s wording is "1 4K60p or 4 HD" — so a single 4K60 source consumes a whole card and leaves its other three sockets unusable. That, not the 32-connector count, is why this chassis caps at 8x 4K in and 3x 4K out.',
    'The eight HDMI outputs are not interchangeable: on each quad output card the top two connectors run to 297 MPix/s and the bottom two only to 165. Four of the eight will not carry 2560x1600. The chassis spec sheet quotes only the 297 figure; the per-connector split is on the Tri-combo sheet.',
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
  availableCards: BEM_ALL_CARDS,
  configs: [
    {
      id: 'stock',
      label: 'Stock loadout (8 in / 4 out Gen 2 cards)',
      stock: true,
      ports: [
        // 40 inputs over 8 Gen 2 cards: four Tri-combo (4 SDI + 1 HDMI + 1 DP),
        // two HDMI 2.0 quad, two DP 1.2 quad.
        ...[0, 1, 2, 3].flatMap((c) => [
          ...sdi12g('IN-SDI', 4, 'in', c * 4 + 1, `in-${c + 1}`),
          ...card(`in-${c + 1}`, run('IN-TC-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(600e6), 1, 'in', { from: c + 1 })),
          ...card(`in-${c + 1}`, run('IN-TC-DP', 'displayport', 'DisplayPort 1.2', CAP.dp12(600e6), 1, 'in', { from: c + 1 })),
        ]),
        ...[0, 1].flatMap((c) =>
          card(`in-${c + 5}`, run('IN-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(600e6), 4, 'in', { from: c * 4 + 1 })),
        ),
        ...[0, 1].flatMap((c) =>
          card(`in-${c + 7}`, run('IN-DP', 'displayport', 'DisplayPort 1.2', CAP.dp12(600e6), 4, 'in', { from: c * 4 + 1 })),
        ),
        // 18 outputs over 4 cards: one Tri-combo, three HDMI 2.0 quad.
        ...sdi12g('OUT-SDI', 4, 'out', 1, 'out-1'),
        ...card('out-1', run('OUT-TC-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(600e6), 1, 'out', { roles: ['program', 'aux', 'multiviewer'] })),
        ...card('out-1', run('OUT-DP', 'displayport', 'DisplayPort', CAP.dp12(660e6), 1, 'out', { roles: ['program', 'aux'] })),
        ...[0, 1, 2].flatMap((c) =>
          card(`out-${c + 2}`, run('OUT-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(600e6), 4, 'out', {
            from: c * 4 + 1,
            roles: ['program', 'aux', 'multiviewer'],
          })),
        ),
      ],
      // Gen 2 cards take two 4K60 each — the real difference between the
      // generations, since the slot count is identical.
      cardCapacity: Object.fromEntries([
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`in-${n}`, 2]),
        ...[1, 2, 3, 4].map((n) => [`out-${n}`, 2]),
      ]),
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
        chassisCapacity('in', 16, '"Up to 16 x 4K inputs"', URLS.e2g2, 'E2 GEN 2'),
        chassisCapacity('out', 8, '"NO MVR: Up to 8 x 4K60p outputs"', URLS.e2g2, 'E2 GEN 2'),
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
    'A Gen 2 card takes two 4K60 signals across its connectors, twice the Gen 1 card. That is the real difference between the two generations of this chassis: same slot count, double the 4K throughput.',
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
  // ENCORE3 takes Gen 2 cards only: "Up to 7 input capable card slots to
  // occupy with Event Master Gen2 cards".
  availableCards: BEM_GEN2_CARDS,
  configs: [
    {
      id: 'standard',
      label: 'Standard configuration (4 in / 2 out Gen2 cards)',
      stock: true,
      ports: [
        // Four input cards in the standard configuration. Barco publishes the
        // connector maxima (4 SDI / 9 HDMI / 5 DP) rather than a fixed card
        // layout, so plugs are spread evenly across the four cards; the
        // `input-plugs` pool is what actually caps the total at sixteen.
        ...card('in-1', run('IN-SDI', 'sdi', '12G-SDI', CAP.sdi12g(), 4, 'in')),
        ...card('in-2', run('IN-HDMI', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 4, 'in', { from: 1 })),
        ...card('in-3', run('IN-HDMI-B', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 4, 'in', { from: 5 })),
        ...card('in-4', run('IN-HDMI-C', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 1, 'in', { from: 9 })),
        ...card('in-4', run('IN-DP', 'displayport', 'DisplayPort 1.2', CAP.dp12(), 3, 'in', { from: 1 })),
        ...card('in-3', run('IN-DP-B', 'displayport', 'DisplayPort 1.2', CAP.dp12(), 2, 'in', { from: 4 })),
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
      // "Each input card supports up to 4x 4K @60p inputs" — ENCORE3's cards
      // are twice the Gen 2 Event Master card again.
      cardCapacity: { 'in-1': 4, 'in-2': 4, 'in-3': 4, 'in-4': 4, 'out-1': 4, 'out-2': 4 },
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
        chassisCapacity('in', 16, '"Standard Encore3 Configuration: 16x 4K @60p inputs"', URLS.e3, 'ENCORE3'),
        chassisCapacity('out', 8, '"Standard Encore3 Configuration: 8x 4K@60p outputs"', URLS.e3, 'ENCORE3'),
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

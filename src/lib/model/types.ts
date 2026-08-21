/**
 * The generic core.
 *
 * Everything in this file is deliberately discipline-agnostic: a device is a
 * bag of typed ports and a set of capacity pools, and a "show" is a set of
 * demands placed on them. Video is the first profile written against it
 * (`profiles/video.ts`); a sound-desk profile would add its own port kinds and
 * pool scopes and reuse the solver unchanged.
 *
 * The rule that keeps this honest: NOTHING in the core knows what a "layer" or
 * a "screen" is. If a concept only makes sense for video, it belongs in the
 * video profile, not here.
 */

// ---------------------------------------------------------------- provenance

export interface Citation {
  /** The claim in the source's own terms — not a paraphrase, and not "see website". */
  claim: string
  /** The document, named well enough that someone else could find it again. */
  source: string
  url?: string
  /** ISO date the source was read. */
  read: string
}

/**
 * How much weight a number will bear.
 *
 * `documented`  stated in a vendor manual or spec sheet, and cited.
 * `inferred`    follows necessarily from something documented (an HDMI 2.0 plug
 *               cannot exceed 600 MHz) but the vendor does not state it.
 * `unverified`  a working assumption, badged as such everywhere it is used.
 *
 * Nothing may be `documented` without a citation. A test enforces that, so it
 * survives people (and models) editing the data files in a hurry.
 */
export type Confidence = 'documented' | 'inferred' | 'unverified'

export interface Provenance {
  confidence: Confidence
  citations: Citation[]
  notes: string[]
}

// --------------------------------------------------------------------- ports

export type ConnectorKind =
  | 'hdmi'
  | 'displayport'
  | 'dvi'
  | 'sdi'
  | 'sfp'
  | 'fiber'
  | 'ndi'
  | 'analog-audio'
  | 'dante'

export type PortDirection = 'in' | 'out'

/**
 * What a plug can carry.
 *
 * `maxPixelRateHz` is the vendor's own ceiling on pixels per second including
 * blanking. Vendors quote this three different ways — "600 MHz max", "297
 * Mpix/sec max", "165 MHz" — and they all mean this number. Where a vendor
 * quotes a format instead of a rate, the rate recorded is the standard rate for
 * that format and the note says so.
 */
export interface PortCapability {
  maxPixelRateHz: number
  maxBpc: 8 | 10 | 12 | 16
  sampling: Sampling[]
  /** DisplayPort link budget. Both this and maxPixelRateHz must pass. */
  dpLaneGbps?: number
  dpLanes?: number
  /** Highest SDI rate class the plug supports. */
  sdiClass?: SdiClass
  hdcp: string[]
}

export type Sampling = 'rgb444' | 'ycbcr444' | 'ycbcr422' | 'ycbcr420'
export type SdiClass = 'sd' | 'hd' | '3g' | '6g' | '12g'

export interface Port {
  id: string
  kind: ConnectorKind
  /** As the vendor writes it: "HDMI 2.0", "DisplayPort 1.2", "12G-SDI". */
  label: string
  direction: PortDirection
  cap: PortCapability
  /**
   * Mirrored plugs: one signal path, two physical connectors, and using one
   * does not free the other. A Midra 4K output is an HDMI and a 12G-SDI plug
   * carrying identical content; an Alta output adds SFP+ to the same group.
   * Ports sharing a `mirrorGroup` are ONE assignable resource.
   */
  mirrorGroup?: string
  /**
   * Multi-plug inputs where exactly one connector may be active at a time
   * (Midra 4K inputs 1 & 2 are "HDMI 1.4 or 3G-SDI, pick one"). Same
   * consequence as a mirror group for counting, different reason, and the UI
   * words it differently.
   */
  selectGroup?: string
  /** Restricts what the plug may be used for. Absent means anything. */
  roles?: PortRole[]
  /** Which installed card this plug belongs to, for card-aware reporting. */
  cardId?: string
}

export type PortRole = 'program' | 'aux' | 'multiviewer' | 'source'

// --------------------------------------------------------------------- pools

/**
 * Where a pool's capacity is counted.
 *
 * This is the distinction that stops the engine quietly lying. Barco and Analog
 * Way budget layers across the whole system; PixelHue budgets them **per output
 * card**, so an F8 with sixteen 4K layers of headroom still cannot put three 4K
 * layers on one screen if that screen lives on a single output card. Same
 * number, completely different answer.
 *
 * The per-card scopes also carry Barco's **card capacity**, which is a separate
 * limit from the connector count and usually the binding one: an Event Master
 * Gen 1 card has four connectors but takes only ONE 4K60 signal, so a single
 * 4K60 source consumes the whole card and the other three sockets are dead.
 * Counting connectors alone overstates such a chassis enormously.
 */
export type PoolScope =
  | 'system'
  | 'per-screen'
  | 'per-output'
  | 'per-input-card'
  | 'per-output-card'

export interface Pool {
  id: string
  label: string
  /** Capacity in `unit`s, per instance of the scope. */
  capacity: number
  unit: string
  scope: PoolScope
  /**
   * Capacity available only when the device gives something else up, with the
   * cost spelled out. Barco's canvas is 20 MP with preview, 40 MP without.
   */
  alternates?: PoolAlternate[]
  provenance?: Provenance
}

export interface PoolAlternate {
  id: string
  label: string
  capacity: number
  /** What it costs, in plain words, shown verbatim in the report. */
  tradeoff: string
}

// -------------------------------------------------------------------- cards

/** A field-swappable I/O card, for the devices built out of them. */
export interface Card {
  id: string
  label: string
  slot: 'input' | 'output' | 'either'
  /** Ports the card contributes, as templates — ids are assigned on fitting. */
  ports: Omit<Port, 'id' | 'cardId'>[]
  /** Pools the card itself contributes (PixelHue budgets layers per card). */
  pools?: Pool[]
  /**
   * How many 4K60 signals the card carries, which is NOT its connector count.
   * Barco's Gen 1 cards have four connectors and take one 4K60 between them
   * ("1 4K60p or 4 HD"); a Tri-combo has six and takes two. A single 4K60
   * source therefore consumes a whole Gen 1 card and strands its other three
   * sockets — the limit people actually get caught by.
   */
  max4k60?: number
  provenance?: Provenance
}

export interface ChassisSlots {
  input: number
  output: number
  /** Slots that will take either an input or an output card (Barco EX, E3). */
  either: number
}

// -------------------------------------------------------------------- device

/**
 * A named, orderable configuration of a device.
 *
 * Every device has at least one — for a fixed-format switcher it is the only
 * one and is called "Standard". For card-based chassis the stock/factory
 * loadout is one config; the custom-loadout solver will generate others.
 */
export interface DeviceConfig {
  id: string
  label: string
  /** True for the loadout the vendor ships as standard. */
  stock: boolean
  ports: Port[]
  pools: Pool[]
  cards?: { cardId: string; count: number }[]
  /**
   * Slot id → how many 4K60 signals the card in that slot carries.
   *
   * Per-slot rather than per-chassis, because a chassis can be fitted with
   * cards of different capacities: Barco's E2 Tri-combo is a Gen 1 chassis
   * carrying both 1x-4K60 combo cards and 2x-4K60 Tri-combo cards.
   */
  cardCapacity?: Record<string, number>
  provenance?: Provenance
}

export interface Device<TRules = unknown> {
  id: string
  vendor: string
  family: string
  model: string
  /** Which profile's rules apply. Today always 'video'. */
  profile: 'video' | 'audio'
  configs: DeviceConfig[]
  /** Card catalogue for chassis that accept them. */
  slots?: ChassisSlots
  availableCards?: Card[]
  /**
   * Profile-specific rules. The core never looks inside this; the video
   * profile types it as `VideoRules`, and an audio profile would put its own
   * shape here without either knowing about the other.
   */
  rules: TRules
  /** Free-text constraints the engine cannot express, surfaced in the report. */
  caveats: string[]
  discontinued?: boolean
  provenance: Provenance
}

// ---------------------------------------------------------------- demands

/**
 * One unit of demand on a device. The profile turns a show into these; the
 * solver knows nothing else about the show.
 */
export interface PortDemand {
  id: string
  label: string
  direction: PortDirection
  /** Acceptable connector kinds, best first. */
  accepts: ConnectorKind[]
  /** What has to travel down the wire. */
  need: LinkRequirement
  roles?: PortRole[]
  /** How many physical plugs this demand needs (a 4K60 source over 2x HDMI). */
  plugs: number
}

export interface LinkRequirement {
  pixelRateHz: number
  bpc: 8 | 10 | 12
  sampling: Sampling
  /** Minimum SDI class, when the signal is going down SDI. */
  sdiClass?: SdiClass
  hdcp?: string
}

export interface PoolDemand {
  poolId: string
  amount: number
  /** Which scope instance it lands on ('' for system scope). */
  scopeKey: string
  /** For the report: what asked for it. */
  because: string
}

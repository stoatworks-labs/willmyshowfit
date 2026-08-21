/**
 * Evaluating one show against one device configuration, and ranking the lot.
 */

import type { Device, DeviceConfig, PoolDemand } from '../model/types.ts'
import { requirementFor } from '../model/signal.ts'
import {
  buildDemands,
  type AuxLayerRule,
  type LayerCosting,
  type Show,
} from '../profiles/video.ts'
import {
  checkPools,
  rebalanceCards,
  type PoolUsage,
  expandToPlugs,
  matchPorts,
  resourcesOf,
  type ConfigResult,
  type Verdict,
} from './solve.ts'

/** Video-specific rules hung off a device. */
export interface VideoRules {
  layerCosting: LayerCosting
  /**
   * True when the device can put a live input on a screen's background without
   * spending a layer. Several Midra 4K models cannot, and it is the single
   * most common reason a small show does not fit one.
   */
  liveBackground: boolean
  /** How many screens the device can run at once, independent of plugs. */
  maxScreens: number
  /**
   * What happens to a layer placed on an aux output. Defaults to `from-pool`
   * when a device does not say, which charges the layer as if it were on a
   * screen — the reading least likely to promise capability that is not there.
   */
  auxLayers?: AuxLayerRule
  /**
   * Whether the device can join several outputs into one canvas.
   *
   * The line between a screen-management system and a vision mixer. A
   * presentation switcher builds a 7680x2160 canvas across four outputs and
   * edge-blends it; a vision mixer has no such concept — every output is one
   * raster, and a screen wider than one output simply cannot be made. Defaults
   * to true, because everything in the database except the vision mixers does
   * it.
   */
  edgeBlending?: boolean
  /**
   * LivePremier's VPU model, and the one part of it that changes a verdict.
   *
   * A VPU is an 8x8 field of links — eight layer links in, eight output links
   * out (User Manual v6.0 §5.5). A layer occupies a square sized by its
   * capability, so a VPU holds 64 dual-link layers, 16 4K ones or 4 5K ones.
   * None of that binds before the headline mixing-layer count does, so it is
   * not modelled here.
   *
   * What *does* bind is the **scaling-engine boundary**: a layer spanning more
   * than `scalingEngineOutputs` output links needs a second layer link and
   * wraps (§5.5.4). A wide blended screen therefore costs more layer resource
   * per layer than a small one — which is precisely what Analog Way means by
   * quoting its layer counts "depending on the screens setup", and the reason
   * a show can run out of layers while the headline number still looks fine.
   *
   * Confirmed on hardware: a six-output screen on an Aquilon C reported two
   * mixers per slice, one covering outputs 1-4 and a second covering 5-6.
   */
  vpu?: {
    /** Output links one scaling engine spans before a layer has to wrap. */
    scalingEngineOutputs: number
    /**
     * True when Optimized mode is in use, which removes the boundary
     * (§5.5.6). Never yet seen on hardware; here so the assumption is visible.
     */
    optimized?: boolean
  }
}

export type VideoDevice = Device<VideoRules>

export function evaluateConfig(
  device: VideoDevice,
  config: DeviceConfig,
  show: Show,
): ConfigResult {
  const auxLayers = device.rules.auxLayers ?? 'from-pool'
  const demands = buildDemands(show, {
    costing: device.rules.layerCosting,
    auxLayers,
    ...(device.rules.vpu && !device.rules.vpu.optimized
      ? { scalingEngineOutputs: device.rules.vpu.scalingEngineOutputs }
      : {}),
  })

  // ---- plugs
  const resources = resourcesOf(config)
  const plugs = expandToPlugs(demands.ports)
  const ports = matchPorts(resources, plugs)
  // The matcher places plugs; it does not know which card is behind each one,
  // so it can bunch 4K signals onto a card that cannot hold them while an
  // identical card sits empty. Spread them out before anything is judged.
  if (config.cardCapacity) {
    rebalanceCards(
      ports,
      (cardId) => config.cardCapacity![cardId],
      (d) => fourKCost(d.need.pixelRateHz, d.cable?.of ?? 1),
    )
  }

  // ---- pools, with the per-card scopes resolved from the port assignment
  const scopeLabels = new Map<string, string>(show.screens.map((s) => [s.id, s.name]))
  const poolDemands = [
    ...retargetCardScopedDemands(config, show, demands.pools, ports, scopeLabels),
    ...cardCapacityDemands(config, ports, scopeLabels),
  ]
  const pools = checkPools(config.pools, poolDemands, scopeLabels)
  pools.usage.push(...checkCardCapacity(config, ports))
  pools.ok = pools.usage.every((u) => u.ok || u.rescuedBy != null)

  // ---- verdict
  const blockers: string[] = [...demands.impossible]
  const warnings: string[] = []

  if (show.screens.length > device.rules.maxScreens) {
    blockers.push(
      `The show has ${show.screens.length} screens; this device runs at most ${device.rules.maxScreens}.`,
    )
  }
  if (device.rules.edgeBlending === false) {
    const widestOut = Math.max(
      0,
      ...config.ports.filter((p) => p.direction === 'out').map((p) => p.cap.maxPixelRateHz),
    )
    for (const screen of show.screens) {
      // Count PLUGS, not destination entries. One entry reading "LED processor
      // x3" is three outputs, and counting entries makes a three-projector
      // blend look like a single-output screen to a device that cannot blend.
      const plugs = screen.destinations.reduce(
        (n, d) => n + d.count * (d.plugsPerSignal ?? 1),
        0,
      )
      if (plugs > 1) {
        blockers.push(
          `${screen.name} is delivered on ${plugs} output plugs. This is a vision mixer, not a screen-management system: it has no edge blending, so a screen has to fit on a single output.`,
        )
        continue
      }
      const canvasNeed = requirementFor({
        ...screen.canvas,
        bpc: 8,
        sampling: 'rgb444',
      }).pixelRateHz
      if (canvasNeed > widestOut + 1) {
        blockers.push(
          `${screen.name}'s canvas needs ${(canvasNeed / 1e6).toFixed(0)} MHz on one plug and this device's widest output carries ${(widestOut / 1e6).toFixed(0)} MHz. Without edge blending there is no way to split it.`,
        )
      }
    }
  }
  if (!device.rules.liveBackground && show.screens.some((s) => s.liveBackground)) {
    blockers.push(
      `A screen asks for a live input as its background. This model can only use a still image as a background, so that content has to become a layer.`,
    )
  }

  blockers.push(...summarisePlugFailures(ports.unassigned))
  for (const u of pools.usage) {
    if (u.ok) continue
    if (u.rescuedBy) {
      warnings.push(
        `${u.pool.label} on ${u.scopeLabel}: ${fmt(u.used)} of ${fmt(u.capacity)} ${u.pool.unit} — fits only in ${u.rescuedBy.label} (${u.rescuedBy.tradeoff}).`,
      )
    } else {
      blockers.push(
        `${u.pool.label} on ${u.scopeLabel}: needs ${fmt(u.used)} ${u.pool.unit}, has ${fmt(u.capacity)}.`,
      )
    }
  }

  for (const a of ports.assignments) {
    if (a.adapter) {
      warnings.push(`${a.demand.label} → ${a.port.label} needs a ${a.adapter}.`)
    }
  }
  const auxLayerCount = show.auxes.reduce((n, a) => n + (a.layers?.length ?? 0) * a.count, 0)
  if (show.layersOnAux && auxLayerCount > 0) {
    if (auxLayers === 'free') {
      warnings.push(
        `${auxLayerCount} layer${auxLayerCount === 1 ? '' : 's'} on aux outputs cost this device nothing from its main layer budget — it takes the resource from adjacent unused outputs instead, so keep those outputs free.`,
      )
    } else {
      warnings.push(
        `${auxLayerCount} layer${auxLayerCount === 1 ? '' : 's'} on aux outputs are charged to the same layer budget as on-screen layers on this device.`,
      )
    }
  }

  for (const caveat of device.caveats) warnings.push(caveat)

  const impossible = demands.impossible.length > 0
  const verdict: Verdict = impossible
    ? 'impossible'
    : blockers.length > 0
      ? 'does-not-fit'
      : pools.usage.some((u) => !u.ok && u.rescuedBy)
        ? 'fits-with-tradeoff'
        : 'fits'

  const layerPool = pools.usage.filter((u) => u.pool.id === device.rules.layerCosting.poolId)
  const layerHeadroom =
    layerPool.length > 0
      ? Math.min(...layerPool.map((u) => u.capacity - u.used))
      : null

  return {
    device,
    config,
    verdict,
    ports,
    pools,
    blockers,
    warnings,
    headroom: {
      inputs: ports.spare.filter((r) => r.direction === 'in').length,
      outputs: ports.spare.filter((r) => r.direction === 'out').length,
      layers: layerHeadroom,
    },
  }
}

/**
 * Charge every assigned plug against the capacity of the card it landed on.
 *
 * This is the limit people get caught by. An Event Master Gen 1 card carries
 * four connectors and exactly ONE 4K60 signal — Barco's own words are "1 4K60p
 * or 4 HD" — so a single 4K60 source fills the card and the other three sockets
 * cannot be used for anything. A chassis with eight such cards has thirty-two
 * connectors and eight 4K60 inputs, and only one of those numbers is the answer
 * to "will my show fit".
 *
 * Capacity is denominated in 4K60 signals and spent on the same 1 : 2 : 4
 * ladder Barco uses everywhere else — a 4K60 costs 1, a 4K30 or dual-link 0.5,
 * an HD 0.25. On a one-4K60 card that makes four HD signals exactly fill it,
 * which is the vendor's own arithmetic back again.
 *
 * A device that declares no per-card capacity pool is simply not metered.
 */
function cardCapacityDemands(
  config: DeviceConfig,
  ports: ReturnType<typeof matchPorts>,
  scopeLabels: Map<string, string>,
): PoolDemand[] {
  const chassisIn = config.pools.find((p) => p.id === 'chassis-4k-in')
  const chassisOut = config.pools.find((p) => p.id === 'chassis-4k-out')
  if (!chassisIn && !chassisOut) return []

  const out: PoolDemand[] = []
  for (const a of ports.assignments) {
    if (a.demand.roles?.length === 1 && a.demand.roles[0] === 'multiviewer') continue
    const pool = a.demand.direction === 'in' ? chassisIn : chassisOut
    if (!pool) continue
    out.push({
      poolId: pool.id,
      amount: fourKCost(a.demand.need.pixelRateHz, a.demand.cable?.of ?? 1),
      scopeKey: '',
      because: `${a.demand.label} on ${a.port.id}`,
    })
  }
  void scopeLabels
  return out
}

/**
 * Per-slot card capacity, checked against each card's own rating.
 *
 * A pool cannot express this: `checkPools` compares every instance of a scope
 * against one capacity, and the whole point here is that two cards in the same
 * chassis can be rated differently. So it gets its own pass, producing the same
 * `PoolUsage` shape so the UI and the report need no special case.
 */
export function checkCardCapacity(
  config: DeviceConfig,
  ports: ReturnType<typeof matchPorts>,
): PoolUsage[] {
  const caps = config.cardCapacity
  if (!caps) return []

  const used = new Map<string, { total: number; why: PoolDemand[] }>()
  for (const a of ports.assignments) {
    const cardId = a.port.cardId
    if (!cardId || caps[cardId] == null) continue
    if (a.demand.roles?.length === 1 && a.demand.roles[0] === 'multiviewer') continue
    const cost = fourKCost(a.demand.need.pixelRateHz, a.demand.cable?.of ?? 1)
    const entry = used.get(cardId) ?? { total: 0, why: [] }
    entry.total += cost
    entry.why.push({
      poolId: 'card-4k',
      amount: cost,
      scopeKey: cardId,
      because: `${a.demand.label} on ${a.port.id}`,
    })
    used.set(cardId, entry)
  }

  const out: PoolUsage[] = []
  for (const [cardId, entry] of used) {
    const capacity = caps[cardId]
    const total = Math.round(entry.total * 1e6) / 1e6
    out.push({
      pool: {
        id: 'card-4k',
        label: '4K60 capacity of the card',
        capacity,
        unit: '4K60 signals',
        scope: cardId.startsWith('in') ? 'per-input-card' : 'per-output-card',
      },
      scopeKey: cardId,
      scopeLabel: prettyCard(cardId),
      used: total,
      capacity,
      ok: total <= capacity + 1e-9,
      contributors: entry.why,
    })
  }
  return out
}

/**
 * Barco's 1 : 2 : 4 ladder, in units of one 4K60 signal.
 *
 * `cables` matters: a 4K60 arriving on two cables is still ONE 4K60 signal as
 * far as the card is concerned, and charging each half separately would bill it
 * twice — which on a one-4K60 card is the difference between fitting and not.
 * The plug demand already carries the halved rate, so the full rate is
 * reconstructed and the cost split back across the cables.
 */
function fourKCost(pixelRateHz: number, cables = 1): number {
  // Compare like with like: the demand carries a LINK rate (blanking
  // included), so the yardstick has to be 4K60's link clock of 594 MHz, not
  // its active pixel rate of 498. Measuring one against the other puts
  // 1080p60 at 0.30 of a 4K60 instead of exactly 0.25, and four HD signals
  // then overflow a card the vendor says holds precisely four.
  const UHD60_CLOCK = 594e6
  const full = pixelRateHz * cables
  const whole = full > UHD60_CLOCK * 0.55 ? 1 : full > UHD60_CLOCK * 0.28 ? 0.5 : 0.25
  return whole / cables
}

function prettyCard(cardId: string): string {
  const m = /^(in|out)-(\d+)$/.exec(cardId)
  return m ? `${m[1] === 'in' ? 'input' : 'output'} card ${m[2]}` : cardId
}

/**
 * Move per-output-card pool demands onto the cards the show actually landed on.
 *
 * PixelHue budgets mixing layers per output card, so a screen's layers are
 * charged to every output card carrying one of that screen's destinations.
 *
 * ⚠️ That last clause is INFERRED, not documented: PixelHue states the
 * per-card budget but not what happens to a screen spanning two cards. Charging
 * both is the conservative reading — it can report "does not fit" for a
 * configuration a PixelHue engineer would make work. The device's caveats say
 * so on the results page; do not quietly drop this note.
 */
function retargetCardScopedDemands(
  config: DeviceConfig,
  show: Show,
  demands: PoolDemand[],
  ports: ReturnType<typeof matchPorts>,
  scopeLabels: Map<string, string>,
): PoolDemand[] {
  const cardScoped = new Set(
    config.pools
      .filter((p) => p.scope === 'per-output-card' && !p.id.startsWith('card-'))
      .map((p) => p.id),
  )
  if (cardScoped.size === 0) return demands

  // screen id -> the output cards its destinations were assigned to
  const screenCards = new Map<string, Set<string>>()
  for (const screen of show.screens) {
    const destIds = new Set(screen.destinations.map((d) => d.id))
    const cards = new Set<string>()
    for (const a of ports.assignments) {
      if (a.demand.direction !== 'out') continue
      const base = a.demand.demandId.split('#')[0]
      if (destIds.has(base) && a.port.cardId) cards.add(a.port.cardId)
    }
    screenCards.set(screen.id, cards)
  }

  for (const [, cards] of screenCards) {
    for (const c of cards) if (!scopeLabels.has(c)) scopeLabels.set(c, cardLabel(config, c))
  }

  const out: PoolDemand[] = []
  for (const d of demands) {
    if (!cardScoped.has(d.poolId)) {
      out.push(d)
      continue
    }
    const cards = screenCards.get(d.scopeKey)
    if (!cards || cards.size === 0) {
      out.push(d)
      continue
    }
    for (const cardId of cards) out.push({ ...d, scopeKey: cardId })
  }
  return out
}

function cardLabel(config: DeviceConfig, cardId: string): string {
  const port = config.ports.find((p) => p.cardId === cardId)
  return port ? `output card ${cardId.replace(/^.*-/, '')}` : cardId
}

// ------------------------------------------------------------------ ranking

export interface DeviceResult {
  device: VideoDevice
  /** Best configuration first. */
  configs: ConfigResult[]
  best: ConfigResult
}

const VERDICT_RANK: Record<Verdict, number> = {
  fits: 0,
  'fits-with-tradeoff': 1,
  'does-not-fit': 2,
  impossible: 3,
}

export function evaluateAll(devices: VideoDevice[], show: Show): DeviceResult[] {
  const results: DeviceResult[] = []

  for (const device of devices) {
    const configs = device.configs
      .map((c) => evaluateConfig(device, c, show))
      .sort((a, b) => {
        const v = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]
        if (v !== 0) return v
        // Among configurations that fit, the tightest is the one to recommend:
        // no point sending a 6RU chassis when a 4RU one has the plugs.
        return spare(a) - spare(b)
      })
    results.push({ device, configs, best: configs[0] })
  }

  return results.sort((a, b) => {
    const v = VERDICT_RANK[a.best.verdict] - VERDICT_RANK[b.best.verdict]
    if (v !== 0) return v
    if (a.best.verdict === 'fits' || a.best.verdict === 'fits-with-tradeoff') {
      return spare(a.best) - spare(b.best)
    }
    // Among the failures, the near-misses are the interesting ones.
    return a.best.blockers.length - b.best.blockers.length
  })
}

function spare(r: ConfigResult): number {
  return r.headroom.inputs + r.headroom.outputs
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}


/**
 * Fifteen lines of "SDI cannot take HDMI" is not a report, it is a wall.
 *
 * Failures that share a reason are collapsed into one line naming the count and
 * a few examples, which is how a person would say it: "nine HDMI feeds have
 * nowhere to go — every plug on this device is SDI."
 */
function summarisePlugFailures(
  unassigned: { demand: { label: string }; reasons: string[] }[],
): string[] {
  const groups = new Map<string, string[]>()
  for (const u of unassigned) {
    const reason = u.reasons[0] ?? 'no suitable plug'
    const list = groups.get(reason) ?? []
    list.push(u.demand.label)
    groups.set(reason, list)
  }

  const out: string[] = []
  for (const [reason, labels] of groups) {
    if (labels.length <= 2) {
      for (const l of labels) out.push(`No plug for ${l}: ${reason}`)
      continue
    }
    const shown = labels.slice(0, 3).join(', ')
    const more = labels.length - 3
    out.push(
      `${labels.length} signals have no plug (${shown}${more > 0 ? `, and ${more} more` : ''}): ${reason}`,
    )
  }
  return out
}

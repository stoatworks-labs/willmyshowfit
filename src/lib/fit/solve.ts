/**
 * The solver: can these demands be met by this configuration, and if so, how.
 *
 * Two independent questions, answered separately because they fail for
 * different reasons and the user needs to know which:
 *
 *   1. PLUGS — is there a physical connector for every signal, of a type and
 *      capability that carries it? This is a bipartite matching, not a count.
 *      Counting says "12 inputs, 12 sources, fine" and misses that all four
 *      SDI sources want the two SDI plugs.
 *   2. POOLS — do the layers, canvas and background demands fit inside the
 *      device's capacity, in the right scope?
 *
 * A device fits only if both pass.
 */

import type {
  Device,
  DeviceConfig,
  Pool,
  PoolDemand,
  Port,
  PortDemand,
  PortRole,
} from '../model/types.ts'
import { dpLinkFits, sdiAtLeast } from '../model/signal.ts'

// -------------------------------------------------------------- resources

/**
 * One assignable thing on the back of the device.
 *
 * Mirrored plugs (a Midra output is HDMI *and* 12G-SDI carrying the same
 * picture) and select plugs (a Midra input is HDMI *or* 3G-SDI, pick one)
 * both collapse several connectors into a single resource. Treating them as
 * separate plugs is the single easiest way to make this tool overstate a
 * device by 30%.
 */
export interface Resource {
  id: string
  ports: Port[]
  direction: 'in' | 'out'
  kind: 'single' | 'mirror' | 'select'
  cardId?: string
}

export function resourcesOf(config: DeviceConfig): Resource[] {
  const out: Resource[] = []
  const grouped = new Map<string, Port[]>()

  for (const p of config.ports) {
    const key = p.mirrorGroup ?? p.selectGroup
    if (key) {
      const list = grouped.get(key) ?? []
      list.push(p)
      grouped.set(key, list)
    } else {
      out.push({ id: p.id, ports: [p], direction: p.direction, kind: 'single', cardId: p.cardId })
    }
  }

  for (const [key, ports] of grouped) {
    out.push({
      id: key,
      ports,
      direction: ports[0].direction,
      kind: ports[0].mirrorGroup ? 'mirror' : 'select',
      cardId: ports[0].cardId,
    })
  }
  return out
}

// ------------------------------------------------------- plug-level demands

export interface PlugDemand {
  id: string
  /** The demand this came from, for reporting. */
  demandId: string
  label: string
  direction: 'in' | 'out'
  accepts: PortDemand['accepts']
  need: PortDemand['need']
  roles?: PortRole[]
  /** 1 of N, when a signal is split across cables. */
  cable?: { index: number; of: number }
}

/**
 * A 4K60 feed on two cables is two half-rate signals, not two 4K60 signals.
 * Dividing the rate is what makes "2x HDMI 1.4 carries 4K60" come out true,
 * which is exactly why dual-cable 4K existed.
 */
export function expandToPlugs(demands: PortDemand[]): PlugDemand[] {
  const out: PlugDemand[] = []
  for (const d of demands) {
    const n = Math.max(1, d.plugs)
    for (let i = 0; i < n; i++) {
      out.push({
        id: n > 1 ? `${d.id}/${i + 1}` : d.id,
        demandId: d.id,
        label: n > 1 ? `${d.label} (cable ${i + 1} of ${n})` : d.label,
        direction: d.direction,
        accepts: d.accepts,
        need: { ...d.need, pixelRateHz: d.need.pixelRateHz / n },
        roles: d.roles,
        ...(n > 1 ? { cable: { index: i + 1, of: n } } : {}),
      })
    }
  }
  return out
}

// ------------------------------------------------------------ compatibility

export interface PortMatch {
  ok: boolean
  /** The specific connector chosen inside a mirror/select group. */
  port?: Port
  /** Set when the match only works with a passive adapter in line. */
  adapter?: string
  reasons: string[]
}

export function portTakes(resource: Resource, demand: PlugDemand): PortMatch {
  if (resource.direction !== demand.direction) {
    return { ok: false, reasons: ['wrong direction'] }
  }

  const reasons: string[] = []
  let best: { port: Port; adapter?: string } | null = null

  for (const port of resource.ports) {
    // Role gates: a multiviewer plug is not a program plug.
    if (port.roles && demand.roles && !demand.roles.some((r) => port.roles!.includes(r))) {
      reasons.push(`${port.label}: reserved for ${port.roles.join('/')}`)
      continue
    }

    const exact = demand.accepts[0] === port.kind
    const viaAdapter = !exact && demand.accepts.includes(port.kind)
    if (!exact && !viaAdapter) {
      reasons.push(`${port.label}: ${port.kind.toUpperCase()} cannot take ${demand.accepts[0].toUpperCase()}`)
      continue
    }

    const cap = port.cap
    if (demand.need.pixelRateHz > cap.maxPixelRateHz + 1) {
      reasons.push(
        `${port.label}: needs ${mhz(demand.need.pixelRateHz)} MHz, plug tops out at ${mhz(cap.maxPixelRateHz)} MHz`,
      )
      continue
    }
    if (demand.need.bpc > cap.maxBpc) {
      reasons.push(`${port.label}: ${demand.need.bpc}-bit exceeds the plug's ${cap.maxBpc}-bit`)
      continue
    }
    if (!cap.sampling.includes(demand.need.sampling)) {
      reasons.push(`${port.label}: does not carry ${demand.need.sampling}`)
      continue
    }
    if (port.kind === 'sdi') {
      if (!demand.need.sdiClass || !cap.sdiClass || !sdiAtLeast(cap.sdiClass, demand.need.sdiClass)) {
        reasons.push(
          `${port.label}: ${cap.sdiClass?.toUpperCase() ?? 'SDI'} cannot carry this format`,
        )
        continue
      }
    }
    if (port.kind === 'displayport' && !dpLinkFits(cap, demand.need)) {
      reasons.push(`${port.label}: exceeds the DisplayPort link budget`)
      continue
    }
    if (demand.need.hdcp && cap.hdcp.length === 0) {
      reasons.push(`${port.label}: no HDCP support`)
      continue
    }

    const candidate = {
      port,
      ...(viaAdapter ? { adapter: adapterName(demand.accepts[0], port.kind) } : {}),
    }
    // An exact connector match always beats an adapter.
    if (exact) return { ok: true, ...candidate, reasons: [] }
    if (!best) best = candidate
  }

  if (best) return { ok: true, ...best, reasons: [] }
  return { ok: false, reasons }
}

function adapterName(want: string, have: string): string {
  if (want === 'hdmi' && have === 'dvi') return 'passive HDMI→DVI-D adapter'
  if (want === 'dvi' && have === 'hdmi') return 'passive DVI-D→HDMI adapter'
  return `passive ${want.toUpperCase()}→${have.toUpperCase()} adapter`
}

function mhz(hz: number): string {
  return (hz / 1e6).toFixed(1)
}

// ---------------------------------------------------------------- matching

export interface Assignment {
  demand: PlugDemand
  resource: Resource
  port: Port
  adapter?: string
}

export interface PortSolution {
  ok: boolean
  assignments: Assignment[]
  unassigned: { demand: PlugDemand; reasons: string[] }[]
  /** Resources left over, useful for "you have room for two more". */
  spare: Resource[]
}

/**
 * Maximum bipartite matching by augmenting paths (Kuhn's algorithm).
 *
 * Demands are matched in the order given and resources are tried in
 * preference order, so the *first* feasible assignment found is also a
 * sensible one to draw on a wiring diagram — exact connector matches before
 * adapters, and cheap plugs before scarce ones.
 */
export function matchPorts(resources: Resource[], demands: PlugDemand[]): PortSolution {
  const compat: Map<string, { resource: Resource; match: PortMatch }[]> = new Map()

  for (const d of demands) {
    const options: { resource: Resource; match: PortMatch }[] = []
    for (const r of resources) {
      const m = portTakes(r, d)
      if (m.ok) options.push({ resource: r, match: m })
    }
    // Prefer an exact connector, then the least capable plug that still works,
    // so a 12G-SDI plug is not burnt on an HD feed while an HD plug idles.
    options.sort((a, b) => {
      const aa = a.match.adapter ? 1 : 0
      const bb = b.match.adapter ? 1 : 0
      if (aa !== bb) return aa - bb
      return a.match.port!.cap.maxPixelRateHz - b.match.port!.cap.maxPixelRateHz
    })
    compat.set(d.id, options)
  }

  const takenBy = new Map<string, string>() // resourceId -> demandId
  const chosen = new Map<string, { resource: Resource; match: PortMatch }>()

  const tryAssign = (demandId: string, seen: Set<string>): boolean => {
    for (const option of compat.get(demandId) ?? []) {
      const rid = option.resource.id
      if (seen.has(rid)) continue
      seen.add(rid)
      const holder = takenBy.get(rid)
      if (holder == null || tryAssign(holder, seen)) {
        takenBy.set(rid, demandId)
        chosen.set(demandId, option)
        return true
      }
    }
    return false
  }

  const byId = new Map(demands.map((d) => [d.id, d]))
  const unassigned: PortSolution['unassigned'] = []

  for (const d of demands) {
    if (!tryAssign(d.id, new Set())) {
      const opts = compat.get(d.id) ?? []
      unassigned.push({
        demand: d,
        reasons:
          opts.length > 0
            ? [`every plug that could take this is already in use by another signal`]
            : uniqueReasons(resources, d),
      })
    }
  }

  const assignments: Assignment[] = []
  for (const [demandId, opt] of chosen) {
    assignments.push({
      demand: byId.get(demandId)!,
      resource: opt.resource,
      port: opt.match.port!,
      ...(opt.match.adapter ? { adapter: opt.match.adapter } : {}),
    })
  }

  const used = new Set(takenBy.keys())
  return {
    ok: unassigned.length === 0,
    assignments,
    unassigned,
    spare: resources.filter((r) => !used.has(r.id)),
  }
}

/**
 * Why a demand found nothing, worded usefully.
 *
 * Reasons are gathered from the plugs the signal could plausibly have used —
 * the ones whose connector it actually accepts — before falling back to
 * everything. Without that ranking, a 4K60 DisplayPort source that overran the
 * DP 1.1 link budget gets told "SDI cannot take DISPLAYPORT", which is true,
 * useless, and sends the reader looking at the wrong plug.
 */
function uniqueReasons(resources: Resource[], d: PlugDemand): string[] {
  const relevant = resources.filter(
    (r) => r.direction === d.direction && r.ports.some((p) => d.accepts.includes(p.kind)),
  )
  const pool = relevant.length > 0 ? relevant : resources.filter((r) => r.direction === d.direction)

  const seen = new Set<string>()
  for (const r of pool) {
    for (const port of r.ports) {
      if (relevant.length > 0 && !d.accepts.includes(port.kind)) continue
      for (const reason of portTakes({ ...r, ports: [port] }, d).reasons) seen.add(reason)
    }
  }
  const list = [...seen]
  if (list.length > 0) return list.slice(0, 4)
  return [`this device has no ${d.accepts[0].toUpperCase()} plug in that direction`]
}

// ------------------------------------------------------------------- pools

export interface PoolUsage {
  pool: Pool
  scopeKey: string
  scopeLabel: string
  used: number
  capacity: number
  ok: boolean
  contributors: PoolDemand[]
  /** An alternate capacity that would make it fit, if one exists. */
  rescuedBy?: { label: string; tradeoff: string; capacity: number }
}

export interface PoolSolution {
  ok: boolean
  usage: PoolUsage[]
}

export function checkPools(
  pools: Pool[],
  demands: PoolDemand[],
  scopeLabels: Map<string, string>,
): PoolSolution {
  const byPool = new Map(pools.map((p) => [p.id, p]))
  const buckets = new Map<string, PoolDemand[]>()

  for (const d of demands) {
    const pool = byPool.get(d.poolId)
    if (!pool) continue // a demand the device does not meter at all
    const key = pool.scope === 'system' ? `${pool.id}::` : `${pool.id}::${d.scopeKey}`
    const list = buckets.get(key) ?? []
    list.push(d)
    buckets.set(key, list)
  }

  const usage: PoolUsage[] = []
  for (const [key, contributors] of buckets) {
    const [poolId, scopeKey] = key.split('::')
    const pool = byPool.get(poolId)!
    const used = round(contributors.reduce((n, d) => n + d.amount, 0))
    const ok = used <= pool.capacity + 1e-9

    let rescuedBy: PoolUsage['rescuedBy']
    if (!ok) {
      const alt = (pool.alternates ?? [])
        .filter((a) => used <= a.capacity + 1e-9)
        .sort((a, b) => a.capacity - b.capacity)[0]
      if (alt) rescuedBy = { label: alt.label, tradeoff: alt.tradeoff, capacity: alt.capacity }
    }

    usage.push({
      pool,
      scopeKey,
      scopeLabel: scopeKey ? (scopeLabels.get(scopeKey) ?? scopeKey) : 'whole system',
      used,
      capacity: pool.capacity,
      ok,
      contributors,
      ...(rescuedBy ? { rescuedBy } : {}),
    })
  }

  return { ok: usage.every((u) => u.ok || u.rescuedBy != null), usage }
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

// ------------------------------------------------------------------ verdict

export type Verdict = 'fits' | 'fits-with-tradeoff' | 'does-not-fit' | 'impossible'

export interface ConfigResult {
  device: Device
  config: DeviceConfig
  verdict: Verdict
  ports: PortSolution
  pools: PoolSolution
  /** Blocking, plain-language reasons, most important first. */
  blockers: string[]
  /** Non-blocking things the user should still read. */
  warnings: string[]
  /** Headroom summary, for ranking devices that all fit. */
  headroom: { inputs: number; outputs: number; layers: number | null }
}

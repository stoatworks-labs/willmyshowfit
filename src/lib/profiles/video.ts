/**
 * The video profile: what a "show" is, and how it becomes demands on a device.
 *
 * The core solver never sees a screen or a layer. This file is the only place
 * that knows a show has screens with canvases and layers on them, and it turns
 * that into the two things the solver understands: port demands and pool
 * demands.
 */

import {
  activePixelRate,
  requirementFor,
  sdiClassFor,
  type VideoFormat,
} from '../model/signal.ts'
import type { ConnectorKind, PortDemand, PoolDemand } from '../model/types.ts'

// ------------------------------------------------------------------ the show

export interface ShowSource {
  id: string
  name: string
  format: VideoFormat
  /** What the source device actually has on the back of it. */
  connector: ConnectorKind
  /** Identical sources, so nobody has to type "Laptop 1..8". */
  count: number
  hdcp?: boolean
  /** A 4K60 feed arriving as 2x or 4x cables rather than one. */
  plugsPerSignal?: 1 | 2 | 4
}

export type LayerKind = 'mixing' | 'split'

export interface ShowLayer {
  id: string
  name: string
  /** The largest content this layer has to show, at full size. */
  format: VideoFormat
  /**
   * A mixing layer can cross-fade to a new source on its own; a split (or
   * "single") layer can only cut or fade to black. Every vendor in the
   * database charges twice as much for the former, which is why the choice is
   * per-layer rather than per-show.
   */
  kind: LayerKind
}

export interface ShowDestination {
  id: string
  name: string
  format: VideoFormat
  connector: ConnectorKind
  count: number
  /** A 4K60 display fed by 2x or 4x cables. */
  plugsPerSignal?: 1 | 2 | 4
  hdcp?: boolean
  /**
   * Layers built on this aux feed rather than on a screen — an IMAG cut with a
   * lower third over it, a stage-left comfort monitor with a clock in the
   * corner. Only honoured when the show's `layersOnAux` toggle is on, and only
   * on devices whose `auxLayers` rule allows it.
   */
  layers?: ShowLayer[]
}

export interface ShowScreen {
  id: string
  name: string
  /** The composed canvas, which may be far wider than any one output. */
  canvas: { hActive: number; vActive: number; refreshHz: number }
  layers: ShowLayer[]
  /** A live input as the unscaled background, rather than a still or black. */
  liveBackground: boolean
  /** The physical plugs this screen is delivered on. */
  destinations: ShowDestination[]
}

export interface Show {
  name: string
  screens: ShowScreen[]
  sources: ShowSource[]
  /** Scaled aux feeds — comfort monitors, record, stream — outside any screen. */
  auxes: ShowDestination[]
  /** Multiviewer feeds the show needs plugs for. */
  multiviewers: ShowDestination[]
  /**
   * Whether the show is allowed to build layers on aux outputs.
   *
   * Off by default, because it is a real capability difference rather than a
   * preference: some devices cannot do it at all, some do it free of the main
   * layer budget, and some spend the same layers an on-screen layer would. With
   * the toggle off every aux is a plain scaled feed and the three behave alike,
   * which is the comparison most people actually want first.
   */
  layersOnAux: boolean
  notes: string
}

export function emptyShow(): Show {
  return {
    name: 'Untitled show',
    screens: [],
    sources: [],
    auxes: [],
    multiviewers: [],
    layersOnAux: false,
    notes: '',
  }
}

// ------------------------------------------------------------- layer costing

/**
 * A device's own published layer sizes and what each one costs it.
 *
 * These are never derived. Analog Way charges a 4K mixing layer twice a
 * "DL/2K" one; Barco's S3-4K charges a 4K60 PIP four times an FHD one. Both
 * are the vendor's own arithmetic from their own spec sheet, and they disagree
 * because their small unit is a different size. Deriving a ratio from pixel
 * counts would silently overrule both.
 */
export interface LayerClass {
  id: string
  label: string
  /** Ceiling in active pixels per second, inclusive. */
  maxPixelRate: number
  /** Cost in the device's layer-pool unit. */
  cost: number
}

export interface LayerCosting {
  poolId: string
  classes: LayerClass[]
  /** Multiplier applied to split layers. Universally 0.5 so far, but declared. */
  splitFactor: number
}

export interface LayerCostResult {
  layerId: string
  className: string
  cost: number
}

export function costLayer(
  layer: ShowLayer,
  costing: LayerCosting,
): LayerCostResult | { layerId: string; tooBig: true; needRate: number } {
  const rate = activePixelRate(layer.format)
  // Smallest class that still holds it: classes are cheapest-first.
  const sorted = [...costing.classes].sort((a, b) => a.maxPixelRate - b.maxPixelRate)
  const cls = sorted.find((c) => rate <= c.maxPixelRate + 1)
  if (!cls) return { layerId: layer.id, tooBig: true, needRate: rate }
  const cost = layer.kind === 'split' ? cls.cost * costing.splitFactor : cls.cost
  return { layerId: layer.id, className: cls.label, cost }
}

// ---------------------------------------------------------- demand generation

/**
 * Three pools every device may optionally declare, charged automatically:
 * `input-plugs`, `output-plugs` and `multiviewer-plugs`.
 *
 * They exist for chassis whose published connector maxima add up to more than
 * the chassis can run at once — Barco's ENCORE3 lists "up to 9x HDMI, up to 5x
 * DP, up to 4x SDI" for a configuration that carries 16 inputs, not 18. Listing
 * all eighteen plugs and capping the pool at sixteen is right in both
 * directions; picking a fixed mix of sixteen would reject a nine-HDMI show the
 * chassis can actually take. A device that does not declare these pools is
 * simply not metered on them.
 */
export interface VideoDemands {
  ports: PortDemand[]
  pools: PoolDemand[]
  /** Anything the show asks for that no device could do, format-wise. */
  impossible: string[]
}

/** Connector fallbacks that a passive adapter genuinely satisfies. */
export const PASSIVE_ADAPTERS: Record<string, ConnectorKind[]> = {
  // DVI-D and HDMI are the same TMDS signalling; a passive shell swaps the plug.
  hdmi: ['dvi'],
  dvi: ['hdmi'],
  // DP++ (dual-mode) sources drive an HDMI/DVI sink through a passive adapter.
  displayport: [],
}

export function acceptableConnectors(want: ConnectorKind): ConnectorKind[] {
  return [want, ...(PASSIVE_ADAPTERS[want] ?? [])]
}

/**
 * How a device treats a layer placed on an aux output.
 *
 * `none`       the aux is a plain scaled feed; layers cannot go on it.
 * `free`       layers on aux do not spend the main layer budget. Analog Way's
 *              LivePremier states this outright — it borrows resource from
 *              adjacent unused outputs instead.
 * `from-pool`  layers on aux cost exactly what an on-screen layer costs.
 */
export type AuxLayerRule = 'none' | 'free' | 'from-pool'

export interface DemandRules {
  costing: LayerCosting
  auxLayers: AuxLayerRule
}

export function buildDemands(show: Show, rules: DemandRules): VideoDemands {
  const costing = rules.costing
  const ports: PortDemand[] = []
  const pools: PoolDemand[] = []
  const impossible: string[] = []

  // ---- sources
  for (const src of show.sources) {
    const need = requirementFor(src.format)
    if (src.connector === 'sdi' && sdiClassFor(src.format) == null) {
      impossible.push(
        `${src.name}: ${describe(src.format)} cannot travel over SDI — SDI carries 10-bit 4:2:2, not ${src.format.bpc}-bit ${samplingLabel(src.format.sampling)}.`,
      )
    }
    for (let i = 0; i < src.count; i++) {
      ports.push({
        id: src.count > 1 ? `${src.id}#${i + 1}` : src.id,
        label: src.count > 1 ? `${src.name} ${i + 1}` : src.name,
        direction: 'in',
        accepts: acceptableConnectors(src.connector),
        need: src.hdcp ? { ...need, hdcp: '1.4' } : need,
        roles: ['source'],
        plugs: src.plugsPerSignal ?? 1,
      })
    }
    pools.push({
      poolId: 'input-plugs',
      amount: src.count * (src.plugsPerSignal ?? 1),
      scopeKey: '',
      because: `${src.name} x${src.count}`,
    })
  }

  // ---- screens: destinations, layers, canvas
  for (const screen of show.screens) {
    for (const dest of screen.destinations) {
      const need = requirementFor(dest.format)
      for (let i = 0; i < dest.count; i++) {
        ports.push({
          id: dest.count > 1 ? `${dest.id}#${i + 1}` : dest.id,
          label: `${screen.name} — ${dest.name}${dest.count > 1 ? ` ${i + 1}` : ''}`,
          direction: 'out',
          accepts: acceptableConnectors(dest.connector),
          need: dest.hdcp ? { ...need, hdcp: '1.4' } : need,
          roles: ['program'],
          plugs: dest.plugsPerSignal ?? 1,
        })
      }
      pools.push({
        poolId: 'output-plugs',
        amount: dest.count * (dest.plugsPerSignal ?? 1),
        scopeKey: '',
        because: `${screen.name} — ${dest.name} x${dest.count}`,
      })
    }

    for (const layer of screen.layers) {
      const costed = costLayer(layer, costing)
      if ('tooBig' in costed) {
        impossible.push(
          `${screen.name} / ${layer.name}: no layer size on this device holds ${describe(layer.format)}.`,
        )
        continue
      }
      pools.push({
        poolId: costing.poolId,
        amount: costed.cost,
        scopeKey: screen.id,
        because: `${screen.name} / ${layer.name} (${costed.className}, ${layer.kind})`,
      })
    }

    pools.push({
      poolId: 'canvas',
      amount: activePixelRate(screen.canvas) / screen.canvas.refreshHz / 1e6,
      scopeKey: screen.id,
      because: `${screen.name} canvas ${screen.canvas.hActive}x${screen.canvas.vActive}`,
    })

    if (screen.liveBackground) {
      pools.push({
        poolId: 'live-background',
        amount: 1,
        scopeKey: screen.id,
        because: `${screen.name} live background`,
      })
    }
  }

  // ---- aux and multiviewer plugs
  for (const [list, role, what] of [
    [show.auxes, 'aux', 'Aux'],
    [show.multiviewers, 'multiviewer', 'Multiviewer'],
  ] as const) {
    for (const dest of list) {
      const need = requirementFor(dest.format)
      for (let i = 0; i < dest.count; i++) {
        ports.push({
          id: dest.count > 1 ? `${dest.id}#${i + 1}` : dest.id,
          label: `${what} — ${dest.name}${dest.count > 1 ? ` ${i + 1}` : ''}`,
          direction: 'out',
          accepts: acceptableConnectors(dest.connector),
          need,
          roles: [role],
          plugs: dest.plugsPerSignal ?? 1,
        })
      }
      pools.push({
        poolId: role === 'multiviewer' ? 'multiviewer-plugs' : 'output-plugs',
        amount: dest.count * (dest.plugsPerSignal ?? 1),
        scopeKey: '',
        because: `${what} — ${dest.name} x${dest.count}`,
      })

      // Layers on an aux, when the show asks for them and the device allows.
      const auxLayers = role === 'aux' && show.layersOnAux ? (dest.layers ?? []) : []
      if (auxLayers.length > 0 && rules.auxLayers === 'none') {
        impossible.push(
          `${dest.name}: this device cannot build layers on an aux output — its auxes are plain scaled feeds.`,
        )
        continue
      }
      for (const layer of auxLayers) {
        const costed = costLayer(layer, costing)
        if ('tooBig' in costed) {
          impossible.push(
            `${dest.name} / ${layer.name}: no layer size on this device holds ${describe(layer.format)}.`,
          )
          continue
        }
        if (rules.auxLayers === 'free') continue
        pools.push({
          poolId: costing.poolId,
          // Aux layers are charged to the system, not to any one screen: they
          // do not belong to a screen, and pinning them to an arbitrary one
          // would make a per-screen pool fail for the wrong reason.
          amount: costed.cost * dest.count,
          scopeKey: '',
          because: `Aux ${dest.name} / ${layer.name} (${costed.className}, ${layer.kind})`,
        })
      }
    }
  }

  return { ports, pools, impossible }
}

export function describe(f: VideoFormat): string {
  const rate = Number.isInteger(f.refreshHz) ? f.refreshHz : f.refreshHz.toFixed(2)
  return `${f.hActive}x${f.vActive}@${rate} ${f.bpc}-bit ${samplingLabel(f.sampling)}`
}

export function samplingLabel(s: VideoFormat['sampling']): string {
  return { rgb444: 'RGB 4:4:4', ycbcr444: 'YCbCr 4:4:4', ycbcr422: '4:2:2', ycbcr420: '4:2:0' }[s]
}

/** Total plugs a show needs, by direction — the headline number on the form. */
export function plugTotals(show: Show): { in: number; out: number } {
  const sources = show.sources.reduce((n, s) => n + s.count * (s.plugsPerSignal ?? 1), 0)
  const dests = show.screens
    .flatMap((s) => s.destinations)
    .concat(show.auxes, show.multiviewers)
    .reduce((n, d) => n + d.count * (d.plugsPerSignal ?? 1), 0)
  return { in: sources, out: dests }
}

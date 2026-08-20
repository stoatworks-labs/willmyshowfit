/**
 * Turning a successful fit into a wiring topology someone can patch from.
 *
 * The matching already decided which signal lands on which plug. This turns
 * that into the three lists a video engineer actually wants on a call sheet —
 * an input patch, an output patch, and the short list of things that will bite
 * you on site — and states the assumptions rather than hiding them.
 */

import type { ConfigResult } from '../fit/solve.ts'
import type { Show } from '../profiles/video.ts'
import { describe } from '../profiles/video.ts'

export interface PatchRow {
  /** Plug number as it is silkscreened / labelled on the device. */
  plug: string
  connector: string
  signal: string
  format: string
  /** Cable and adapter notes for this specific run. */
  note?: string
  cardId?: string
}

export interface Topology {
  deviceLabel: string
  configLabel: string
  inputs: PatchRow[]
  outputs: PatchRow[]
  /** Screens and what feeds them, for the block diagram. */
  screens: {
    name: string
    canvas: string
    layers: string[]
    plugs: string[]
  }[]
  notes: string[]
  spare: { inputs: string[]; outputs: string[] }
}

export function proposeTopology(result: ConfigResult, show: Show): Topology {
  const inputs: PatchRow[] = []
  const outputs: PatchRow[] = []
  const notes: string[] = []

  const sorted = [...result.ports.assignments].sort((a, b) =>
    a.port.id.localeCompare(b.port.id, undefined, { numeric: true }),
  )

  for (const a of sorted) {
    const noteParts: string[] = []
    if (a.adapter) noteParts.push(a.adapter)
    if (a.demand.cable) {
      noteParts.push(
        `cable ${a.demand.cable.index} of ${a.demand.cable.of} — both must land on this device`,
      )
    }
    if (a.resource.kind === 'mirror' && a.resource.ports.length > 1) {
      const others = a.resource.ports.filter((p) => p.id !== a.port.id).map((p) => p.label)
      noteParts.push(`mirrored with ${others.join(', ')} — same picture, either plug`)
    }
    if (a.resource.kind === 'select' && a.resource.ports.length > 1) {
      const others = a.resource.ports.filter((p) => p.id !== a.port.id).map((p) => p.label)
      noteParts.push(`shares this input with ${others.join(', ')} — only one may be active`)
    }

    const row: PatchRow = {
      plug: a.port.id,
      connector: a.port.label,
      signal: a.demand.label,
      format: `${(a.demand.need.pixelRateHz / 1e6).toFixed(1)} MHz`,
      ...(noteParts.length > 0 ? { note: noteParts.join('; ') } : {}),
      ...(a.port.cardId ? { cardId: a.port.cardId } : {}),
    }
    ;(a.demand.direction === 'in' ? inputs : outputs).push(row)
  }

  const screens = show.screens.map((screen) => {
    const destIds = new Set(screen.destinations.map((d) => d.id))
    const plugs = result.ports.assignments
      .filter((a) => a.demand.direction === 'out' && destIds.has(a.demand.demandId.split('#')[0]))
      .map((a) => a.port.id)
      .sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    return {
      name: screen.name,
      canvas: `${screen.canvas.hActive}x${screen.canvas.vActive}@${screen.canvas.refreshHz}`,
      layers: screen.layers.map((l) => `${l.name} — ${describe(l.format)}, ${l.kind}`),
      plugs,
    }
  })

  // ---- the things that bite on site
  const adapters = result.ports.assignments.filter((a) => a.adapter)
  if (adapters.length > 0) {
    notes.push(
      `${adapters.length} signal${adapters.length === 1 ? '' : 's'} need a passive adapter. Passive HDMI↔DVI-D adapters carry the picture but no audio and no HDCP 2.2 — check the source if either matters.`,
    )
  }

  const multiCable = result.ports.assignments.filter((a) => a.demand.cable)
  if (multiCable.length > 0) {
    notes.push(
      `Some signals arrive on more than one cable. Both halves must reach the same device, and the device has to be set to combine them — this is a configuration step, not just a patch.`,
    )
  }

  for (const u of result.pools.usage) {
    if (!u.ok && u.rescuedBy) {
      notes.push(`${u.pool.label} on ${u.scopeLabel} only fits in ${u.rescuedBy.label}: ${u.rescuedBy.tradeoff}`)
    }
  }
  for (const c of result.device.caveats) notes.push(c)

  return {
    deviceLabel: `${result.device.vendor} ${result.device.model}`,
    configLabel: result.config.label,
    inputs,
    outputs,
    screens,
    notes,
    spare: {
      inputs: result.ports.spare.filter((r) => r.direction === 'in').map((r) => r.ports[0].label),
      outputs: result.ports.spare.filter((r) => r.direction === 'out').map((r) => r.ports[0].label),
    },
  }
}

/**
 * Connector shapes, so one device's typo cannot diverge from the standard.
 *
 * Where a vendor states its own ceiling, use `rate` to override the spec
 * maximum — several of these devices are deliberately slower than the
 * interface allows, and using the interface's number instead of the vendor's
 * makes the tool claim capability the box does not have.
 */

import type { Port, PortCapability, PortRole, Sampling } from '../lib/model/types.ts'

const FULL: Sampling[] = ['rgb444', 'ycbcr444', 'ycbcr422']
const WITH_420: Sampling[] = ['rgb444', 'ycbcr444', 'ycbcr422', 'ycbcr420']

export const CAP = {
  hdmi14: (rate = 340e6): PortCapability => ({
    maxPixelRateHz: rate,
    maxBpc: 12,
    sampling: FULL,
    hdcp: ['1.4'],
  }),
  hdmi20: (rate = 600e6): PortCapability => ({
    maxPixelRateHz: rate,
    maxBpc: 12,
    sampling: WITH_420,
    hdcp: ['1.4', '2.2'],
  }),
  dp11: (rate = 330e6): PortCapability => ({
    maxPixelRateHz: rate,
    maxBpc: 10,
    sampling: FULL,
    dpLaneGbps: 2.7,
    dpLanes: 4,
    hdcp: ['1.3'],
  }),
  dp12: (rate = 600e6): PortCapability => ({
    maxPixelRateHz: rate,
    maxBpc: 12,
    sampling: FULL,
    dpLaneGbps: 5.4,
    dpLanes: 4,
    hdcp: ['1.3', '2.2'],
  }),
  dp14: (rate = 1200e6): PortCapability => ({
    maxPixelRateHz: rate,
    maxBpc: 12,
    sampling: FULL,
    dpLaneGbps: 8.1,
    dpLanes: 4,
    hdcp: ['1.3', '2.2'],
  }),
  dviSingle: (): PortCapability => ({
    maxPixelRateHz: 165e6,
    maxBpc: 8,
    sampling: FULL,
    hdcp: ['1.4'],
  }),
  dviDual: (): PortCapability => ({
    maxPixelRateHz: 330e6,
    maxBpc: 8,
    sampling: FULL,
    hdcp: ['1.4'],
  }),
  sdi3g: (): PortCapability => ({
    maxPixelRateHz: 148.5e6,
    maxBpc: 10,
    sampling: ['ycbcr422'],
    sdiClass: '3g',
    hdcp: [],
  }),
  sdi12g: (): PortCapability => ({
    maxPixelRateHz: 594e6,
    maxBpc: 10,
    sampling: ['ycbcr422'],
    sdiClass: '12g',
    hdcp: [],
  }),
  sfpPlus: (rate = 594e6): PortCapability => ({
    maxPixelRateHz: rate,
    maxBpc: 10,
    sampling: ['ycbcr422'],
    sdiClass: '12g',
    hdcp: [],
  }),
}

interface RunOptions {
  roles?: PortRole[]
  cardId?: string
  /** Start numbering here instead of 1. */
  from?: number
}

/** A run of identical plugs: `run('IN', 'hdmi', 'HDMI 2.0', CAP.hdmi20(), 8, 'in')`. */
export function run(
  prefix: string,
  kind: Port['kind'],
  label: string,
  cap: PortCapability,
  count: number,
  direction: Port['direction'],
  opts: RunOptions = {},
): Port[] {
  const from = opts.from ?? 1
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix} ${from + i}`,
    kind,
    label,
    direction,
    cap,
    ...(opts.roles ? { roles: opts.roles } : {}),
    ...(opts.cardId ? { cardId: opts.cardId } : {}),
  }))
}

/**
 * Plugs that carry the same signal on different connectors — one resource.
 * Used for Midra/Alta outputs, where HDMI and 12G-SDI are the same output.
 */
export function mirrored(groupId: string, ports: Omit<Port, 'mirrorGroup'>[]): Port[] {
  return ports.map((p) => ({ ...p, mirrorGroup: groupId }))
}

/** Plugs where only one may be active at a time — also one resource. */
export function selectOne(groupId: string, ports: Omit<Port, 'selectGroup'>[]): Port[] {
  return ports.map((p) => ({ ...p, selectGroup: groupId }))
}

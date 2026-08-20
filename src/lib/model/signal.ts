/**
 * Pixel rates, link budgets and SDI classes.
 *
 * A switcher's plug limits are quoted as a maximum pixel rate *including
 * blanking*, so a format's cost is its total raster times its refresh rate —
 * never its active pixel count. Getting this wrong is the difference between
 * "1920x1080p60 costs 124 Mpix/s" (right) and "…costs 124.4 Mpix/s of active
 * pixels" (wrong, and it under-reports every format by about 20%).
 *
 * Standard formats use their published timings. Anything else falls back to
 * CVT reduced-blanking v2, which is what a modern source will actually send
 * to a display that advertises nothing better.
 */

import type { LinkRequirement, PortCapability, Sampling, SdiClass } from './types.ts'

export interface VideoFormat {
  hActive: number
  vActive: number
  refreshHz: number
  bpc: 8 | 10 | 12
  sampling: Sampling
  /** Set when the caller wants a specific known timing rather than CVT-RB. */
  timingName?: string
}

export interface Timing {
  hTotal: number
  vTotal: number
  pixelClockHz: number
  /** Where the numbers came from, for the report. */
  basis: 'standard' | 'cvt-rb-v2'
  name?: string
}

/**
 * Published timings for the formats event video actually uses.
 *
 * These are CTA-861 / VESA DMT values. They are here rather than computed
 * because the standards do not agree with any single blanking formula, and a
 * tool that reports 1080p60 as anything other than 148.5 MHz will be — rightly
 * — disbelieved by the first person who checks it.
 */
const STANDARD_TIMINGS: Record<string, { hTotal: number; vTotal: number; clockHz: number }> = {
  // CTA-861 broadcast rasters
  '1280x720@50': { hTotal: 1980, vTotal: 750, clockHz: 74.25e6 },
  '1280x720@60': { hTotal: 1650, vTotal: 750, clockHz: 74.25e6 },
  '1920x1080@24': { hTotal: 2750, vTotal: 1125, clockHz: 74.25e6 },
  '1920x1080@25': { hTotal: 2640, vTotal: 1125, clockHz: 74.25e6 },
  '1920x1080@30': { hTotal: 2200, vTotal: 1125, clockHz: 74.25e6 },
  '1920x1080@50': { hTotal: 2640, vTotal: 1125, clockHz: 148.5e6 },
  '1920x1080@60': { hTotal: 2200, vTotal: 1125, clockHz: 148.5e6 },
  '1920x1080@100': { hTotal: 2640, vTotal: 1125, clockHz: 297e6 },
  '1920x1080@120': { hTotal: 2200, vTotal: 1125, clockHz: 297e6 },
  '2048x1080@50': { hTotal: 2640, vTotal: 1125, clockHz: 148.5e6 },
  '2048x1080@60': { hTotal: 2200, vTotal: 1125, clockHz: 148.5e6 },
  '3840x2160@24': { hTotal: 5500, vTotal: 2250, clockHz: 297e6 },
  '3840x2160@25': { hTotal: 5280, vTotal: 2250, clockHz: 297e6 },
  '3840x2160@30': { hTotal: 4400, vTotal: 2250, clockHz: 297e6 },
  '3840x2160@50': { hTotal: 5280, vTotal: 2250, clockHz: 594e6 },
  '3840x2160@60': { hTotal: 4400, vTotal: 2250, clockHz: 594e6 },
  '4096x2160@24': { hTotal: 5500, vTotal: 2250, clockHz: 297e6 },
  '4096x2160@25': { hTotal: 5280, vTotal: 2250, clockHz: 297e6 },
  '4096x2160@30': { hTotal: 4400, vTotal: 2250, clockHz: 297e6 },
  '4096x2160@50': { hTotal: 5280, vTotal: 2250, clockHz: 594e6 },
  '4096x2160@60': { hTotal: 4400, vTotal: 2250, clockHz: 594e6 },
  // VESA DMT / CVT computer formats that turn up on presentation inputs
  '1024x768@60': { hTotal: 1344, vTotal: 806, clockHz: 65e6 },
  '1280x800@60': { hTotal: 1680, vTotal: 831, clockHz: 83.5e6 },
  '1280x1024@60': { hTotal: 1688, vTotal: 1066, clockHz: 108e6 },
  '1600x1200@60': { hTotal: 2160, vTotal: 1250, clockHz: 162e6 },
  '1920x1200@60': { hTotal: 2080, vTotal: 1235, clockHz: 154e6 },
  '2560x1440@60': { hTotal: 2720, vTotal: 1481, clockHz: 241.5e6 },
  '2560x1600@60': { hTotal: 2720, vTotal: 1646, clockHz: 268.5e6 },
}

export function formatKey(f: Pick<VideoFormat, 'hActive' | 'vActive' | 'refreshHz'>): string {
  return `${f.hActive}x${f.vActive}@${round(f.refreshHz, 3)}`
}

/**
 * CVT reduced-blanking v2 (VESA CVT 1.2), the fallback for custom rasters.
 *
 * RB v2 fixes horizontal blanking at 80 pixels and sizes the vertical blanking
 * interval from a minimum blanking time of 460 us. LED walls and stretched
 * canvases are almost always driven this way, which is why it is the fallback
 * rather than CVT standard blanking.
 */
export function cvtRbV2(hActive: number, vActive: number, refreshHz: number): Timing {
  const RB_H_BLANK = 80
  const RB_MIN_VBLANK_US = 460
  const RB_V_FPORCH = 1
  const V_SYNC = 8
  const RB_V_BPORCH = 6

  const hTotal = hActive + RB_H_BLANK

  // The estimated line period SUBTRACTS the minimum vertical blanking from the
  // frame time before dividing by the ACTIVE lines. Dividing the whole frame
  // time instead gives a longer line period, hence fewer blanking lines, and
  // every clock comes out a few percent low — which reads as "this format
  // just fits" on a plug where it does not. The estimate is the definition;
  // do not recompute it against the settled vertical total.
  const hPeriodEstUs = (1e6 / refreshHz - RB_MIN_VBLANK_US) / vActive
  const vbiLines = Math.floor(RB_MIN_VBLANK_US / hPeriodEstUs) + 1
  const minVbi = RB_V_FPORCH + V_SYNC + RB_V_BPORCH
  const vTotal = vActive + Math.max(vbiLines, minVbi)

  // CVT-RB v2 quantises the clock to 1 kHz.
  const pixelClockHz = Math.round((hTotal * vTotal * refreshHz) / 1000) * 1000

  return { hTotal, vTotal, pixelClockHz, basis: 'cvt-rb-v2' }
}

export function timingFor(f: VideoFormat): Timing {
  const key = formatKey(f)
  const std = STANDARD_TIMINGS[key]
  if (std) {
    return {
      hTotal: std.hTotal,
      vTotal: std.vTotal,
      pixelClockHz: std.clockHz,
      basis: 'standard',
      name: key,
    }
  }
  return cvtRbV2(f.hActive, f.vActive, f.refreshHz)
}

/** Active pixels per second — the canvas/throughput currency, not the link currency. */
export function activePixelRate(f: Pick<VideoFormat, 'hActive' | 'vActive' | 'refreshHz'>): number {
  return f.hActive * f.vActive * f.refreshHz
}

/** Bits per pixel for a sampling mode at a bit depth. */
export function bitsPerPixel(sampling: Sampling, bpc: number): number {
  switch (sampling) {
    case 'rgb444':
    case 'ycbcr444':
      return bpc * 3
    case 'ycbcr422':
      return bpc * 2
    case 'ycbcr420':
      return bpc * 1.5
  }
}

/** The smallest SDI class that carries a format, or null if no SDI rate does. */
export function sdiClassFor(f: VideoFormat): SdiClass | null {
  const rate = activePixelRate(f)
  const deep = f.bpc > 10 || f.sampling === 'rgb444' || f.sampling === 'ycbcr444'
  // SMPTE SDI is a 10-bit 4:2:2 carrier at these rates. 4:4:4 and 12-bit exist
  // only as dual-link/level-B mappings, which event kit does not generally use,
  // so a 4:4:4 request is answered honestly: SDI cannot take it as asked.
  if (deep) return null
  if (rate <= 1920 * 1080 * 30) return 'hd'
  if (rate <= 1920 * 1080 * 60) return '3g'
  if (rate <= 3840 * 2160 * 30) return '6g'
  if (rate <= 4096 * 2160 * 60) return '12g'
  return null
}

const SDI_ORDER: SdiClass[] = ['sd', 'hd', '3g', '6g', '12g']

export function sdiAtLeast(have: SdiClass, need: SdiClass): boolean {
  return SDI_ORDER.indexOf(have) >= SDI_ORDER.indexOf(need)
}

/** DisplayPort's own budget: lanes x rate x 8b/10b overhead, against payload. */
export function dpLinkFits(cap: PortCapability, need: LinkRequirement): boolean {
  if (cap.dpLaneGbps == null || cap.dpLanes == null) return true
  const linkBps = cap.dpLaneGbps * 1e9 * cap.dpLanes * 0.8
  const payloadBps = need.pixelRateHz * bitsPerPixel(need.sampling, need.bpc)
  return payloadBps <= linkBps
}

export function requirementFor(f: VideoFormat): LinkRequirement {
  const t = timingFor(f)
  const sdi = sdiClassFor(f)
  return {
    pixelRateHz: t.pixelClockHz,
    bpc: f.bpc,
    sampling: f.sampling,
    ...(sdi ? { sdiClass: sdi } : {}),
  }
}

function round(n: number, dp: number): number {
  const m = 10 ** dp
  return Math.round(n * m) / m
}

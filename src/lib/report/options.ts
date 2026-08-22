/**
 * What goes into a report, and what is left out of it.
 *
 * The full report is thirty-seven switchers deep with a wiring topology under
 * every one that fits, which is the right thing when you are choosing a machine
 * and far too much when you are sending three pages to a client who has already
 * chosen. These options trim it.
 *
 * ONE RULE, and the report enforces it rather than trusting the caller: a
 * trimmed report has to SAY it is trimmed. A compatibility matrix listing four
 * switchers reads as "these are the options" unless it says "4 of 37 shown",
 * and that difference is the whole reason someone reaches for this filter.
 * `summarise()` produces that line; `reportBodyHtml` prints it whenever
 * anything is hidden. The caveat section is not optional for the same reason.
 *
 * These are options for one printout, not properties of the show, so they are
 * deliberately NOT part of the XML — a show file re-imported anywhere gets the
 * whole report back.
 */

import type { DeviceResult } from '../fit/evaluate.ts'

export interface ReportSections {
  inputList: boolean
  outputList: boolean
  screens: boolean
  topology: boolean
  /** The citation list, with a link to every document behind a number. */
  citations: boolean
}

export interface ReportOptions {
  /**
   * Device ids to include, as an explicit list rather than a set of exclusions.
   *
   * The compatibility matrix and the topology both come from this, so a device
   * left out of it is out of the report entirely — including out of the
   * citation list, which is generated from whatever survived.
   */
  devices: string[]
  sections: ReportSections
}

export const ALL_SECTIONS: ReportSections = {
  inputList: true,
  outputList: true,
  screens: true,
  topology: true,
  citations: true,
}

export function defaultReportOptions(results: DeviceResult[]): ReportOptions {
  return { devices: results.map((r) => r.device.id), sections: { ...ALL_SECTIONS } }
}

/** Ids of every device that fits, or fits with a trade-off. */
export function fittingDeviceIds(results: DeviceResult[]): string[] {
  return results
    .filter((r) => r.best.verdict === 'fits' || r.best.verdict === 'fits-with-tradeoff')
    .map((r) => r.device.id)
}

export function applyOptions(results: DeviceResult[], options: ReportOptions): DeviceResult[] {
  const keep = new Set(options.devices)
  return results.filter((r) => keep.has(r.device.id))
}

export interface ReportTrim {
  shown: number
  total: number
  /** Vendors still represented, for the "showing N of M" line. */
  vendors: string[]
  /** Section names left out, in the words the reader would use. */
  omitted: string[]
}

/**
 * What was left out, phrased for the reader rather than for the code.
 *
 * Returns null when nothing was trimmed, so the report can skip the line
 * entirely on a full report instead of printing a reassuring "37 of 37".
 */
export function summarise(
  results: DeviceResult[],
  filtered: DeviceResult[],
  options: ReportOptions,
): ReportTrim | null {
  const omitted: string[] = []
  if (!options.sections.inputList) omitted.push('the input list')
  if (!options.sections.outputList) omitted.push('the output list')
  if (!options.sections.screens) omitted.push('the screen breakdown')
  if (!options.sections.topology) omitted.push('the wiring topology')
  if (!options.sections.citations) omitted.push('the source documents')

  const trimmedDevices = filtered.length < results.length
  if (!trimmedDevices && omitted.length === 0) return null

  return {
    shown: filtered.length,
    total: results.length,
    vendors: [...new Set(filtered.map((r) => r.device.vendor))].sort(),
    omitted,
  }
}

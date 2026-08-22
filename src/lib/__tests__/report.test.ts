import { describe, expect, it } from 'vitest'

import { DEVICES } from '../../data/index.ts'
import { evaluateAll } from '../fit/evaluate.ts'
import { reportBodyHtml, standaloneReportHtml } from '../report/html.ts'
import {
  applyOptions,
  defaultReportOptions,
  fittingDeviceIds,
  summarise,
  type ReportOptions,
} from '../report/options.ts'
import { exampleShow } from '../../ui/bits.tsx'

const show = exampleShow()
const results = evaluateAll(DEVICES, show)
const AT = new Date('2026-08-22T09:00:00Z')

const render = (o?: ReportOptions) => reportBodyHtml(show, results, AT, o)

describe('report options', () => {
  it('renders the whole report when no options are given', () => {
    // Every existing caller passes three arguments. The default has to be the
    // full report, not an empty one.
    const html = render()
    expect(html).toMatch(/Input list/)
    expect(html).toMatch(/Wiring topology/)
    expect(html).toMatch(/Where these numbers come from/)
    expect(html).not.toMatch(/filtered report/)
  })

  it('drops a section and says which one it dropped', () => {
    const o = defaultReportOptions(results)
    o.sections.citations = false
    const html = render(o)
    expect(html).not.toMatch(/Where these numbers come from/)
    expect(html).toMatch(/leaves out the source documents/)
    // The caveat stays, but stops claiming a citation list the reader cannot see.
    expect(html).toMatch(/<h2>Caveat<\/h2>/)
    expect(html).not.toMatch(/cited above/)
  })

  it('narrows to chosen devices, and takes their citations with them', () => {
    const barco = results.filter((r) => r.device.vendor === 'Barco').map((r) => r.device.id)
    const html = render({ ...defaultReportOptions(results), devices: barco })
    expect(html).toMatch(/Showing <strong>4 of 37<\/strong> switchers \(Barco\)/)
    expect(html).not.toMatch(/Aquilon/)
    // The citation list is generated from what survived, so a Barco-only report
    // does not carry five vendors' worth of links.
    expect(html).not.toMatch(/analogway/)
  })

  it('never lets a trimmed report look like the whole database', () => {
    // The point of the banner: a matrix of four switchers reads as "these are
    // the options" to the person it was mailed to.
    for (const devices of [[], fittingDeviceIds(results), [results[0].device.id]]) {
      expect(render({ ...defaultReportOptions(results), devices })).toMatch(/filtered report/)
    }
  })

  it('survives every switcher being deselected', () => {
    const html = render({ ...defaultReportOptions(results), devices: [] })
    expect(html).toMatch(/No switchers were selected/)
    expect(html).toMatch(/<h2>The show<\/h2>/)
    expect(html).toMatch(/<h2>Caveat<\/h2>/)
  })

  it('phrases the omission line for one section and for several', () => {
    const one = defaultReportOptions(results)
    one.sections.topology = false
    expect(render(one)).toMatch(/It leaves out the wiring topology\./)

    const many = defaultReportOptions(results)
    many.sections.topology = false
    many.sections.citations = false
    expect(render(many)).toMatch(/It leaves out the wiring topology and the source documents\./)
  })

  it('makes the trimmed report substantially shorter, which is the whole point', () => {
    const trimmed = defaultReportOptions(results)
    trimmed.devices = fittingDeviceIds(results)
    trimmed.sections.topology = false
    trimmed.sections.citations = false
    expect(render(trimmed).length).toBeLessThan(render().length / 2)
  })

  it('gives the downloaded file the same options as the page', () => {
    const o = defaultReportOptions(results)
    o.sections.citations = false
    o.devices = fittingDeviceIds(results)
    const file = standaloneReportHtml(show, results, AT, o)
    expect(file).toContain(render(o))
    expect(file).not.toMatch(/Where these numbers come from/)
  })

  it('reports nothing trimmed when nothing was trimmed', () => {
    const o = defaultReportOptions(results)
    expect(summarise(results, applyOptions(results, o), o)).toBeNull()
  })
})

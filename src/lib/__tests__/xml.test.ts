// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { showToXml, xmlToShow } from '../io/xml.ts'
import type { Show } from '../profiles/video.ts'

const sample: Show = {
  name: 'Regional conference — main room',
  layersOnAux: true,
  notes: 'Two rooms, shared playback.',
  sources: [
    {
      id: 'pb',
      name: 'Playback',
      connector: 'sdi',
      count: 2,
      format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 10, sampling: 'ycbcr422' },
    },
    {
      id: 'lect',
      name: 'Lectern laptop',
      connector: 'hdmi',
      count: 1,
      hdcp: true,
      format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
    },
  ],
  screens: [
    {
      id: 'main',
      name: 'Main wide',
      canvas: { hActive: 5760, vActive: 1080, refreshHz: 60 },
      liveBackground: true,
      layers: [
        {
          id: 'l1',
          name: 'IMAG',
          kind: 'mixing',
          format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
        },
      ],
      destinations: [
        {
          id: 'led',
          name: 'LED processor',
          connector: 'hdmi',
          count: 3,
          plugsPerSignal: 1,
          format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
        },
      ],
    },
  ],
  auxes: [
    {
      id: 'conf',
      name: 'Confidence',
      connector: 'sdi',
      count: 2,
      format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 10, sampling: 'ycbcr422' },
      layers: [
        {
          id: 'al1',
          name: 'Clock',
          kind: 'split',
          format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
        },
      ],
    },
  ],
  multiviewers: [
    {
      id: 'mv',
      name: 'Rack monitor',
      connector: 'hdmi',
      count: 1,
      format: { hActive: 1920, vActive: 1080, refreshHz: 60, bpc: 8, sampling: 'rgb444' },
    },
  ],
}

describe('show XML', () => {
  it('round-trips a show without losing anything', () => {
    const once = showToXml(sample)
    const { show, problems } = xmlToShow(once)
    expect(problems).toEqual([])
    expect(showToXml(show)).toBe(once)
  })

  it('keeps aux layers and the layersOnAux toggle', () => {
    const { show } = xmlToShow(showToXml(sample))
    expect(show.layersOnAux).toBe(true)
    expect(show.auxes[0].layers?.[0]).toMatchObject({ name: 'Clock', kind: 'split' })
  })

  it('escapes names that would otherwise break the document', () => {
    const awkward = { ...sample, name: 'Q4 "review" <big> & loud' }
    const { show, problems } = xmlToShow(showToXml(awkward))
    expect(problems).toEqual([])
    expect(show.name).toBe('Q4 "review" <big> & loud')
  })

  it('recovers what it can from a hand-edited file rather than throwing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<show version="1" name="Broken">
  <sources>
    <source id="a" name="Good" connector="hdmi" count="1" width="1920" height="1080" rate="60" bpc="8" sampling="rgb444"/>
    <source id="b" name="Bad" connector="scart" count="1" width="oops" height="1080" rate="60" bpc="9" sampling="rgb444"/>
  </sources>
</show>`
    const { show, problems } = xmlToShow(xml)
    expect(show.sources).toHaveLength(2)
    expect(show.sources[0].name).toBe('Good')
    expect(problems.join(' ')).toMatch(/connector="scart"/)
    expect(problems.join(' ')).toMatch(/width="oops"/)
    expect(problems.join(' ')).toMatch(/bpc="9"/)
  })

  it('reports a file that is not XML at all, and returns an empty show', () => {
    const { show, problems } = xmlToShow('this is not xml')
    expect(show.screens).toEqual([])
    expect(problems[0]).toMatch(/not valid XML/)
  })

  it('warns when the file was written by a later version', () => {
    const xml = showToXml(sample).replace('version="1"', 'version="9"')
    expect(xmlToShow(xml).problems.join(' ')).toMatch(/version 9/)
  })
})

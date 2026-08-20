/**
 * Show configuration as XML.
 *
 * This is our own format, not an interchange with anyone's project files. It
 * exists so a show can be saved, mailed, diffed and put in a repo — which is
 * the reason it is XML with attributes people can read and edit by hand rather
 * than a blob.
 *
 * Two properties are load-bearing and are pinned by round-trip tests:
 *
 *  1. Import never throws on bad input. It returns the show it could recover
 *     plus a list of problems, because the common case is a hand-edited file
 *     with one bad number in it and losing the other fifty entries would be
 *     absurd.
 *  2. Export → import → export is byte-identical. If it is not, something is
 *     being dropped silently.
 */

import type { Show, ShowDestination, ShowLayer, ShowScreen, ShowSource } from '../profiles/video.ts'
import type { VideoFormat } from '../model/signal.ts'
import type { ConnectorKind, Sampling } from '../model/types.ts'

export const SHOW_XML_VERSION = '1'

// ------------------------------------------------------------------ export

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtAttrs(f: VideoFormat): string {
  return `width="${f.hActive}" height="${f.vActive}" rate="${f.refreshHz}" bpc="${f.bpc}" sampling="${f.sampling}"`
}

function destXml(tag: string, d: ShowDestination, indent: string): string {
  const open = `${indent}<${tag} id="${esc(d.id)}" name="${esc(d.name)}" connector="${d.connector}" count="${d.count}" ${fmtAttrs(d.format)}${d.plugsPerSignal && d.plugsPerSignal !== 1 ? ` plugs="${d.plugsPerSignal}"` : ''}${d.hdcp ? ' hdcp="true"' : ''}`
  if (!d.layers || d.layers.length === 0) return `${open}/>`
  const layers = d.layers.map((l) => layerXml(l, `${indent}    `)).join('\n')
  return `${open}>\n${layers}\n${indent}</${tag}>`
}

function layerXml(l: ShowLayer, indent: string): string {
  return `${indent}<layer id="${esc(l.id)}" name="${esc(l.name)}" kind="${l.kind}" ${fmtAttrs(l.format)}/>`
}

export function showToXml(show: Show): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(
    `<show version="${SHOW_XML_VERSION}" name="${esc(show.name)}" layersOnAux="${show.layersOnAux}">`,
  )

  lines.push('  <sources>')
  for (const s of show.sources) {
    lines.push(
      `    <source id="${esc(s.id)}" name="${esc(s.name)}" connector="${s.connector}" count="${s.count}" ${fmtAttrs(s.format)}${s.plugsPerSignal && s.plugsPerSignal !== 1 ? ` plugs="${s.plugsPerSignal}"` : ''}${s.hdcp ? ' hdcp="true"' : ''}/>`,
    )
  }
  lines.push('  </sources>')

  lines.push('  <screens>')
  for (const scr of show.screens) {
    lines.push(
      `    <screen id="${esc(scr.id)}" name="${esc(scr.name)}" width="${scr.canvas.hActive}" height="${scr.canvas.vActive}" rate="${scr.canvas.refreshHz}" liveBackground="${scr.liveBackground}">`,
    )
    if (scr.layers.length > 0) {
      lines.push('      <layers>')
      for (const l of scr.layers) lines.push(layerXml(l, '        '))
      lines.push('      </layers>')
    }
    if (scr.destinations.length > 0) {
      lines.push('      <destinations>')
      for (const d of scr.destinations) lines.push(destXml('destination', d, '        '))
      lines.push('      </destinations>')
    }
    lines.push('    </screen>')
  }
  lines.push('  </screens>')

  lines.push('  <auxes>')
  for (const a of show.auxes) lines.push(destXml('aux', a, '    '))
  lines.push('  </auxes>')

  lines.push('  <multiviewers>')
  for (const m of show.multiviewers) lines.push(destXml('multiviewer', m, '    '))
  lines.push('  </multiviewers>')

  lines.push(`  <notes>${esc(show.notes)}</notes>`)
  lines.push('</show>')
  return lines.join('\n') + '\n'
}

// ------------------------------------------------------------------ import

export interface ImportResult {
  show: Show
  /** Everything that could not be read, in the order it was found. */
  problems: string[]
}

const CONNECTORS: ConnectorKind[] = [
  'hdmi',
  'displayport',
  'dvi',
  'sdi',
  'sfp',
  'fiber',
  'ndi',
]
const SAMPLINGS: Sampling[] = ['rgb444', 'ycbcr444', 'ycbcr422', 'ycbcr420']

function num(el: Element, attr: string, fallback: number, problems: string[], where: string): number {
  const raw = el.getAttribute(attr)
  if (raw == null) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    problems.push(`${where}: ${attr}="${raw}" is not a positive number; used ${fallback}.`)
    return fallback
  }
  return n
}

function readFormat(el: Element, problems: string[], where: string): VideoFormat {
  const bpcRaw = num(el, 'bpc', 8, problems, where)
  const bpc = ([8, 10, 12] as const).find((b) => b === bpcRaw) ?? 8
  if (bpc !== bpcRaw) problems.push(`${where}: bpc="${bpcRaw}" is not 8, 10 or 12; used 8.`)

  const sRaw = el.getAttribute('sampling') ?? 'rgb444'
  const sampling = SAMPLINGS.includes(sRaw as Sampling) ? (sRaw as Sampling) : 'rgb444'
  if (sampling !== sRaw) problems.push(`${where}: sampling="${sRaw}" is not a known mode; used rgb444.`)

  return {
    hActive: num(el, 'width', 1920, problems, where),
    vActive: num(el, 'height', 1080, problems, where),
    refreshHz: num(el, 'rate', 60, problems, where),
    bpc,
    sampling,
  }
}

function readConnector(el: Element, problems: string[], where: string): ConnectorKind {
  const raw = el.getAttribute('connector') ?? 'hdmi'
  if (!CONNECTORS.includes(raw as ConnectorKind)) {
    problems.push(`${where}: connector="${raw}" is not a known connector; used hdmi.`)
    return 'hdmi'
  }
  return raw as ConnectorKind
}

function readPlugs(el: Element, problems: string[], where: string): 1 | 2 | 4 | undefined {
  const raw = el.getAttribute('plugs')
  if (raw == null) return undefined
  const n = Number(raw)
  if (n === 1 || n === 2 || n === 4) return n
  problems.push(`${where}: plugs="${raw}" must be 1, 2 or 4; used 1.`)
  return 1
}

function readLayers(parent: Element, problems: string[], where: string): ShowLayer[] {
  return [...parent.querySelectorAll(':scope > layer, :scope > layers > layer')].map((el, i) => {
    const w = `${where} layer ${i + 1}`
    const kindRaw = el.getAttribute('kind') ?? 'mixing'
    const kind = kindRaw === 'split' ? 'split' : 'mixing'
    if (kindRaw !== 'mixing' && kindRaw !== 'split') {
      problems.push(`${w}: kind="${kindRaw}" is not mixing or split; used mixing.`)
    }
    return {
      id: el.getAttribute('id') || `layer-${i + 1}`,
      name: el.getAttribute('name') || `Layer ${i + 1}`,
      kind,
      format: readFormat(el, problems, w),
    }
  })
}

function readDestination(el: Element, i: number, problems: string[], what: string): ShowDestination {
  const where = `${what} ${i + 1}`
  const layers = readLayers(el, problems, where)
  const plugs = readPlugs(el, problems, where)
  return {
    id: el.getAttribute('id') || `${what}-${i + 1}`,
    name: el.getAttribute('name') || `${what} ${i + 1}`,
    connector: readConnector(el, problems, where),
    count: Math.round(num(el, 'count', 1, problems, where)),
    format: readFormat(el, problems, where),
    ...(plugs ? { plugsPerSignal: plugs } : {}),
    ...(el.getAttribute('hdcp') === 'true' ? { hdcp: true } : {}),
    ...(layers.length > 0 ? { layers } : {}),
  }
}

export function xmlToShow(xml: string): ImportResult {
  const problems: string[] = []
  const doc = new DOMParser().parseFromString(xml, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return {
      show: {
        name: 'Untitled show',
        screens: [],
        sources: [],
        auxes: [],
        multiviewers: [],
        layersOnAux: false,
        notes: '',
      },
      problems: [`This file is not valid XML: ${parseError.textContent?.trim().split('\n')[0]}`],
    }
  }

  const root = doc.documentElement
  if (root.tagName !== 'show') {
    problems.push(`Expected a <show> document, found <${root.tagName}>. Reading it anyway.`)
  }
  const version = root.getAttribute('version')
  if (version && version !== SHOW_XML_VERSION) {
    problems.push(
      `This file says version ${version} and this tool writes version ${SHOW_XML_VERSION}. Anything it does not recognise has been dropped.`,
    )
  }

  const sources: ShowSource[] = [...root.querySelectorAll('sources > source')].map((el, i) => {
    const where = `source ${i + 1}`
    const plugs = readPlugs(el, problems, where)
    return {
      id: el.getAttribute('id') || `source-${i + 1}`,
      name: el.getAttribute('name') || `Source ${i + 1}`,
      connector: readConnector(el, problems, where),
      count: Math.round(num(el, 'count', 1, problems, where)),
      format: readFormat(el, problems, where),
      ...(plugs ? { plugsPerSignal: plugs } : {}),
      ...(el.getAttribute('hdcp') === 'true' ? { hdcp: true } : {}),
    }
  })

  const screens: ShowScreen[] = [...root.querySelectorAll('screens > screen')].map((el, i) => {
    const where = `screen ${i + 1}`
    return {
      id: el.getAttribute('id') || `screen-${i + 1}`,
      name: el.getAttribute('name') || `Screen ${i + 1}`,
      canvas: {
        hActive: num(el, 'width', 1920, problems, where),
        vActive: num(el, 'height', 1080, problems, where),
        refreshHz: num(el, 'rate', 60, problems, where),
      },
      liveBackground: el.getAttribute('liveBackground') === 'true',
      layers: readLayers(el, problems, where),
      destinations: [...el.querySelectorAll('destinations > destination')].map((d, j) =>
        readDestination(d, j, problems, 'destination'),
      ),
    }
  })

  const auxes = [...root.querySelectorAll('auxes > aux')].map((el, i) =>
    readDestination(el, i, problems, 'aux'),
  )
  const multiviewers = [...root.querySelectorAll('multiviewers > multiviewer')].map((el, i) =>
    readDestination(el, i, problems, 'multiviewer'),
  )

  return {
    show: {
      name: root.getAttribute('name') || 'Untitled show',
      layersOnAux: root.getAttribute('layersOnAux') === 'true',
      sources,
      screens,
      auxes,
      multiviewers,
      notes: root.querySelector('notes')?.textContent ?? '',
    },
    problems,
  }
}

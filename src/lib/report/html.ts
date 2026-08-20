/**
 * The report: an input list, an output list, a compatibility matrix and a
 * proposed wiring topology per device that fits.
 *
 * One generator, two outputs. The on-screen report and the downloaded HTML
 * file are the same string — the download just adds a document wrapper and the
 * stylesheet — so the file someone mails to a client cannot drift from the page
 * they were looking at. "Save as PDF" is the browser's own print pipeline
 * against the print stylesheet, which is why there is no PDF library here.
 *
 * Everything user-typed goes through `esc`. A show name is untrusted text.
 */

import type { DeviceResult } from '../fit/evaluate.ts'
import type { Show } from '../profiles/video.ts'
import { describe, plugTotals } from '../profiles/video.ts'
import { proposeTopology } from '../topology/propose.ts'
import type { Verdict } from '../fit/solve.ts'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const VERDICT_TEXT: Record<Verdict, string> = {
  fits: 'Fits',
  'fits-with-tradeoff': 'Fits, with a trade-off',
  'does-not-fit': 'Does not fit',
  impossible: 'Wrong tool for this show',
}

const VERDICT_CLASS: Record<Verdict, string> = {
  fits: 'fits',
  'fits-with-tradeoff': 'tradeoff',
  'does-not-fit': 'no',
  impossible: 'impossible',
}

function table(headers: string[], rows: string[][], aligns: string[] = []): string {
  const th = headers
    .map((h, i) => `<th${aligns[i] === 'num' ? ' class="num"' : ''}>${esc(h)}</th>`)
    .join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => `<td${aligns[i] === 'num' ? ' class="num"' : ''}>${c}</td>`)
          .join('')}</tr>`,
    )
    .join('\n')
  return `<div class="scroll-x"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`
}

export function reportBodyHtml(show: Show, results: DeviceResult[], generatedAt: Date): string {
  const totals = plugTotals(show)
  const out: string[] = []

  out.push(`<h1>${esc(show.name)}</h1>`)
  out.push(
    `<p class="soft">Switcher fit report · generated ${esc(
      generatedAt.toISOString().slice(0, 16).replace('T', ' '),
    )} · willmyshowfit.com</p>`,
  )
  if (show.notes.trim()) out.push(`<p>${esc(show.notes)}</p>`)

  // ---------------------------------------------------------------- summary
  out.push('<h2>The show</h2>')
  out.push(
    table(
      ['', 'Count'],
      [
        ['Screens', String(show.screens.length)],
        ['Layers', String(show.screens.reduce((n, s) => n + s.layers.length, 0))],
        ['Input plugs needed', String(totals.in)],
        ['Output plugs needed', String(totals.out)],
        ['Layers on aux', show.layersOnAux ? 'Enabled' : 'Off'],
      ],
      ['', 'num'],
    ),
  )

  // ----------------------------------------------------------- input list
  out.push('<h2>Input list</h2>')
  out.push(
    table(
      ['Source', 'Connector', 'Qty', 'Cables', 'Format', 'HDCP'],
      show.sources.map((s) => [
        esc(s.name),
        esc(s.connector.toUpperCase()),
        String(s.count),
        String(s.plugsPerSignal ?? 1),
        esc(describe(s.format)),
        s.hdcp ? 'Yes' : '—',
      ]),
      ['', '', 'num', 'num', '', ''],
    ),
  )

  // ---------------------------------------------------------- output list
  out.push('<h2>Output list</h2>')
  const outRows: string[][] = []
  for (const scr of show.screens) {
    for (const d of scr.destinations) {
      outRows.push([
        esc(scr.name),
        esc(d.name),
        'Program',
        esc(d.connector.toUpperCase()),
        String(d.count),
        esc(describe(d.format)),
      ])
    }
  }
  for (const a of show.auxes) {
    outRows.push([
      '—',
      esc(a.name),
      show.layersOnAux && a.layers?.length ? `Aux (${a.layers.length} layers)` : 'Aux',
      esc(a.connector.toUpperCase()),
      String(a.count),
      esc(describe(a.format)),
    ])
  }
  for (const m of show.multiviewers) {
    outRows.push([
      '—',
      esc(m.name),
      'Multiviewer',
      esc(m.connector.toUpperCase()),
      String(m.count),
      esc(describe(m.format)),
    ])
  }
  out.push(table(['Screen', 'Destination', 'Role', 'Connector', 'Qty', 'Format'], outRows, ['', '', '', '', 'num', '']))

  // ------------------------------------------------------------- screens
  if (show.screens.length > 0) {
    out.push('<h2>Screens</h2>')
    for (const scr of show.screens) {
      out.push(
        `<h3>${esc(scr.name)} — ${scr.canvas.hActive}&times;${scr.canvas.vActive}@${scr.canvas.refreshHz}${
          scr.liveBackground ? ', live background' : ''
        }</h3>`,
      )
      if (scr.layers.length === 0) {
        out.push('<p class="soft">No layers — background only.</p>')
      } else {
        out.push(
          table(
            ['Layer', 'Kind', 'Format'],
            scr.layers.map((l) => [esc(l.name), esc(l.kind), esc(describe(l.format))]),
          ),
        )
      }
    }
  }

  // -------------------------------------------------------------- matrix
  out.push('<h2>Switcher compatibility matrix</h2>')
  out.push(
    table(
      ['Verdict', 'Device', 'Configuration', 'Spare in', 'Spare out', 'Notes'],
      results.map((r) => [
        `<span class="chip ${VERDICT_CLASS[r.best.verdict]}">${VERDICT_TEXT[r.best.verdict]}</span>`,
        `${esc(r.device.vendor)} ${esc(r.device.model)}`,
        esc(r.best.config.label),
        r.best.verdict.startsWith('fits') ? String(r.best.headroom.inputs) : '—',
        r.best.verdict.startsWith('fits') ? String(r.best.headroom.outputs) : '—',
        r.best.blockers.length > 0
          ? esc(r.best.blockers[0])
          : `<span class="soft">${esc(r.best.warnings[0] ?? '')}</span>`,
      ]),
      ['', '', '', 'num', 'num', ''],
    ),
  )

  // ------------------------------------------------------------ topology
  const fitting = results.filter(
    (r) => r.best.verdict === 'fits' || r.best.verdict === 'fits-with-tradeoff',
  )
  if (fitting.length === 0) {
    out.push('<h2>Wiring topology</h2>')
    out.push(
      '<p>No device in the database fits this show as described, so there is no topology to propose. The matrix above gives the first blocker for each.</p>',
    )
  } else {
    out.push('<h2>Wiring topology</h2>')
    for (const r of fitting) {
      const topo = proposeTopology(r.best, show)
      out.push(`<h3>${esc(topo.deviceLabel)} — ${esc(topo.configLabel)}</h3>`)
      out.push(
        table(
          ['Plug', 'Connector', 'Signal', 'Note'],
          [...topo.inputs, ...topo.outputs].map((row) => [
            `<span class="mono">${esc(row.plug)}</span>`,
            esc(row.connector),
            esc(row.signal),
            `<span class="soft">${esc(row.note ?? '')}</span>`,
          ]),
        ),
      )
      if (topo.notes.length > 0) {
        out.push('<ul>')
        for (const n of topo.notes) out.push(`<li>${esc(n)}</li>`)
        out.push('</ul>')
      }
    }
  }

  // --------------------------------------------------------- provenance
  out.push('<h2>Where these numbers come from</h2>')
  const seen = new Set<string>()
  const cites: string[] = []
  for (const r of results) {
    for (const c of [
      ...r.device.provenance.citations,
      ...r.best.config.pools.flatMap((p) => p.provenance?.citations ?? []),
    ]) {
      const key = `${c.source}|${c.claim}`
      if (seen.has(key)) continue
      seen.add(key)
      cites.push(
        `<li><strong>${esc(r.device.model)}</strong> — ${esc(c.claim)} <span class="soft">(${esc(
          c.source,
        )}${c.url ? `, <a href="${esc(c.url)}">${esc(c.url)}</a>` : ''}, read ${esc(c.read)})</span></li>`,
      )
    }
  }
  out.push(`<ul class="cites">${cites.join('\n')}</ul>`)

  out.push(
    `<h2>Caveat</h2><p>Every figure in this report is read from published vendor documentation and cited above. <strong>None of it has been verified against hardware</strong>, and vendors revise specifications without notice. Treat a "fits" as a shortlist, not a purchase order.</p>`,
  )

  return out.join('\n')
}

const REPORT_CSS = `
:root { color-scheme: light dark; }
body { font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: 0 auto; max-width: 900px; padding: 32px 24px 80px; color: #14202f; background: #fbfbf9; }
h1 { font-size: 24px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 30px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #dfe3e8; }
h3 { font-size: 15px; margin: 18px 0 6px; }
p { margin: 0 0 10px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 6px 0 14px; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8493a6;
  padding: 6px 10px; border-bottom: 1px solid #dfe3e8; }
td { padding: 6px 10px; border-bottom: 1px solid #edf0f3; vertical-align: top; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.soft { color: #55657a; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
.scroll-x { overflow-x: auto; }
.chip { display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  padding: 2px 7px; border-radius: 20px; white-space: nowrap; }
.chip.fits { color: #1a7a4c; background: #e6f4ec; }
.chip.tradeoff { color: #9a6413; background: #fbf1de; }
.chip.no { color: #a33125; background: #fbeae8; }
.chip.impossible { color: #8493a6; background: #edf0f3; }
ul.cites { font-size: 13px; color: #55657a; }
ul.cites li { margin-bottom: 5px; }
a { color: #1f5f96; word-break: break-all; }
@media print {
  body { max-width: none; padding: 0; background: #fff; font-size: 11pt; }
  h2 { break-after: avoid; }
  tr { break-inside: avoid; }
}
@media (prefers-color-scheme: dark) {
  body { background: #0e1620; color: #e8edf3; }
  h2 { border-color: #273445; }
  th { border-color: #273445; color: #6f7f93; }
  td { border-color: #1d2836; }
  .soft, ul.cites { color: #a2b0c2; }
  a { color: #6ea8dc; }
  .chip.fits { color: #5fc38d; background: #12291e; }
  .chip.tradeoff { color: #d9a441; background: #2b2113; }
  .chip.no { color: #e8776a; background: #2e1917; }
  .chip.impossible { color: #6f7f93; background: #1d2836; }
}
`

/** A standalone file: no scripts, no external requests, opens anywhere. */
export function standaloneReportHtml(show: Show, results: DeviceResult[], at = new Date()): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(show.name)} — switcher fit report</title>
<style>${REPORT_CSS}</style>
</head>
<body>
${reportBodyHtml(show, results, at)}
</body>
</html>
`
}

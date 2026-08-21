/** The right-hand column: the answer, and how it was arrived at. */

import { useMemo } from 'react'

import { deviceClass } from '../data/index.ts'
import type { DeviceResult } from '../lib/fit/evaluate.ts'
import type { ConfigResult, PoolUsage } from '../lib/fit/solve.ts'
import { proposeLoadout, type LoadoutOutcome } from '../lib/fit/loadout.ts'
import { proposeTopology } from '../lib/topology/propose.ts'
import type { Show } from '../lib/profiles/video.ts'
import { plugTotals } from '../lib/profiles/video.ts'
import { Chip } from './bits.tsx'

export function Results({ results, show }: { results: DeviceResult[]; show: Show }) {
  const totals = plugTotals(show)

  // Only searched for devices that missed — about 1.5 ms each, and only the
  // chassis that publish a card catalogue are searched at all.
  const loadouts = useMemo(() => {
    const m = new Map<string, LoadoutOutcome>()
    for (const r of results) {
      if (r.best.verdict === 'fits') continue
      m.set(r.device.id, proposeLoadout(r.device, show))
    }
    return m
  }, [results, show])
  const layerCount =
    show.screens.reduce((n, s) => n + s.layers.length, 0) +
    (show.layersOnAux ? show.auxes.reduce((n, a) => n + (a.layers?.length ?? 0), 0) : 0)

  const fitting = results.filter(
    (r) => r.best.verdict === 'fits' || r.best.verdict === 'fits-with-tradeoff',
  )

  const smt = results.filter((r) => deviceClass(r.device) === 'screen-management')
  const vm = results.filter((r) => deviceClass(r.device) === 'vision-mixer')

  return (
    <>
      <div className="summary-bar">
        <div>
          <span className="k">Screens</span>
          <span className="v">{show.screens.length}</span>
        </div>
        <div>
          <span className="k">Layers</span>
          <span className="v">{layerCount}</span>
        </div>
        <div>
          <span className="k">Input plugs</span>
          <span className="v">{totals.in}</span>
        </div>
        <div>
          <span className="k">Output plugs</span>
          <span className="v">{totals.out}</span>
        </div>
        <div>
          <span className="k">Devices that fit</span>
          <span className="v">
            {fitting.length}
            <span className="faint"> / {results.length}</span>
          </span>
        </div>
      </div>

      <Section
        title="Screen-management systems"
        blurb="Layers placed freely over a background. The bigger ones join several outputs into one edge-blended canvas; the older and smaller ones give you one screen per output."
        results={smt}
        show={show}
        loadouts={loadouts}
      />
      <Section
        title="Vision mixers"
        blurb="One raster per output, keyers rather than freely placed layers. A different tool for a different job — worth checking when the show is one screen and a couple of keys."
        results={vm}
        show={show}
        loadouts={loadouts}
      />

      <div className="disclaimer">
        <h3>What this tool does and does not know</h3>
        <p>
          Every figure here is read from published vendor documentation and cited on the device
          that uses it. <strong>None of it has been verified against hardware.</strong> Vendors
          also revise spec sheets without notice, and several of the numbers involved are stated
          as ranges or with conditions attached.
        </p>
        <p>
          Treat a "fits" as a shortlist, not a purchase order — and read the notes on the device
          before you commit a show to it. Where a figure could not be sourced it is marked
          unverified rather than guessed at quietly.
        </p>
      </div>
    </>
  )
}

function Section({
  title,
  blurb,
  results,
  show,
  loadouts,
}: {
  title: string
  blurb: string
  results: DeviceResult[]
  show: Show
  loadouts: Map<string, LoadoutOutcome>
}) {
  if (results.length === 0) return null
  const fits = results.filter(
    (r) => r.best.verdict === 'fits' || r.best.verdict === 'fits-with-tradeoff',
  ).length

  return (
    <>
      <div className="section-head">
        <h2>{title}</h2>
        <p>
          {fits} of {results.length} fit — {blurb}
        </p>
      </div>
      {results.map((r) => (
        <DeviceRow key={r.device.id} result={r} show={show} loadout={loadouts.get(r.device.id)} />
      ))}
    </>
  )
}

function DeviceRow({
  result,
  show,
  loadout,
}: {
  result: DeviceResult
  show: Show
  loadout?: LoadoutOutcome
}) {
  const best = result.best
  const fits = best.verdict === 'fits' || best.verdict === 'fits-with-tradeoff'
  const rescued = loadout?.kind === 'proposed'

  return (
    <details className="result" open={false}>
      <summary>
        <Chip verdict={best.verdict} />
        <span className="model">
          {result.device.vendor} {result.device.model}
          <small>
            {best.config.label}
            {result.configs.length > 1 && ` · ${result.configs.length} modes checked`}
          </small>
        </span>
        <span className="headroom">
          {fits
            ? `${best.headroom.inputs} in / ${best.headroom.outputs} out spare`
            : rescued
              ? 'fits with different cards'
              : `${best.blockers.length} blocker${best.blockers.length === 1 ? '' : 's'}`}
        </span>
      </summary>
      <div className="detail">
        {best.blockers.length > 0 && (
          <div>
            <h4>Why not</h4>
            <ul className="reasons bad">
              {best.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        <PoolTable usage={best.pools.usage} />

        {best.warnings.length > 0 && (
          <div>
            <h4>Worth knowing</h4>
            <ul className="reasons warn">
              {best.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {loadout && <Loadout outcome={loadout} show={show} />}

        {fits && <Topology result={best} show={show} />}

        {result.configs.length > 1 && (
          <div>
            <h4>Other modes</h4>
            <table>
              <tbody>
                {result.configs.slice(1).map((c) => (
                  <tr key={c.config.id}>
                    <td style={{ width: 1 }}>
                      <Chip verdict={c.verdict} />
                    </td>
                    <td>{c.config.label}</td>
                    <td className="soft">{c.blockers[0] ?? 'Fits.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Sources result={best} />
      </div>
    </details>
  )
}

function PoolTable({ usage }: { usage: PoolUsage[] }) {
  if (usage.length === 0) return null
  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Counted on</th>
            <th className="num">Used</th>
            <th className="num">Available</th>
            <th style={{ width: '22%' }}>Headroom</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((u, i) => {
            const pct = u.capacity > 0 ? Math.min(100, (u.used / u.capacity) * 100) : 0
            const cls = !u.ok ? 'over' : pct > 85 ? 'tight' : ''
            return (
              <tr key={i}>
                <td>
                  {u.pool.label}
                  <div className="faint">{u.pool.unit}</div>
                </td>
                <td className="soft">{u.scopeLabel}</td>
                <td className="num">{fmt(u.used)}</td>
                <td className="num">{fmt(u.capacity)}</td>
                <td>
                  <div className={`meter ${cls}`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  {u.rescuedBy && (
                    <div className="faint">
                      {u.rescuedBy.label} would give {fmt(u.rescuedBy.capacity)}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Topology({ result, show }: { result: ConfigResult; show: Show }) {
  const topo = proposeTopology(result, show)
  return (
    <div>
      <h4>Suggested wiring</h4>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th style={{ width: '16%' }}>Plug</th>
              <th style={{ width: '18%' }}>Connector</th>
              <th>Signal</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {topo.inputs.map((r, i) => (
              <tr key={`i${i}`}>
                <td className="mono">{r.plug}</td>
                <td className="soft">{r.connector}</td>
                <td>{r.signal}</td>
                <td className="faint">{r.note ?? ''}</td>
              </tr>
            ))}
            {topo.outputs.map((r, i) => (
              <tr key={`o${i}`}>
                <td className="mono">{r.plug}</td>
                <td className="soft">{r.connector}</td>
                <td>{r.signal}</td>
                <td className="faint">{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(topo.spare.inputs.length > 0 || topo.spare.outputs.length > 0) && (
        <p className="faint" style={{ marginTop: 6 }}>
          Spare after patching: {topo.spare.inputs.length} inputs, {topo.spare.outputs.length}{' '}
          outputs.
        </p>
      )}
    </div>
  )
}

/**
 * What a different set of cards would do for a chassis that missed.
 *
 * A "does not fit" on a modular chassis is only half an answer — the question
 * anyone specifying a build actually has is whether a different loadout takes
 * it. Where the catalogue is not published, that is said outright rather than
 * left as an empty space, because "no suggestion" and "cannot suggest" look
 * identical otherwise.
 */
function Loadout({ outcome, show }: { outcome: LoadoutOutcome; show: Show }) {
  if (outcome.kind === 'stock-already-fits') return null

  if (outcome.kind === 'not-supported') {
    return (
      <div className="notice info">
        <strong>No custom loadout to suggest.</strong> {outcome.reason}
      </div>
    )
  }

  if (outcome.kind === 'no-loadout-fits') {
    return (
      <div className="notice">
        <strong>No card loadout fixes this.</strong> {outcome.reason}
      </div>
    )
  }

  const p = outcome.proposal
  return (
    <div>
      <h4>It fits with different cards</h4>
      <div className="notice info">
        The stock loadout misses, but this chassis takes the show fitted as below —{' '}
        {p.slotsUsed.input} of {p.slotsAvailable.input} input slots and {p.slotsUsed.output} of{' '}
        {p.slotsAvailable.output} output slots. The cards and the slot counts are documented; this
        arrangement of them is not a product, and slot-position rules are not modelled, so check it
        against the vendor's own slot diagram before ordering.
      </div>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Card</th>
              <th className="num">Qty</th>
            </tr>
          </thead>
          <tbody>
            {p.inputCards.map((c) => (
              <tr key={`i-${c.card.id}`}>
                <td className="soft">Input</td>
                <td>{c.card.label}</td>
                <td className="num">{c.count}</td>
              </tr>
            ))}
            {p.outputCards.map((c) => (
              <tr key={`o-${c.card.id}`}>
                <td className="soft">Output</td>
                <td>{c.card.label}</td>
                <td className="num">{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Topology result={p.result} show={show} />
    </div>
  )
}

function Sources({ result }: { result: ConfigResult }) {
  const cites = [
    ...result.device.provenance.citations,
    ...result.config.pools.flatMap((p) => p.provenance?.citations ?? []),
  ]
  if (cites.length === 0) return null
  const seen = new Set<string>()
  const unique = cites.filter((c) => {
    const k = `${c.source}|${c.claim}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return (
    <details>
      <summary className="faint" style={{ cursor: 'pointer' }}>
        Where these numbers come from ({unique.length})
      </summary>
      <ul className="reasons faint" style={{ marginTop: 6 }}>
        {unique.map((c, i) => (
          <li key={i}>
            {c.claim} —{' '}
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer noopener">
                {c.source}
              </a>
            ) : (
              c.source
            )}
            , read {c.read}.
          </li>
        ))}
      </ul>
    </details>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

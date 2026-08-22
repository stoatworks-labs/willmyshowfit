/**
 * What goes in the report, chosen before it is printed or downloaded.
 *
 * Screen-only (`no-print`), and deliberately sitting above the report rather
 * than in a dialog: the report re-renders live underneath as boxes are ticked,
 * so the effect of turning off the topology is visible rather than described.
 *
 * Devices are grouped by vendor with a tri-state vendor box, because "just the
 * Analog Way ones" is the filter people actually want and doing it a model at a
 * time across twelve Analog Way devices is not a filter, it is a chore.
 */

import type { DeviceResult } from '../lib/fit/evaluate.ts'
import {
  fittingDeviceIds,
  type ReportOptions,
  type ReportSections,
} from '../lib/report/options.ts'
import { Chip } from './bits.tsx'

interface Props {
  results: DeviceResult[]
  options: ReportOptions
  onChange: (o: ReportOptions) => void
}

const SECTION_LABELS: { key: keyof ReportSections; label: string; hint: string }[] = [
  { key: 'inputList', label: 'Input list', hint: 'Every source, its connector and format.' },
  { key: 'outputList', label: 'Output list', hint: 'Every destination, aux and multiviewer.' },
  { key: 'screens', label: 'Screen breakdown', hint: 'Canvas and layers, screen by screen.' },
  {
    key: 'topology',
    label: 'Wiring topology',
    hint: 'A full patch list under every switcher that fits. Usually the longest part.',
  },
  {
    key: 'citations',
    label: 'Source documents',
    hint: 'The links at the end — a citation for every number used.',
  },
]

export function ReportControls({ results, options, onChange }: Props) {
  const chosen = new Set(options.devices)
  const setDevices = (devices: string[]) => onChange({ ...options, devices })
  const setSection = (key: keyof ReportSections, on: boolean) =>
    onChange({ ...options, sections: { ...options.sections, [key]: on } })

  const vendors = [...new Set(results.map((r) => r.device.vendor))]
  const fitting = fittingDeviceIds(results)

  const toggleDevice = (id: string, on: boolean) =>
    setDevices(on ? [...options.devices, id] : options.devices.filter((d) => d !== id))

  const toggleVendor = (vendor: string, on: boolean) => {
    const ids = results.filter((r) => r.device.vendor === vendor).map((r) => r.device.id)
    setDevices(
      on
        ? [...options.devices, ...ids.filter((i) => !chosen.has(i))]
        : options.devices.filter((d) => !ids.includes(d)),
    )
  }

  const sectionsOff = SECTION_LABELS.filter((s) => !options.sections[s.key]).length

  return (
    <details className="panel no-print report-controls">
      <summary>
        <span>Report options</span>
        <span className="faint">
          {chosen.size} of {results.length} switchers
          {sectionsOff > 0 && ` · ${sectionsOff} section${sectionsOff === 1 ? '' : 's'} off`}
        </span>
      </summary>

      <div className="panel-body">
        <div className="subitems">
          <h4>Sections</h4>
          {SECTION_LABELS.map((s) => (
            <div className="check" key={s.key} style={{ marginBottom: 6 }}>
              <input
                id={`sec-${s.key}`}
                type="checkbox"
                checked={options.sections[s.key]}
                onChange={(e) => setSection(s.key, e.target.checked)}
              />
              <div>
                <label htmlFor={`sec-${s.key}`}>{s.label}</label>
                <span className="hint">{s.hint}</span>
              </div>
            </div>
          ))}
          <p className="faint" style={{ marginTop: 6 }}>
            The show summary and the caveat always stay in. A report that says which switchers fit
            has to say what the claim rests on.
          </p>
        </div>

        <div className="subitems">
          <h4>
            Switchers{' '}
            <button className="link" onClick={() => setDevices(results.map((r) => r.device.id))}>
              all
            </button>
            <button className="link" onClick={() => setDevices([])}>
              none
            </button>
            <button className="link" onClick={() => setDevices(fitting)} disabled={fitting.length === 0}>
              only what fits ({fitting.length})
            </button>
          </h4>

          {vendors.map((vendor) => {
            // Ranked order is right for the verdict list and wrong here: this
            // is a lookup, and a machine you are trying to find has to be where
            // you would look for it. Family, then model.
            const rows = results
              .filter((r) => r.device.vendor === vendor)
              .sort(
                (a, b) =>
                  a.device.family.localeCompare(b.device.family) ||
                  a.device.model.localeCompare(b.device.model, undefined, { numeric: true }),
              )
            const on = rows.filter((r) => chosen.has(r.device.id)).length
            return (
              <div className="vendor" key={vendor}>
                <div className="check">
                  <input
                    id={`v-${vendor}`}
                    type="checkbox"
                    checked={on === rows.length}
                    ref={(el) => {
                      // Partly-selected vendors read as "off" without this, and
                      // the box then lies about what is in the report.
                      if (el) el.indeterminate = on > 0 && on < rows.length
                    }}
                    onChange={(e) => toggleVendor(vendor, e.target.checked)}
                  />
                  <label htmlFor={`v-${vendor}`}>
                    {vendor} <span className="faint">{on}/{rows.length}</span>
                  </label>
                </div>
                <div className="models">
                  {rows.map((r) => (
                    <label
                      className="model"
                      key={r.device.id}
                      // Long model names ellipsis in a narrow column, and the
                      // ATEM Constellations differ only in the truncated part.
                      title={`${r.device.model} — ${r.best.config.label}`}
                    >
                      <input
                        type="checkbox"
                        checked={chosen.has(r.device.id)}
                        onChange={(e) => toggleDevice(r.device.id, e.target.checked)}
                      />
                      <Chip verdict={r.best.verdict} />
                      <span>{r.device.model}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </details>
  )
}

/**
 * What goes in the report, chosen before it is printed or downloaded.
 *
 * Screen-only (`no-print`), and deliberately sitting above the report rather
 * than in a dialog: the report re-renders live underneath as boxes are ticked,
 * so the effect of turning off the topology is visible rather than described.
 *
 * The switcher picker is the same component the planning page uses, on the same
 * selection — see `DevicePicker`. The sections are this panel's own.
 */

import type { DeviceResult } from '../lib/fit/evaluate.ts'
import type { ReportOptions, ReportSections } from '../lib/report/options.ts'
import { DevicePicker } from './DevicePicker.tsx'

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
  const setSection = (key: keyof ReportSections, on: boolean) =>
    onChange({ ...options, sections: { ...options.sections, [key]: on } })

  const sectionsOff = SECTION_LABELS.filter((s) => !options.sections[s.key]).length

  return (
    <details className="panel no-print report-controls">
      <summary>
        <span>Report options</span>
        <span className="faint">
          {options.devices.length} of {results.length} switchers
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
          <h4>Switchers</h4>
          <p className="faint" style={{ marginBottom: 6 }}>
            The same selection as the planning page — narrowing it in one place narrows it in
            both.
          </p>
          <DevicePicker
            results={results}
            selected={options.devices}
            onChange={(devices) => onChange({ ...options, devices })}
            idPrefix="rep"
          />
        </div>
      </div>
    </details>
  )
}

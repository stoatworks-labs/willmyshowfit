/**
 * Choosing which switchers to look at, by brand or by model.
 *
 * One component, two places: the verdict list on the planning page and the
 * report options. They share the SAME selection deliberately — narrowing the
 * list to Barco while you compare and then getting a thirty-seven-row report
 * would mean doing the work twice, and nobody would guess they had to.
 *
 * Vendor boxes are tri-state, because "just the Analog Way ones" is the filter
 * people actually want and doing that a model at a time across twenty-five
 * devices is a chore, not a filter.
 */

import type { DeviceResult } from '../lib/fit/evaluate.ts'
import { fittingDeviceIds } from '../lib/report/options.ts'
import { Chip } from './bits.tsx'

interface Props {
  /** Every device, including the ones currently unselected. */
  results: DeviceResult[]
  selected: string[]
  onChange: (ids: string[]) => void
  /**
   * Namespaces the checkbox ids. Two pickers on one page would otherwise share
   * `v-Barco`, and clicking one label would toggle the other's box.
   */
  idPrefix: string
}

export function DevicePicker({ results, selected, onChange, idPrefix }: Props) {
  const chosen = new Set(selected)
  const vendors = [...new Set(results.map((r) => r.device.vendor))]
  const fitting = fittingDeviceIds(results)

  const toggleDevice = (id: string, on: boolean) =>
    onChange(on ? [...selected, id] : selected.filter((d) => d !== id))

  const toggleVendor = (vendor: string, on: boolean) => {
    const ids = results.filter((r) => r.device.vendor === vendor).map((r) => r.device.id)
    onChange(
      on
        ? [...selected, ...ids.filter((i) => !chosen.has(i))]
        : selected.filter((d) => !ids.includes(d)),
    )
  }

  return (
    <>
      <div className="picker-actions">
        <button className="link" onClick={() => onChange(results.map((r) => r.device.id))}>
          all
        </button>
        <button className="link" onClick={() => onChange([])}>
          none
        </button>
        <button className="link" onClick={() => onChange(fitting)} disabled={fitting.length === 0}>
          only what fits ({fitting.length})
        </button>
      </div>

      {vendors.map((vendor) => {
        // Ranked order is right for the verdict list and wrong here: this is a
        // lookup, and a machine you are trying to find has to be where you
        // would look for it. Family, then model.
        const rows = results
          .filter((r) => r.device.vendor === vendor)
          .sort(
            (a, b) =>
              a.device.family.localeCompare(b.device.family) ||
              a.device.model.localeCompare(b.device.model, undefined, { numeric: true }),
          )
        const on = rows.filter((r) => chosen.has(r.device.id)).length
        const id = `${idPrefix}-v-${vendor.replace(/\s+/g, '-')}`
        return (
          <div className="vendor" key={vendor}>
            <div className="check">
              <input
                id={id}
                type="checkbox"
                checked={on === rows.length}
                ref={(el) => {
                  // Partly-selected vendors read as "off" without this, and the
                  // box then lies about what is included.
                  if (el) el.indeterminate = on > 0 && on < rows.length
                }}
                onChange={(e) => toggleVendor(vendor, e.target.checked)}
              />
              <label htmlFor={id}>
                {vendor}{' '}
                <span className="faint">
                  {on}/{rows.length}
                </span>
              </label>
            </div>
            <div className="models">
              {rows.map((r) => (
                <label
                  className="model"
                  key={r.device.id}
                  // Long model names ellipsis in a narrow column, and the ATEM
                  // Constellations differ only in the truncated part.
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
    </>
  )
}

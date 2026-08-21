/**
 * The show editor: everything that describes the show.
 *
 * Laid out as four independent columns — outputs, auxes, multiviewer, inputs —
 * rather than one tall stack. A show is edited by moving between those four
 * lists, and stacking them meant scrolling past the screens to reach the
 * sources every single time. They collapse to two columns and then to one on
 * narrower windows; the show name and the aux-layers switch stay full width
 * above them, because they apply to all four.
 */

import type {
  Show,
  ShowDestination,
  ShowLayer,
  ShowScreen,
  ShowSource,
} from '../lib/profiles/video.ts'
import {
  ConnectorSelect,
  FormatFields,
  HD,
  HD_SDI,
  Num,
  Text,
  nextId,
} from './bits.tsx'

interface Props {
  show: Show
  onChange: (s: Show) => void
}

export function ShowForm({ show, onChange }: Props) {
  const set = (patch: Partial<Show>) => onChange({ ...show, ...patch })

  return (
    <>
      <section className="panel">
        <div className="panel-body">
          <Text label="Show name" value={show.name} onChange={(name) => set({ name })} />
          <div className="check">
            <input
              id="layers-on-aux"
              type="checkbox"
              checked={show.layersOnAux}
              onChange={(e) => set({ layersOnAux: e.target.checked })}
            />
            <div>
              <label htmlFor="layers-on-aux">Build layers on aux outputs</label>
              <span className="hint">
                Lets an aux carry its own layers — an IMAG feed with a lower third on it, say.
                Devices differ sharply here: LivePremier does it without touching the main layer
                budget, Event Master and PixelHue spend the same layers a screen would, and an ATEM
                aux cannot carry a key at all.
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="show-grid">
        <div className="show-col">
          <Screens show={show} set={set} />
        </div>
        <div className="show-col">
          <Destinations
            title="Aux outputs"
            items={show.auxes}
            allowLayers={show.layersOnAux}
            onChange={(auxes) => set({ auxes })}
            addLabel="Add aux"
            make={() => ({
              id: nextId('aux'),
              name: 'Aux',
              connector: 'sdi',
              count: 1,
              format: HD_SDI,
            })}
          />
        </div>
        <div className="show-col">
          <Destinations
            title="Multiviewer"
            items={show.multiviewers}
            allowLayers={false}
            onChange={(multiviewers) => set({ multiviewers })}
            addLabel="Add multiviewer"
            make={() => ({
              id: nextId('mv'),
              name: 'Multiviewer',
              connector: 'hdmi',
              count: 1,
              format: HD,
            })}
          />
        </div>
        <div className="show-col">
          <Sources show={show} set={set} />
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ sources

function Sources({ show, set }: { show: Show; set: (p: Partial<Show>) => void }) {
  const update = (i: number, patch: Partial<ShowSource>) => {
    const sources = show.sources.map((s, j) => (j === i ? { ...s, ...patch } : s))
    set({ sources })
  }

  return (
    <section className="panel">
      <header>
        <h2>Sources</h2>
        <button
          onClick={() =>
            set({
              sources: [
                ...show.sources,
                { id: nextId('src'), name: 'New source', connector: 'hdmi', count: 1, format: HD },
              ],
            })
          }
        >
          Add source
        </button>
      </header>
      <div className="panel-body">
        {show.sources.length === 0 && <p className="empty">Nothing plugged in yet.</p>}
        {show.sources.map((s, i) => (
          <div className="item" key={s.id}>
            <header>
              <div className="name">
                <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
              </div>
              <button
                className="link danger"
                title="Remove"
                onClick={() => set({ sources: show.sources.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            </header>
            <div className="field-row">
              <ConnectorSelect value={s.connector} onChange={(connector) => update(i, { connector })} />
              <Num
                label="How many"
                value={s.count}
                onChange={(count) => update(i, { count })}
                className="narrow"
              />
              <div className="narrow">
                <label>Cables</label>
                <select
                  value={s.plugsPerSignal ?? 1}
                  onChange={(e) =>
                    update(i, { plugsPerSignal: Number(e.target.value) as 1 | 2 | 4 })
                  }
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </div>
            </div>
            <FormatFields value={s.format} onChange={(format) => update(i, { format })} />
            <div className="check" style={{ marginTop: 8 }}>
              <input
                id={`hdcp-${s.id}`}
                type="checkbox"
                checked={s.hdcp ?? false}
                onChange={(e) => update(i, { hdcp: e.target.checked })}
              />
              <label htmlFor={`hdcp-${s.id}`}>HDCP protected</label>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ screens

function Screens({ show, set }: { show: Show; set: (p: Partial<Show>) => void }) {
  const update = (i: number, patch: Partial<ShowScreen>) =>
    set({ screens: show.screens.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  return (
    <section className="panel">
      <header>
        <h2>Screens &amp; outputs</h2>
        <button
          onClick={() =>
            set({
              screens: [
                ...show.screens,
                {
                  id: nextId('scr'),
                  name: 'New screen',
                  canvas: { hActive: 1920, vActive: 1080, refreshHz: 60 },
                  liveBackground: false,
                  layers: [],
                  destinations: [],
                },
              ],
            })
          }
        >
          Add screen
        </button>
      </header>
      <div className="panel-body">
        {show.screens.length === 0 && <p className="empty">No screens yet.</p>}
        {show.screens.map((scr, i) => (
          <div className="item" key={scr.id}>
            <header>
              <div className="name">
                <input value={scr.name} onChange={(e) => update(i, { name: e.target.value })} />
              </div>
              <button
                className="link danger"
                onClick={() => set({ screens: show.screens.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            </header>

            <div className="field-row">
              <Num
                label="Canvas width"
                value={scr.canvas.hActive}
                onChange={(hActive) => update(i, { canvas: { ...scr.canvas, hActive } })}
              />
              <Num
                label="Height"
                value={scr.canvas.vActive}
                onChange={(vActive) => update(i, { canvas: { ...scr.canvas, vActive } })}
              />
              <Num
                label="Hz"
                value={scr.canvas.refreshHz}
                onChange={(refreshHz) => update(i, { canvas: { ...scr.canvas, refreshHz } })}
                className="narrow"
              />
            </div>

            <div className="check" style={{ marginTop: 8 }}>
              <input
                id={`bg-${scr.id}`}
                type="checkbox"
                checked={scr.liveBackground}
                onChange={(e) => update(i, { liveBackground: e.target.checked })}
              />
              <div>
                <label htmlFor={`bg-${scr.id}`}>Live input as the background</label>
                <span className="hint">
                  Rather than a still or black. Some switchers cannot do this at all.
                </span>
              </div>
            </div>

            <Layers
              layers={scr.layers}
              onChange={(layers) => update(i, { layers })}
              title="Layers"
            />

            <div className="subitems">
              <h4>Outputs feeding this screen</h4>
              <DestinationList
                items={scr.destinations}
                allowLayers={false}
                onChange={(destinations) => update(i, { destinations })}
                make={() => ({
                  id: nextId('dst'),
                  name: 'Display',
                  connector: 'hdmi',
                  count: 1,
                  format: HD,
                })}
                addLabel="Add output"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------- layers

function Layers({
  layers,
  onChange,
  title,
}: {
  layers: ShowLayer[]
  onChange: (l: ShowLayer[]) => void
  title: string
}) {
  const update = (i: number, patch: Partial<ShowLayer>) =>
    onChange(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  return (
    <div className="subitems">
      <h4>
        {title}{' '}
        <button
          className="link"
          onClick={() =>
            onChange([
              ...layers,
              { id: nextId('lay'), name: `Layer ${layers.length + 1}`, kind: 'mixing', format: HD },
            ])
          }
        >
          + add
        </button>
      </h4>
      {layers.length === 0 && <p className="empty">None.</p>}
      {layers.map((l, i) => (
        <div key={l.id} style={{ marginBottom: 8 }}>
          <div className="field-row">
            <div>
              <input value={l.name} onChange={(e) => update(i, { name: e.target.value })} />
            </div>
            <div className="narrow">
              <select
                value={l.kind}
                onChange={(e) => update(i, { kind: e.target.value as ShowLayer['kind'] })}
              >
                <option value="mixing">Mixing</option>
                <option value="split">Split</option>
              </select>
            </div>
            <button
              className="link danger"
              style={{ flex: '0 0 auto' }}
              onClick={() => onChange(layers.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <FormatFields value={l.format} onChange={(format) => update(i, { format })} compact />
        </div>
      ))}
    </div>
  )
}

// -------------------------------------------------------------- destinations

function Destinations({
  title,
  items,
  allowLayers,
  onChange,
  make,
  addLabel,
}: {
  title: string
  items: ShowDestination[]
  allowLayers: boolean
  onChange: (d: ShowDestination[]) => void
  make: () => ShowDestination
  addLabel: string
}) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        <button onClick={() => onChange([...items, make()])}>{addLabel}</button>
      </header>
      <div className="panel-body">
        <DestinationList
          items={items}
          allowLayers={allowLayers}
          onChange={onChange}
          make={make}
          addLabel={addLabel}
          hideAdd
        />
      </div>
    </section>
  )
}

function DestinationList({
  items,
  allowLayers,
  onChange,
  make,
  addLabel,
  hideAdd = false,
}: {
  items: ShowDestination[]
  allowLayers: boolean
  onChange: (d: ShowDestination[]) => void
  make: () => ShowDestination
  addLabel: string
  hideAdd?: boolean
}) {
  const update = (i: number, patch: Partial<ShowDestination>) =>
    onChange(items.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  return (
    <>
      {items.length === 0 && <p className="empty">None.</p>}
      {items.map((d, i) => (
        <div className="item" key={d.id}>
          <header>
            <div className="name">
              <input value={d.name} onChange={(e) => update(i, { name: e.target.value })} />
            </div>
            <button
              className="link danger"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </header>
          <div className="field-row">
            <ConnectorSelect value={d.connector} onChange={(connector) => update(i, { connector })} />
            <Num
              label="How many"
              value={d.count}
              onChange={(count) => update(i, { count })}
              className="narrow"
            />
            <div className="narrow">
              <label>Cables</label>
              <select
                value={d.plugsPerSignal ?? 1}
                onChange={(e) => update(i, { plugsPerSignal: Number(e.target.value) as 1 | 2 | 4 })}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={4}>4</option>
              </select>
            </div>
          </div>
          <FormatFields value={d.format} onChange={(format) => update(i, { format })} />
          {allowLayers && (
            <Layers
              layers={d.layers ?? []}
              onChange={(layers) => update(i, { layers })}
              title="Layers on this aux"
            />
          )}
        </div>
      ))}
      {!hideAdd && (
        <button className="link" onClick={() => onChange([...items, make()])}>
          + {addLabel}
        </button>
      )}
    </>
  )
}

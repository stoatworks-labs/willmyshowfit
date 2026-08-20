/** Small shared pieces: field editors, chips, and the example show. */

import type { ConnectorKind } from '../lib/model/types.ts'
import type { VideoFormat } from '../lib/model/signal.ts'
import type { Show } from '../lib/profiles/video.ts'
import type { Verdict } from '../lib/fit/solve.ts'

export const CONNECTOR_LABELS: Record<string, string> = {
  hdmi: 'HDMI',
  displayport: 'DisplayPort',
  dvi: 'DVI',
  sdi: 'SDI',
  sfp: 'SFP+',
  fiber: 'Fibre',
  ndi: 'NDI',
}

export const CONNECTOR_CHOICES: ConnectorKind[] = ['hdmi', 'displayport', 'dvi', 'sdi']

export function Chip({ verdict }: { verdict: Verdict }) {
  const map: Record<Verdict, [string, string]> = {
    fits: ['fits', 'Fits'],
    'fits-with-tradeoff': ['tradeoff', 'Fits, with a trade-off'],
    'does-not-fit': ['no', 'Does not fit'],
    impossible: ['impossible', 'Wrong tool'],
  }
  const [cls, text] = map[verdict]
  return <span className={`chip ${cls}`}>{text}</span>
}

export function Num({
  label,
  value,
  onChange,
  min = 1,
  step = 1,
  className,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  step?: number
  className?: string
}) {
  return (
    <div className={className}>
      <label>{label}</label>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </div>
  )
}

export function Text({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (s: string) => void
}) {
  return (
    <div>
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/** Resolution, rate, depth and sampling — the four things that decide a fit. */
export function FormatFields({
  value,
  onChange,
  compact = false,
}: {
  value: VideoFormat
  onChange: (f: VideoFormat) => void
  compact?: boolean
}) {
  const set = (patch: Partial<VideoFormat>) => onChange({ ...value, ...patch })
  return (
    <>
      <div className="field-row">
        <Num label="Width" value={value.hActive} onChange={(hActive) => set({ hActive })} />
        <Num label="Height" value={value.vActive} onChange={(vActive) => set({ vActive })} />
        <Num
          label="Hz"
          value={value.refreshHz}
          onChange={(refreshHz) => set({ refreshHz })}
          className="narrow"
        />
      </div>
      {!compact && (
        <div className="field-row">
          <div className="narrow">
            <label>Depth</label>
            <select
              value={value.bpc}
              onChange={(e) => set({ bpc: Number(e.target.value) as 8 | 10 | 12 })}
            >
              <option value={8}>8-bit</option>
              <option value={10}>10-bit</option>
              <option value={12}>12-bit</option>
            </select>
          </div>
          <div>
            <label>Sampling</label>
            <select
              value={value.sampling}
              onChange={(e) => set({ sampling: e.target.value as VideoFormat['sampling'] })}
            >
              <option value="rgb444">RGB 4:4:4</option>
              <option value="ycbcr444">YCbCr 4:4:4</option>
              <option value="ycbcr422">YCbCr 4:2:2</option>
              <option value="ycbcr420">YCbCr 4:2:0</option>
            </select>
          </div>
        </div>
      )}
    </>
  )
}

export function ConnectorSelect({
  value,
  onChange,
}: {
  value: ConnectorKind
  onChange: (c: ConnectorKind) => void
}) {
  return (
    <div>
      <label>Connector</label>
      <select value={value} onChange={(e) => onChange(e.target.value as ConnectorKind)}>
        {CONNECTOR_CHOICES.map((c) => (
          <option key={c} value={c}>
            {CONNECTOR_LABELS[c]}
          </option>
        ))}
      </select>
    </div>
  )
}

export const HD: VideoFormat = {
  hActive: 1920,
  vActive: 1080,
  refreshHz: 60,
  bpc: 8,
  sampling: 'rgb444',
}
export const HD_SDI: VideoFormat = { ...HD, bpc: 10, sampling: 'ycbcr422' }
export const UHD: VideoFormat = { ...HD, hActive: 3840, vActive: 2160 }

let counter = 0
export function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

/**
 * The show the page opens with.
 *
 * A real, ordinary corporate general session: a wide blended screen, side
 * screens, a handful of laptops and playback, IMAG, and a couple of comfort
 * feeds. It exists so the tool shows its working the moment the page loads
 * rather than presenting an empty form.
 */
export function exampleShow(): Show {
  return {
    name: 'Corporate general session',
    layersOnAux: false,
    notes: '',
    sources: [
      { id: 'src-pb', name: 'Playback (dual)', connector: 'sdi', count: 2, format: HD_SDI },
      { id: 'src-cam', name: 'Cameras', connector: 'sdi', count: 2, format: HD_SDI },
      { id: 'src-lect', name: 'Lectern laptop', connector: 'hdmi', count: 1, format: HD, hdcp: true },
      { id: 'src-pres', name: 'Presenter laptops', connector: 'hdmi', count: 4, format: HD },
      { id: 'src-4k', name: '4K content server', connector: 'displayport', count: 1, format: UHD },
    ],
    screens: [
      {
        id: 'scr-main',
        name: 'Main wide (blended)',
        canvas: { hActive: 5760, vActive: 1080, refreshHz: 60 },
        liveBackground: true,
        layers: [
          { id: 'lay-imag', name: 'IMAG', kind: 'mixing', format: HD },
          { id: 'lay-slides', name: 'Slides', kind: 'mixing', format: HD },
          { id: 'lay-lower', name: 'Lower third', kind: 'split', format: HD },
        ],
        destinations: [
          { id: 'dst-main', name: 'LED processor', connector: 'hdmi', count: 3, format: HD },
        ],
      },
      {
        id: 'scr-side',
        name: 'Side screens',
        canvas: { hActive: 1920, vActive: 1080, refreshHz: 60 },
        liveBackground: false,
        layers: [{ id: 'lay-side', name: 'IMAG', kind: 'mixing', format: HD }],
        destinations: [
          { id: 'dst-side', name: 'Side projectors', connector: 'hdmi', count: 2, format: HD },
        ],
      },
    ],
    auxes: [
      { id: 'aux-conf', name: 'Stage confidence', connector: 'hdmi', count: 2, format: HD },
      { id: 'aux-rec', name: 'Record / stream', connector: 'hdmi', count: 1, format: HD },
    ],
    multiviewers: [{ id: 'mv-rack', name: 'Rack monitor', connector: 'hdmi', count: 1, format: HD }],
  }
}

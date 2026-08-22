import { useMemo, useRef, useState } from 'react'

import { DEVICES } from './data/index.ts'
import { evaluateAll } from './lib/fit/evaluate.ts'
import { showToXml, xmlToShow } from './lib/io/xml.ts'
import { reportBodyHtml, standaloneReportHtml } from './lib/report/html.ts'
import { ALL_SECTIONS, type ReportOptions } from './lib/report/options.ts'
import { emptyShow, type Show } from './lib/profiles/video.ts'
import { exampleShow } from './ui/bits.tsx'
import { ReportControls } from './ui/ReportControls.tsx'
import { Results } from './ui/Results.tsx'
import { ShowForm } from './ui/ShowForm.tsx'

declare const __APP_VERSION__: string

type View = 'plan' | 'report'

export function App() {
  const [show, setShow] = useState<Show>(exampleShow)
  const [view, setView] = useState<View>('plan')
  const [problems, setProblems] = useState<string[]>([])
  // What "Blank show" threw away, so one stray click is not the end of an
  // afternoon's typing. Cleared as soon as the show is edited again.
  const [discarded, setDiscarded] = useState<Show | null>(null)
  // What goes into the report. Kept out of the show and out of the XML: these
  // describe one printout, not the show, so an exported file always reopens
  // with the whole report available.
  const [reportOptions, setReportOptions] = useState<ReportOptions>(() => ({
    devices: DEVICES.map((d) => d.id),
    sections: { ...ALL_SECTIONS },
  }))
  const fileInput = useRef<HTMLInputElement>(null)

  const edit = (next: Show) => {
    setShow(next)
    setDiscarded(null)
  }

  const results = useMemo(() => evaluateAll(DEVICES, show), [show])

  const download = (name: string, text: string, mime: string) => {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const slug = show.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'show'

  if (view === 'report') {
    return (
      <div className="report">
        <div className="toolbar no-print" style={{ marginBottom: 14 }}>
          <button onClick={() => setView('plan')}>← Back to planning</button>
          <button className="primary" onClick={() => window.print()}>
            Print / save as PDF
          </button>
          <button
            onClick={() =>
              download(
                `${slug}-fit-report.html`,
                // The same options the page below is showing. Print, download
                // and screen are one generator with one set of options, so what
                // is mailed to a client is what was looked at.
                standaloneReportHtml(show, results, new Date(), reportOptions),
                'text/html',
              )
            }
          >
            Download HTML
          </button>
        </div>

        <ReportControls results={results} options={reportOptions} onChange={setReportOptions} />

        <div
          // Every user-supplied string in here is escaped by the generator, and
          // the generator emits no scripts. Same source of truth as the file
          // the Download button writes, so the two cannot drift.
          dangerouslySetInnerHTML={{
            __html: reportBodyHtml(show, results, new Date(), reportOptions),
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="grow">
          <h1>Will my show fit?</h1>
          <p>
            Describe the screens, layers, sources and destinations. See which switchers actually
            take it — enough plugs of the right type and capability, enough layer capacity, enough
            outputs — and how you would wire each one.
          </p>
        </div>
        <div className="toolbar">
          <button onClick={() => fileInput.current?.click()}>Import XML</button>
          <input
            ref={fileInput}
            type="file"
            accept=".xml,text/xml,application/xml"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const result = xmlToShow(await file.text())
              edit(result.show)
              setProblems(result.problems)
              e.target.value = ''
            }}
          />
          <button onClick={() => download(`${slug}.xml`, showToXml(show), 'application/xml')}>
            Export XML
          </button>
          <button
            onClick={() => {
              setDiscarded(show)
              setShow(emptyShow())
              setProblems([])
            }}
          >
            Blank show
          </button>
          <button className="primary" onClick={() => setView('report')}>
            Report
          </button>
        </div>
      </header>

      {problems.length > 0 && (
        <div className="notice" style={{ marginTop: 16 }}>
          <strong>That file imported with {problems.length} problem{problems.length === 1 ? '' : 's'}.</strong>
          <ul className="reasons" style={{ marginTop: 6 }}>
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <button className="link" onClick={() => setProblems([])}>
            Dismiss
          </button>
        </div>
      )}

      {discarded && (
        <div className="notice info" style={{ marginTop: 16 }}>
          <strong>Blank show.</strong> The previous one is not saved anywhere else.
          <button
            className="link"
            onClick={() => {
              setShow(discarded)
              setDiscarded(null)
            }}
          >
            Put it back
          </button>
        </div>
      )}

      <div className="columns">
        <div className="col">
          <div className="sticky">
            <Results
              results={results}
              show={show}
              selected={reportOptions.devices}
              onSelectedChange={(devices) => setReportOptions({ ...reportOptions, devices })}
            />
          </div>
        </div>
        <div className="col">
          <ShowForm show={show} onChange={edit} />
          <p className="faint">
            Nothing here is uploaded. There is no backend to upload it to — the page is static
            files, and Export XML writes to a file you pick.
          </p>
        </div>
      </div>

      <footer className="faint" style={{ marginTop: 40 }}>
        {DEVICES.length} devices from Analog Way, Barco, PixelHue, Roland and Blackmagic Design ·{' '}
        {__APP_VERSION__} · Not affiliated with, endorsed by, or a product of any manufacturer named
        here. All trademarks belong to their owners.
      </footer>
    </div>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Vendored from stoatworks-backend/theme by scripts/sync-theme.sh: first, so styles.css layers over it.
import './stoatworks-theme.css'
import { App } from './App.tsx'
import { registerServiceWorker } from './register-sw.ts'
import './styles.css'

declare const __APP_VERSION__: string

// The About dialog's data file ships a version baked at sync time; this is the
// one the build actually produced. Spread, not assign: about-data.js may not
// have run yet, and it merges rather than overwriting. See public/about.js.
const w = window as unknown as { STOATWORKS_ABOUT?: Record<string, unknown> }
w.STOATWORKS_ABOUT = { ...w.STOATWORKS_ABOUT, version: __APP_VERSION__ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()

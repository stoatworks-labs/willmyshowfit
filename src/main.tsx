import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Vendored from stoatworks-backend/theme by scripts/sync-theme.sh: first, so styles.css layers over it.
import './stoatworks-theme.css'
import { App } from './App.tsx'
import { registerServiceWorker } from './register-sw.ts'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()

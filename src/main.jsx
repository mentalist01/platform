import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerOfflineServiceWorker } from './utils/offlineHomework.js'

if (import.meta.env.PROD) {
  registerOfflineServiceWorker().catch((error) => {
    console.warn('[offline] service worker registration failed:', error?.message || error)
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

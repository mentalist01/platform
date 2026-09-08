import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
const BoardTabletPage = lazy(() => import('./components/BoardTabletPage.jsx'))
import {
  cleanupOfflineServiceWorkerForDevelopment,
  registerOfflineServiceWorker,
} from './utils/offlineHomework.js'

const renderApp = () => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {window.location.hash.startsWith('#tablet=')
        ? <Suspense fallback={<div role="status">Подключаем планшет…</div>}><BoardTabletPage /></Suspense>
        : <App />}
    </StrictMode>,
  )
}

if (import.meta.env.PROD) {
  registerOfflineServiceWorker().catch((error) => {
    console.warn('[offline] service worker registration failed:', error?.message || error)
  })
  renderApp()
} else {
  cleanupOfflineServiceWorkerForDevelopment()
    .then((reloadRequired) => {
      if (reloadRequired) {
        window.location.reload()
        return
      }
      renderApp()
    })
    .catch((error) => {
      console.warn('[offline] development cleanup failed:', error?.message || error)
      renderApp()
    })
}

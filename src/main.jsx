import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
const BoardTabletPage = lazy(() => import('./components/BoardTabletPage.jsx'))
const GuestMeetingPage = lazy(() => import('./components/GuestMeetingPage.jsx'))
import {
  cleanupOfflineServiceWorkerForDevelopment,
  registerOfflineServiceWorker,
} from './utils/offlineHomework.js'

const renderApp = () => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {new URLSearchParams(window.location.search).has('meeting')
        ? <Suspense fallback={<div role="status">Открываем встречу…</div>}><GuestMeetingPage /></Suspense>
        : window.location.hash.startsWith('#tablet=')
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

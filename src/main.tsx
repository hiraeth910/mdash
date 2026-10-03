import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// A tab left open across a new release asks for page files that no longer exist (the server answers
// with the HTML page instead). Load the new release once; the guard stops a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  try {
    const last = Number(sessionStorage.getItem('reloaded-for-update') || 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('reloaded-for-update', String(Date.now()))
  } catch {
    // storage blocked: reload anyway, once per page load
  }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

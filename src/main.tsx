import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { SESSION_ID } from './api.ts'
import './index.css'

/** Both teammates' windows side by side, for demos: open /?view=split */
function Split() {
  const session = encodeURIComponent(SESSION_ID)
  return (
    <div className="split">
      {(['roy', 'mia'] as const).map((who) => (
        <section key={who} className={`split-pane split-${who}`}>
          <header>{who === 'roy' ? "Roy's window" : "Mia's window"}</header>
          <iframe title={who} src={`/?as=${who}&s=${session}`} />
        </section>
      ))}
    </div>
  )
}

const split = new URLSearchParams(location.search).get('view') === 'split'

createRoot(document.getElementById('root')!).render(<StrictMode>{split ? <Split /> : <App />}</StrictMode>)

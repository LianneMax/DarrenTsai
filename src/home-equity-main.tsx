import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import HomeEquityApp from './HomeEquityApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HomeEquityApp />
  </StrictMode>,
)

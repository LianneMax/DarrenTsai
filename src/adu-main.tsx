import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AduApp from './AduApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AduApp />
  </StrictMode>,
)

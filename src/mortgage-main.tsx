import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MortgageCalculatorApp from './MortgageCalculatorApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MortgageCalculatorApp />
  </StrictMode>,
)

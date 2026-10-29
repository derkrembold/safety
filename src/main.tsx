import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { appLogger } from './debug/appLogger'
import { installGlobalErrorHandlers } from './debug/logger'

const cleanup = installGlobalErrorHandlers(appLogger)
if (import.meta.hot) import.meta.hot.dispose(cleanup)

createRoot(document.getElementById('root')!, {
  onUncaughtError: (error) => appLogger.logError('react-render-failed', error),
  onCaughtError: (error) => appLogger.logError('react-boundary-caught', error),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

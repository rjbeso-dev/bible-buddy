import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { SettingsProvider } from './context/SettingsProvider'
import { AudioProvider } from './context/AudioProvider'
import { AuthProvider } from './context/AuthProvider'
import { AuthGateProvider } from './context/AuthGateProvider'
import { SyncProvider } from './context/SyncProvider'
import './styles/globals.css'
import './styles/reader.css'
import './styles/dashboard.css'
import './styles/shell.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <AudioProvider>
          <AuthProvider>
            <AuthGateProvider>
              <SyncProvider>
                <App />
                <Analytics />
              </SyncProvider>
            </AuthGateProvider>
          </AuthProvider>
        </AudioProvider>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>,
)

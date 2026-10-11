import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/tokens.css'
import './index.css'
import './cantum-theme.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { applyTheme, getInitialTheme } from './theme'

// Antes do primeiro render, para o tema salvo não piscar.
applyTheme(getInitialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

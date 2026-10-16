import React from 'react'
import ReactDOM from 'react-dom/client'
import { TenantProvider } from './context/TenantContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TenantProvider>
      <App />
    </TenantProvider>
  </React.StrictMode>,
)

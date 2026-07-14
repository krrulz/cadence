import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ConfigError from './components/ConfigError.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { firebaseConfigured } from './firebase.js'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {firebaseConfigured ? (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <ConfigError />
    )}
  </React.StrictMode>,
)

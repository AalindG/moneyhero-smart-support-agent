import { useState } from 'react'
import AdminLogin from './AdminLogin'
import AdminDashboard from './AdminDashboard'

const STORAGE_KEY = 'mh_admin_token'

/**
 * AdminPortal — top-level wrapper that manages auth state.
 * Reads/writes the token to sessionStorage so it persists across
 * navigation within the same browser tab but clears on tab close.
 */
export default function AdminPortal({ onBack }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(STORAGE_KEY))

  const handleLogin = newToken => {
    sessionStorage.setItem(STORAGE_KEY, newToken)
    setToken(newToken)
  }

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEY)
    setToken(null)
  }

  if (!token) {
    return <AdminLogin onLogin={handleLogin} onBack={onBack} />
  }

  return <AdminDashboard token={token} onLogout={handleLogout} onBack={onBack} />
}

import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, loading } = useAuth()

  if (loading) return <LoadingSpinner label="Checking session…" />
  if (!user || !profile) return <Navigate to="/login" replace />
  if (requireAdmin && profile.role !== 'admin') return <Navigate to="/me" replace />

  return children
}

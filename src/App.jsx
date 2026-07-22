import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import EmployeeDetail from './pages/EmployeeDetail.jsx'
import EmployeeDashboard from './pages/EmployeeDashboard.jsx'
import PtoCalendar from './pages/PtoCalendar.jsx'
import Links from './pages/Links.jsx'
import Analytics from './pages/Analytics.jsx'
import Prototype from './pages/Prototype.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public design prototype (mock data) — no auth, isolated from the app. */}
      <Route path="/prototype" element={<Prototype />} />
      <Route
        path="/"
        element={
          <ProtectedRoute requireAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee/:uid"
        element={
          <ProtectedRoute requireAdmin>
            <EmployeeDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/me"
        element={
          <ProtectedRoute>
            <EmployeeDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <PtoCalendar />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute requireAdmin>
            <Analytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/links"
        element={
          <ProtectedRoute>
            <Links />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

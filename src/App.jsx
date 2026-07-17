import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import EmployeeDetail from './pages/EmployeeDetail.jsx'
import EmployeeDashboard from './pages/EmployeeDashboard.jsx'
import PtoCalendar from './pages/PtoCalendar.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
    </Routes>
  )
}

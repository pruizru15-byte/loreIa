import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import EvaluatePage from './pages/EvaluatePage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import MapPage from './pages/MapPage'
import ProjectPage from './pages/ProjectPage'
import ProjectsAdminPage from './pages/ProjectsAdminPage'
import ProjectGeotechAdminPage from './pages/ProjectGeotechAdminPage'
import ProjectZonesAdminPage from './pages/ProjectZonesAdminPage'
import ProjectClimateAdminPage from './pages/ProjectClimateAdminPage'
import ReportsPage from './pages/ReportsPage'
import UsersAdminPage from './pages/UsersAdminPage'
import AdminSystemControlPage from './pages/AdminSystemControlPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/mapa" element={<MapPage />} />
        <Route path="/evaluacion" element={<EvaluatePage />} />
        <Route path="/proyectos/:id" element={<ProjectPage />} />
        <Route path="/admin/proyectos" element={<ProjectsAdminPage />} />
        <Route path="/admin/usuarios" element={<UsersAdminPage />} />
        <Route path="/admin/sistema" element={<AdminSystemControlPage />} />
        <Route path="/admin/proyectos/:id/zonas" element={<ProjectZonesAdminPage />} />
        <Route path="/admin/proyectos/:id/geotecnia" element={<ProjectGeotechAdminPage />} />
        <Route path="/admin/proyectos/:id/clima" element={<ProjectClimateAdminPage />} />
        <Route path="/historial" element={<HistoryPage />} />
        <Route path="/reportes" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="/mapa" replace />} />
      </Route>
    </Routes>
  )
}

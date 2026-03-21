import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DemoPage from './pages/Demo/DemoPage'
import AdminDashboard from './pages/Admin/Dashboard'
import RecordModePage from './pages/Admin/RecordMode'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<Navigate to="/demo" replace />} />
        <Route path="/demo"    element={<DemoPage />} />
        <Route path="/admin"   element={<AdminDashboard />} />
        <Route path="/admin/record" element={<RecordModePage />} />
      </Routes>
    </BrowserRouter>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DocumentsPage from './pages/DocumentsPage'
import EditorPage from './pages/EditorPage'

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? children : <Navigate to='/login' replace />
}

function PublicRoute({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return !isAuthenticated ? children : <Navigate to='/documents' replace />
}

export default function App() {
  return (
    <Routes>
      <Route
        path='/login'
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path='/register'
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path='/documents'
        element={
          <ProtectedRoute>
            <DocumentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path='/documents/:id'
        element={
          <ProtectedRoute>
            <EditorPage />
          </ProtectedRoute>
        }
      />
      <Route path='/' element={<Navigate to='/documents' replace />}
    </Routes>
  )
}

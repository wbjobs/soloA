import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { authApi } from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Viewer from './pages/Viewer';
import AuditLogs from './pages/AuditLogs';
import Layout from './components/Layout';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const App: React.FC = () => {
  const { token, setUser } = useAuthStore();

  useEffect(() => {
    if (token) {
      authApi.getMe()
        .then((res) => setUser(res.data))
        .catch(() => useAuthStore.getState().logout());
    }
  }, [token, setUser]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/viewer/:studyId" element={<Viewer />} />
                <Route path="/audit" element={<AuditLogs />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default App;

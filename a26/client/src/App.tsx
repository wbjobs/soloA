import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ScoreListPage } from './pages/ScoreListPage';
import { EditorPage } from './pages/EditorPage';
import { authApi } from './services/api';

function PrivateRoute({ children }: { children: JSX.Element }) {
  const isAuthenticated = authApi.isAuthenticated();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }: { children: JSX.Element }) {
  const isAuthenticated = authApi.isAuthenticated();
  return !isAuthenticated ? children : <Navigate to="/scores" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          } 
        />
        <Route 
          path="/" 
          element={
            <Navigate to="/scores" replace />
          } 
        />
        <Route 
          path="/scores" 
          element={
            <PrivateRoute>
              <ScoreListPage />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/scores/:id" 
          element={
            <PrivateRoute>
              <EditorPage />
            </PrivateRoute>
          } 
        />
        <Route 
          path="*" 
          element={
            <Navigate to="/scores" replace />
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

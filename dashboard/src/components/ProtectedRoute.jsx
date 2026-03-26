import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-brand-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

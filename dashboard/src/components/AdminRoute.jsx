import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-brand-400">Loading...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!user.isAdmin) {
    return (
      <main className="dashboard-page mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12">
        <section className="card w-full text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-400">Restricted area</p>
          <h1 className="mt-3 text-2xl font-bold text-white">Not authorised</h1>
          <p className="mt-2 text-sm text-gray-400">This console is available only to Avalisa administrators.</p>
        </section>
      </main>
    );
  }

  return children;
}

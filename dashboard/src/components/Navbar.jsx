import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const plan = user?.license?.plan || 'free';
  const badgeClass = plan === 'lifetime' ? 'badge-lifetime' : plan === 'basic' ? 'badge-basic' : 'badge-free';

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav className="border-b border-dark-600 bg-dark-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-brand-400">⚡ Avalisa Bot</span>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link to="/dashboard" className="text-sm text-gray-300 hover:text-white transition-colors">Dashboard</Link>
              <Link to="/pricing" className="text-sm text-gray-300 hover:text-white transition-colors">Pricing</Link>
              <Link to="/support" className="text-sm text-gray-300 hover:text-white transition-colors">Support</Link>
              <span className={badgeClass}>{plan}</span>
              <button
                onClick={() => { window.location.href = '/app' }}
                style={{ background: '#1a7cfa', color: '#fff', fontSize: 14, fontWeight: 600, padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
              >Open App →</button>
              <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white transition-colors">Logout</button>
            </>
          ) : (
            <>
              <Link to="/pricing" className="text-sm text-gray-300 hover:text-white transition-colors">Pricing</Link>
              <button
                onClick={() => { const t = localStorage.getItem('pwa_token'); window.location.href = t ? '/app' : '/app/login' }}
                style={{ background: '#1a7cfa', color: '#fff', fontSize: 14, fontWeight: 600, padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
              >Open App →</button>
              <Link to="/login" className="btn-outline text-sm py-1.5">Login</Link>
              <Link to="/register" className="btn-primary text-sm py-1.5">Get Started Free</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const plan = user?.license?.plan || 'free';
  const badgeClass = plan === 'lifetime' ? 'badge-lifetime' : plan === 'basic' ? 'badge-basic' : 'badge-free';
  const planLabel = plan === 'lifetime' ? 'pro' : plan;

  function handleLogout() {
    logout();
    navigate('/');
    setMenuOpen(false);
  }

  return (
    <nav className="border-b border-brand-900/30 bg-[#090a0f]/95 relative backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-brand-400">⚡ Avalisa Bot</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <Link to="/dashboard" className="text-sm text-gray-300 hover:text-white transition-colors">Dashboard</Link>
              <Link to="/pricing" className="text-sm text-gray-300 hover:text-white transition-colors">Pricing</Link>
              <Link to="/support" className="text-sm text-gray-300 hover:text-white transition-colors">Support</Link>
              <span className={badgeClass}>{planLabel}</span>
              <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white transition-colors">Logout</button>
            </>
          ) : (
            <>
              <Link to="/pricing" className="text-sm text-gray-300 hover:text-white transition-colors">Pricing</Link>
              <Link to="/login" className="btn-outline text-sm py-1.5">Login</Link>
              <Link to="/register" className="btn-primary text-sm py-1.5">Create Free Account</Link>
            </>
          )}
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="md:hidden text-gray-300 hover:text-white text-2xl leading-none px-2 py-1"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-dark-600 px-4 py-3 flex flex-col gap-3"
          style={{ background: '#0d1421' }}>
          {user ? (
            <>
              <Link to="/dashboard" onClick={() => setMenuOpen(false)}
                className="text-sm text-gray-300 hover:text-white transition-colors py-1">Dashboard</Link>
              <Link to="/pricing" onClick={() => setMenuOpen(false)}
                className="text-sm text-gray-300 hover:text-white transition-colors py-1">Pricing</Link>
              <Link to="/support" onClick={() => setMenuOpen(false)}
                className="text-sm text-gray-300 hover:text-white transition-colors py-1">Support</Link>
              <button onClick={handleLogout}
                className="text-sm text-gray-400 hover:text-white transition-colors text-left py-1">Logout</button>
            </>
          ) : (
            <>
              <Link to="/pricing" onClick={() => setMenuOpen(false)}
                className="text-sm text-gray-300 hover:text-white transition-colors py-1">Pricing</Link>
              <Link to="/login" onClick={() => setMenuOpen(false)}
                className="btn-outline text-sm py-2 text-center">Login</Link>
              <Link to="/register" onClick={() => setMenuOpen(false)}
                className="btn-primary text-sm py-2 text-center">Create Free Account</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

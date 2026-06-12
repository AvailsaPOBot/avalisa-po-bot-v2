import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const AFFILIATE_URL =
  'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';

const navItems = [
  { label: 'Phone Bot', href: '/#phone-bot' },
  { label: 'Avalisa AI', href: '/#ai' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'FAQ', href: '/#faq' },
];

function Brand() {
  return (
    <Link to="/" className="site-brand">
      <span className="site-brand__primary">
        <img className="brand-signature brand-signature--nav" src="/images/brand/avalisa-signature-logo-gold.png" alt="Avalisa PO Bot" />
      </span>
      <span className="site-brand__partner" aria-label="Pocket Option partner">
        <img src="/images/PO_Logo.png" alt="" />
      </span>
    </Link>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const plan = user?.license?.plan || 'free';
  const planLabel = plan === 'lifetime' ? 'pro' : plan === 'free' ? 'demo' : plan;

  function handleLogout() {
    logout();
    navigate('/');
    setMenuOpen(false);
  }

  return (
    <header className="site-nav">
      <div className="site-nav__inner">
        <Brand />

        <nav className="site-nav__links" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a key={item.label} href={item.href}>{item.label}</a>
          ))}
        </nav>

        <div className="site-nav__actions">
          {user ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <span>{planLabel}</span>
              <button type="button" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register" className="site-nav__cta">Sign up Avalisa</Link>
              <a href={AFFILIATE_URL} className="site-nav__po" target="_blank" rel="noreferrer">Pocket Option</a>
            </>
          )}
        </div>

        <button
          className="site-nav__menu"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="site-nav__mobile">
          {navItems.map((item) => (
            <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>
          ))}
          {user ? (
            <>
              <Link to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <button type="button" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)}>Login</Link>
              <Link to="/register" className="site-nav__cta" onClick={() => setMenuOpen(false)}>Sign up Avalisa</Link>
              <a href={AFFILIATE_URL} className="site-nav__po" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Pocket Option</a>
            </>
          )}
        </div>
      )}
    </header>
  );
}

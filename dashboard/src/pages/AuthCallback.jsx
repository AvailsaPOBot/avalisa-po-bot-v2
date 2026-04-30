import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import '../styles/luxury.css';

export default function AuthCallback() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || location.search);
    const token = params.get('token');
    const provider = params.get('provider');

    if (!token) {
      toast.error('Social sign in did not return a valid session.');
      return;
    }

    localStorage.setItem('jwt', token);
    localStorage.removeItem('user');
    toast.success(`Signed in with ${provider || 'social account'}.`);
    window.location.replace('/dashboard');
  }, [location.search]);

  return (
    <main className="lux-auth-page">
      <section className="lux-auth-shell">
        <div className="lux-auth-card">
          <div className="lux-auth-brand"><span>Avalisa</span></div>
          <h1>Signing you in</h1>
          <p>Connecting your account to the Avalisa dashboard.</p>
          <p className="lux-auth-switch">
            Taking too long? <Link to="/login">Return to sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

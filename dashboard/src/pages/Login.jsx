import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-showcase">
      <div className="auth-card">
        <div className="text-center mb-8">
          <span className="auth-logo">⚡ Avalisa</span>
          <h1 className="auth-title">Welcome back</h1>
          <p className="text-gray-400 mt-2">Sign in to your dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Email</label>
            <input
              type="email" required
              className="input"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Password</label>
            <input
              type="password" required
              className="input"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => {
                window.location.href = 'mailto:avalisapobot@gmail.com?subject=Avalisa%20password%20reset%20help';
              }}
              className="text-xs text-brand-400 hover:underline mt-1 block"
            >
              Forgot Password?
            </button>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          No account? <Link to="/register" className="text-brand-400 hover:underline">Register free</Link>
        </p>
      </div>
      <aside className="auth-mascot-panel auth-product-panel" aria-label="Avalisa assistant preview">
        <div className="auth-product-graph" />
        <div className="auth-product-bot">
          <span>⚡ Avalisa Bot</span>
          <strong>Ready on your PO chart</strong>
          <small>Scan · choose intensity · start</small>
        </div>
        <div className="auth-quote">
          <span>“</span>
          <p>Sign in, open Pocket Option, and run from the visible bot panel.</p>
          <strong>— Avalisa</strong>
        </div>
      </aside>
    </div>
  );
}

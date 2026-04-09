import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

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

  function handleResetSubmit(e) {
    e.preventDefault();
    setResetSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-3xl font-bold text-brand-400">⚡ Avalisa Bot</span>
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
              onClick={() => { setShowReset(r => !r); setResetSent(false); }}
              className="text-xs text-brand-400 hover:underline mt-1 block"
            >
              Forgot Password?
            </button>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {showReset && (
          <div className="mt-5 pt-5 border-t border-dark-600">
            {resetSent ? (
              <p className="text-sm text-green-400 text-center">
                If this email is registered, you'll receive a reset link shortly.
              </p>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-3">
                <p className="text-sm text-gray-400">Enter your email to receive a reset link.</p>
                <input
                  type="email" required
                  className="input"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                />
                <button type="submit" className="btn-primary w-full py-2.5">
                  Send Reset Link
                </button>
              </form>
            )}
          </div>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          No account? <Link to="/register" className="text-brand-400 hover:underline">Register free</Link>
        </p>
      </div>
    </div>
  );
}

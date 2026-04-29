import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register(form.email, form.password);
      toast.success('Account created! Welcome to Avalisa Bot.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-showcase">
      <div className="auth-card">
        <div className="text-center mb-6">
          <span className="auth-logo">⚡ Avalisa</span>
          <h1 className="auth-title">Create free account</h1>
          <p className="text-gray-400 mt-2">Create your free account</p>
        </div>

        <div className="bg-brand-900/40 border border-brand-600/40 rounded-lg p-4 mb-6 text-sm text-brand-100">
          <strong>Free Plan:</strong> Register a new Pocket Option account using our affiliate link to get Pro access.
          <a href={AFFILIATE_LINK} target="_blank" rel="noreferrer" className="block mt-2 text-brand-400 hover:underline font-semibold">
            → Register PO Account Free
          </a>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Email</label>
            <input type="email" required className="input" placeholder="you@example.com"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Password</label>
            <input type="password" required className="input" placeholder="Min 8 characters"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Confirm Password</label>
            <input type="password" required className="input" placeholder="Repeat password"
              value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
            {loading ? 'Creating account...' : 'Create Free Account'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account? <Link to="/login" className="text-brand-400 hover:underline">Sign in</Link>
        </p>
      </div>
      <aside className="auth-mascot-panel auth-product-panel" aria-label="Avalisa onboarding preview">
        <div className="auth-product-graph" />
        <div className="auth-product-bot">
          <span>⚡ Avalisa Bot</span>
          <strong>10 free trades waiting</strong>
          <small>Create account · test first</small>
        </div>
        <div className="auth-quote">
          <span>“</span>
          <p>New to PO? Register through Avalisa to request Pro access.</p>
          <strong>— Avalisa</strong>
        </div>
      </aside>
    </div>
  );
}

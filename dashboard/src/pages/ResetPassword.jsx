import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import '../styles/luxury.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.password !== form.confirm) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/reset-password', { token, password: form.password });
      if (data.token) {
        localStorage.setItem('jwt', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      toast.success('Password updated. Signing you in...');
      // Full reload so AuthProvider picks up the new session.
      window.location.assign('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="lux-auth-page">
      <section className="lux-auth-shell">
        <form className="lux-auth-card" onSubmit={handleSubmit}>
          <div className="lux-auth-brand"><img className="brand-signature brand-signature--auth" src="/images/brand/avalisa-signature-logo-gold.png" alt="Avalisa PO Bot" /></div>
          <h1>Choose a new password</h1>
          {token ? (
            <>
              <p>Enter a new password for your Avalisa PO Bot account.</p>
              <label><Lock size={15} /> New password<input type="password" required placeholder="••••••••" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></label>
              <label><Lock size={15} /> Confirm password<input type="password" required placeholder="••••••••" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} /></label>
              <button type="submit" disabled={loading}>{loading ? 'Updating...' : 'Update password'}</button>
            </>
          ) : (
            <p>This reset link is missing or invalid. Please <Link to="/forgot-password">request a new one</Link>.</p>
          )}
          <p className="lux-auth-switch">Back to <Link to="/login">sign in</Link></p>
        </form>

        <aside className="lux-auth-visual lux-auth-visual--login">
          <img className="lux-auth-visual__scene" src="/images/landing/generated/avalisa-auth-scene-gemini.png" alt="Avalisa assistant dashboard scene" />
        </aside>
      </section>
    </main>
  );
}

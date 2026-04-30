import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import '../styles/luxury.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="lux-auth-page">
      <section className="lux-auth-shell">
        <form className="lux-auth-card" onSubmit={handleSubmit}>
          <div className="lux-auth-brand"><Zap size={34} fill="currentColor" /><span>Avalisa</span></div>
          <h1>Welcome back</h1>
          <p>Sign in to your dashboard and keep your Pocket Option workflow synced.</p>

          <label><Mail size={15} /> Email<input type="email" required placeholder="you@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
          <label><Lock size={15} /> Password<input type="password" required placeholder="••••••••" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></label>

          <div className="lux-auth-options">
            <label><input type="checkbox" checked={form.remember} onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))} /> Remember me</label>
            <a href="mailto:avalisapobot@gmail.com?subject=Avalisa%20password%20reset%20help">Forgot password?</a>
          </div>

          <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          <div className="lux-auth-social-row">
            <button type="button" className="lux-auth-social">
              <span className="lux-auth-provider-icon is-google">G</span>
              Continue with Google
            </button>
            <button type="button" className="lux-auth-social">
              <span className="lux-auth-provider-icon is-facebook">f</span>
              Continue with Facebook
            </button>
          </div>
          <p className="lux-auth-switch">No account? <Link to="/register">Create Avalisa account</Link></p>
        </form>

        <aside className="lux-auth-visual lux-auth-visual--login">
          <img className="lux-auth-visual__scene" src="/images/landing/generated/avalisa-auth-scene-gemini.png" alt="Avalisa assistant dashboard scene" />
        </aside>
      </section>
    </main>
  );
}

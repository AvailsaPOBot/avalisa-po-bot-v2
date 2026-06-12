import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Gift, Lock, Mail, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { API_BASE } from '../lib/api';
import '../styles/luxury.css';

const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const authError = searchParams.get('authError');
    if (authError) toast.error(authError.replaceAll('_', ' '));
  }, [searchParams]);

  function startSocialAuth(provider) {
    window.location.href = `${API_BASE}/api/auth/oauth/${provider}?from=register`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error('Passwords do not match');
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');

    setLoading(true);
    try {
      await register(form.email, form.password);
      toast.success('Account created. Welcome to Avalisa.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="lux-auth-page">
      <section className="lux-auth-shell">
        <form className="lux-auth-card" onSubmit={handleSubmit}>
          <div className="lux-auth-brand"><img className="brand-signature brand-signature--auth" src="/images/brand/avalisa-signature-logo-gold.png" alt="Avalisa PO Bot" /></div>
          <h1>Create Avalisa account</h1>
          <p>Start with Demo and test Martingale mode before upgrading.</p>

          <a className="lux-auth-offer" href={AFFILIATE_LINK} target="_blank" rel="noreferrer">
            <Gift size={18} />
            <span>New to Pocket Option? Register through Avalisa to request Pro access.</span>
          </a>

          <label><Mail size={15} /> Email<input type="email" required placeholder="you@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
          <label><Lock size={15} /> Password<input type="password" required placeholder="Min 8 characters" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></label>
          <label><ShieldCheck size={15} /> Confirm password<input type="password" required placeholder="Repeat password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} /></label>

          <button type="submit" disabled={loading}>{loading ? 'Creating account...' : 'Create Avalisa Account'}</button>
          <div className="lux-auth-social-row">
            <button type="button" className="lux-auth-social" onClick={() => startSocialAuth('google')}>
              <span className="lux-auth-provider-icon is-google">G</span>
              Sign up with Google
            </button>
            <button type="button" className="lux-auth-social" onClick={() => startSocialAuth('facebook')}>
              <span className="lux-auth-provider-icon is-facebook">f</span>
              Sign up with Facebook
            </button>
          </div>
          <p className="lux-auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
        </form>

        <aside className="lux-auth-visual lux-auth-visual--register">
          <img className="lux-auth-visual__scene" src="/images/landing/webapp-redesign/hero-product-composite.png" alt="Avalisa PO Bot dashboard and mobile access" />
        </aside>
      </section>
    </main>
  );
}

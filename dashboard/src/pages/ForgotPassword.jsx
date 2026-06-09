import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import '../styles/luxury.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/forgot-password', { email });
      setSent(true);
      toast.success(data.message || 'If that email exists, a reset link has been sent.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="lux-auth-page">
      <section className="lux-auth-shell">
        <form className="lux-auth-card" onSubmit={handleSubmit}>
          <div className="lux-auth-brand"><img className="brand-signature brand-signature--auth" src="/images/brand/avalisa-signature-logo-gold.png" alt="Avalisa PO Bot" /></div>
          <h1>Reset your password</h1>
          {sent ? (
            <p>If an account exists for <strong>{email}</strong>, we've sent a reset link. Check your inbox (and spam). The link expires in 1 hour.</p>
          ) : (
            <>
              <p>Enter the email for your account and we'll send you a link to set a new password.</p>
              <label><Mail size={15} /> Email<input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send reset link'}</button>
            </>
          )}
          <p className="lux-auth-switch">Remembered it? <Link to="/login">Back to sign in</Link></p>
        </form>

        <aside className="lux-auth-visual lux-auth-visual--login">
          <img className="lux-auth-visual__scene" src="/images/landing/generated/avalisa-auth-scene-gemini.png" alt="Avalisa assistant dashboard scene" />
        </aside>
      </section>
    </main>
  );
}

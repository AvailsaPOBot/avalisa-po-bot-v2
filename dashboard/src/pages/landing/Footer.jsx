import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-shell landing-footer__grid">
        <div className="landing-footer__brand">
          <Link className="landing-footer__logo" to="/">
            Avalisa
          </Link>
          <p>trade on autopilot.</p>
        </div>

        <div className="landing-footer__column">
          <h3>Product</h3>
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Login</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>

        <div className="landing-footer__column">
          <h3>Resources</h3>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy</Link>
          {/* TODO: Replace placeholder text with the real Terms destination when available. */}
          <span className="landing-footer__muted">Terms</span>
        </div>

        <div className="landing-footer__column">
          <h3>Connect</h3>
          <a
            href="https://youtube.com/@avalisapobot?si=B0477eY_uwdHelIJ"
            target="_blank"
            rel="noreferrer"
          >
            YouTube
          </a>
          <a
            href="https://www.tiktok.com/@avalisa.po.bot?_r=1&_t=ZS-95AWsutNbgT"
            target="_blank"
            rel="noreferrer"
          >
            TikTok
          </a>
          <a
            href="https://www.facebook.com/share/1EGgzWbHv9/?mibextid=wwXIfr"
            target="_blank"
            rel="noreferrer"
          >
            Facebook
          </a>
          {/* TODO: Replace placeholder text with the real Telegram destination when available. */}
          <span className="landing-footer__muted">Telegram</span>
          <a href="mailto:AvalisaPOBot@gmail.com">Email</a>
        </div>
      </div>

      <div className="landing-footer__bottom">
        © 2026 Avalisa · Built for traders who want their time back.
      </div>
    </footer>
  );
}

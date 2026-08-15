import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../styles/luxury.css';

export default function NotFound() {
  return (
    <main className="lux-not-found">
      <section>
        <img
          className="brand-signature brand-signature--auth"
          src="/images/brand/avalisa-signature-logo-gold.png"
          alt="Avalisa PO Bot"
        />
        <p className="lux-kicker">404</p>
        <h1>That page is not available.</h1>
        <p>The link may be outdated, but Avalisa is ready from the home page.</p>
        <Link to="/"><ArrowLeft size={17} /> Back to Avalisa</Link>
      </section>
    </main>
  );
}

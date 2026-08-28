/**
 * A paying customer must never be sent to a dead checkout.
 *
 * History: the Whop product behind REACT_APP_WHOP_BASIC_URL was removed, so the
 * live pricing page sent buyers to Whop's "Product not found" page. The earlier
 * fallback (href="#") was no better — it looked live and silently did nothing.
 * The environment override was removed because it silently reintroduced dead URLs.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import Pricing from './pages/Pricing';

const LIVE_BASIC_CHECKOUT_URL = 'https://whop.com/avalisabot/products/basic-e9-52a3/';
const LIVE_PRO_CHECKOUT_URL = 'https://whop.com/avalisabot/products/pro-9d-c997/';

let mockLocation = { pathname: '/pricing', hash: '' };

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => mockLocation,
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('./lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { enabled: false } }), post: jest.fn() },
  API_BASE: 'https://test-api.example',
}));

jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

describe('checkout availability', () => {
  const OLD_ENV = process.env;
  beforeEach(() => { process.env = { ...OLD_ENV }; });
  afterAll(() => { process.env = OLD_ENV; });

  async function openWhopCheckout(planIndex) {
    const chooser = await screen.findAllByRole('button', { name: /choose payment method/i });
    fireEvent.click(chooser[planIndex]);
    return screen.findByRole('link', { name: /whop/i });
  }

  function expectNoRetiredCheckoutHrefs() {
    const hrefs = Array.from(document.querySelectorAll('a'))
      .map((link) => link.getAttribute('href') || '');
    hrefs.forEach((href) => {
      expect(href).not.toContain('basic-plan-7d-48b3');
      expect(href).not.toContain('lifetime-plan-df-e6c6');
    });
  }

  test('the Basic Whop checkout link equals the canonical live product URL', async () => {
    render(<Pricing />);
    expect(await openWhopCheckout(0)).toHaveAttribute('href', LIVE_BASIC_CHECKOUT_URL);
  });

  test('the Pro Whop checkout link equals the canonical live product URL', async () => {
    render(<Pricing />);
    expect(await openWhopCheckout(1)).toHaveAttribute('href', LIVE_PRO_CHECKOUT_URL);
  });

  test('a bogus Basic Whop environment value cannot override the rendered checkout', async () => {
    process.env.REACT_APP_WHOP_BASIC_URL = 'https://whop.com/avalisabot/basic-plan-7d-48b3/';
    render(<Pricing />);
    expect(await openWhopCheckout(0)).toHaveAttribute('href', LIVE_BASIC_CHECKOUT_URL);
  });

  test('no rendered pricing checkout href contains either retired Whop slug', async () => {
    render(<Pricing />);
    await openWhopCheckout(0);
    expectNoRetiredCheckoutHrefs();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await openWhopCheckout(1);
    expectNoRetiredCheckoutHrefs();
  });
});

describe('advertised billing options', () => {
  // Whop sells Pro at $119 once AND $29/month. The site showed only $119, so the
  // cheaper entry point was invisible — a silent conversion loss, not a bug anyone
  // would have reported.
  test('the Pro card advertises the monthly option', async () => {
    render(<Pricing />);
    expect(await screen.findByText(/\$29\s*\/\s*month/i)).toBeTruthy();
  });
});

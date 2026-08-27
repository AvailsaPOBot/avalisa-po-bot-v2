/**
 * A paying customer must never be sent to a dead checkout.
 *
 * History: the Whop product behind REACT_APP_WHOP_BASIC_URL was removed, so the
 * live pricing page sent buyers to Whop's "Product not found" page. The earlier
 * fallback (href="#") was no better — it looked live and silently did nothing.
 * When no checkout URL is configured the page must SAY so.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Pricing from './pages/Pricing';

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
  useAuth: () => ({ user: { email: 'customer@example.com', license: { plan: 'demo' } } }),
}));

describe('checkout availability', () => {
  const OLD_ENV = process.env;
  beforeEach(() => { process.env = { ...OLD_ENV }; });
  afterAll(() => { process.env = OLD_ENV; });

  test('with no Whop URL configured, no element links to a dead checkout', async () => {
    delete process.env.REACT_APP_WHOP_BASIC_URL;
    delete process.env.REACT_APP_WHOP_PRO_URL;
    delete process.env.REACT_APP_WHOP_LIFETIME_URL;

    render(<Pricing />);

    // The dead link lives INSIDE the payment modal, so it must be opened or this
    // test proves nothing. (First version of this test passed with the bug still
    // present, for exactly that reason.)
    const chooser = await screen.findAllByRole('button', { name: /choose payment method/i });
    fireEvent.click(chooser[0]);

    // The old bug: an anchor whose href is "#" - looks clickable, does nothing.
    await waitFor(() => {
      const deadLinks = Array.from(document.querySelectorAll('a'))
        .filter((a) => (a.getAttribute('href') || '').trim() === '#');
      expect(deadLinks).toHaveLength(0);
    });

    // And it must positively SAY it is unavailable, not just omit the link.
    expect(await screen.findByText(/whop checkout is temporarily unavailable/i)).toBeTruthy();
  });

  test('when a Whop URL IS configured the real link is used', async () => {
    process.env.REACT_APP_WHOP_BASIC_URL = 'https://whop.com/avalisabot/basic-live/';
    render(<Pricing />);

    // The plan card shows "Choose payment method" (a PayPal plan exists), so the
    // actual checkout link only appears once the modal is open.
    const chooser = await screen.findAllByRole('button', { name: /choose payment method/i });
    fireEvent.click(chooser[0]);

    await waitFor(() => {
      const live = Array.from(document.querySelectorAll('a'))
        .some((a) => (a.getAttribute('href') || '').includes('whop.com/avalisabot/basic-live'));
      expect(live).toBe(true);
    });
  });
});

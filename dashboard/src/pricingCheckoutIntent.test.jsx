import { fireEvent, render, screen } from '@testing-library/react';
import Pricing from './pages/Pricing';

let mockLocation = { pathname: '/pricing', hash: '', search: '' };

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => mockLocation,
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('./lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

function mockInitialRequests() {
  global.fetch = jest.fn().mockResolvedValue({ json: () => Promise.resolve({}) });
}

async function openBasicWhopCheckout() {
  render(<Pricing />);
  fireEvent.click((await screen.findAllByRole('button', { name: /choose payment method/i }))[0]);
  return screen.findByRole('link', { name: /whop/i });
}

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe('checkout intent analytics', () => {
  let originalSendBeacon;

  beforeEach(() => {
    mockLocation = { pathname: '/pricing', hash: '', search: '' };
    mockInitialRequests();
    originalSendBeacon = navigator.sendBeacon;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: originalSendBeacon });
  });

  test('clicking Basic Whop checkout sends exactly one basic checkout signal', async () => {
    const beacon = jest.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
    const checkout = await openBasicWhopCheckout();

    fireEvent.click(checkout);

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toMatch(/\/api\/funnel\/checkout-click$/);
    expect(await readBlob(beacon.mock.calls[0][1])).toBe('{"plan":"basic"}');
  });

  test('a throwing beacon leaves the checkout click unblocked', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: jest.fn(() => { throw new Error('beacon unavailable'); }),
    });
    const checkout = await openBasicWhopCheckout();

    expect(() => expect(fireEvent.click(checkout)).toBe(true)).not.toThrow();
  });
});

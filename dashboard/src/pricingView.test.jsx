import { render, screen } from '@testing-library/react';
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

describe('pricing view analytics', () => {
  let originalSendBeacon;
  let originalSessionStorageDescriptor;

  beforeEach(() => {
    mockLocation = { pathname: '/pricing', hash: '', search: '' };
    window.sessionStorage.clear();
    mockInitialRequests();
    originalSendBeacon = navigator.sendBeacon;
    originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: originalSendBeacon });
    if (originalSessionStorageDescriptor) {
      Object.defineProperty(window, 'sessionStorage', originalSessionStorageDescriptor);
    }
  });

  test('mounting Pricing fires the pricing-view beacon exactly once', () => {
    const beacon = jest.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });

    render(<Pricing />);

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toMatch(/\/api\/funnel\/pricing-view$/);
    expect(beacon.mock.calls[0]).toHaveLength(1);
  });

  test('mounting Pricing again in the same session sends nothing', () => {
    const beacon = jest.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });

    const firstMount = render(<Pricing />);
    firstMount.unmount();
    render(<Pricing />);

    expect(beacon).toHaveBeenCalledTimes(1);
  });

  test('blocked sessionStorage still leaves the pricing page rendered without throwing', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: jest.fn(() => { throw new Error('storage blocked'); }),
        setItem: jest.fn(() => { throw new Error('storage blocked'); }),
      },
    });
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: jest.fn(() => true) });

    expect(() => render(<Pricing />)).not.toThrow();
    expect(screen.getByRole('heading', { name: 'Simple, transparent pricing.' })).toBeInTheDocument();
  });
});

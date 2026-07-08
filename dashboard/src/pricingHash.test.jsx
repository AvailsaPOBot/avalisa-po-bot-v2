import { render, screen, waitFor } from '@testing-library/react';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';

let mockLocation = { pathname: '/pricing', hash: '' };

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => mockLocation,
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('./lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
  API_BASE: 'https://test-api.example',
}));

jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      email: 'customer@example.com',
      license: { plan: 'basic' },
    },
  }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.requestAnimationFrame = (callback) => callback();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
});

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView.mockClear();
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve({}),
  });
});

test.each([
  ['basic', 'Basic'],
  ['pro', 'Pro'],
])('pricing hash #%s scrolls the target plan card into view', async (hash, planName) => {
  mockLocation = { pathname: '/pricing', hash: `#${hash}` };

  render(<Pricing />);

  const targetCard = screen.getByText(planName).closest('article');
  expect(targetCard).toHaveAttribute('id', hash);

  await waitFor(() => {
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });
});

test('pricing page marks the active customer plan accessibly', () => {
  mockLocation = { pathname: '/pricing', hash: '#basic' };

  render(<Pricing />);

  expect(screen.getByText('Basic').closest('article')).toHaveAttribute('aria-current', 'true');
});

test('landing pricing CTAs keep routing to pricing plan anchors', () => {
  render(<Landing />);

  expect(screen.getByRole('link', { name: 'View Basic' })).toHaveAttribute('href', '/pricing#basic');
  expect(screen.getByRole('link', { name: 'View Pro' })).toHaveAttribute('href', '/pricing#pro');
});

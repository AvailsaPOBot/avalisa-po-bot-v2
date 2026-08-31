import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import Navbar from './components/Navbar';
import { AFFILIATE_LINK } from './lib/affiliate';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import Register from './pages/Register';
import api from './lib/api';

let mockUser = null;

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ pathname: '/pricing', hash: '', search: '' }),
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams()],
}), { virtual: true });

jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn(), register: jest.fn() }),
}));

jest.mock('./lib/api', () => ({
  __esModule: true,
  API_BASE: 'https://test-api.example',
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('./lib/useLenis', () => ({ useLenis: jest.fn() }));

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath];
  });
}

function expectAffiliateHref(link) {
  expect(link).toHaveAttribute('href', AFFILIATE_LINK);
}

beforeEach(() => {
  mockUser = null;
  api.get.mockReset();
  global.fetch = jest.fn().mockResolvedValue({ json: async () => ({}) });
});

test('affiliate URL literal appears exactly once across dashboard source', () => {
  const sourceDirectory = path.join(__dirname);
  const occurrences = sourceFiles(sourceDirectory)
    .filter((file) => /\.(js|jsx)$/.test(file))
    .flatMap((file) => fs.readFileSync(file, 'utf8').match(/u3\.shortink\.io/g) || []);

  expect(occurrences).toHaveLength(1);
});

test('every dashboard affiliate consumer resolves the shared URL', async () => {
  const { unmount: unmountRegister } = render(<Register />);
  expectAffiliateHref(screen.getByRole('link', { name: /register through avalisa/i }));
  unmountRegister();

  const { unmount: unmountPricing } = render(<Pricing />);
  (await screen.findAllByRole('link', { name: /open pocket option/i }))
    .forEach(expectAffiliateHref);
  unmountPricing();

  const { unmount: unmountLanding } = render(<Landing />);
  expectAffiliateHref(screen.getByRole('link', { name: /open pocket option/i }));
  unmountLanding();

  const { unmount: unmountNavbar } = render(<Navbar />);
  expectAffiliateHref(screen.getByRole('link', { name: 'Pocket Option' }));
  unmountNavbar();

  mockUser = { email: 'trader@example.com', license: { plan: 'free' } };
  api.get.mockImplementation((url) => {
    if (url === '/api/license/claim/status') {
      return Promise.resolve({ data: { claimStatus: 'rejected' } });
    }
    if (url === '/api/settings') return Promise.resolve({ data: {} });
    if (url.startsWith('/api/trades/history')) return Promise.resolve({ data: { trades: [], stats: {} } });
    return Promise.resolve({ data: {} });
  });
  render(<Dashboard />);
  expectAffiliateHref(await screen.findByRole('link', { name: 'Register' }));
});

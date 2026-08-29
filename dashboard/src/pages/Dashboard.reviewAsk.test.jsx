import { fireEvent, render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';
import api from '../lib/api';

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useSearchParams: () => [new URLSearchParams()],
}), { virtual: true });

jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'trader@example.com', license: { plan: 'basic' } } }),
}));

const SETTINGS = {
  strategy: 'martingale',
  timeframe: 'M1',
  direction: 'alternating',
  delaySeconds: 2,
  startAmount: 1,
  martingaleMultiplier: 2,
  martingaleSteps: 3,
};

const reviewCard = () => screen.queryByTestId('review-ask-card');

function mockDashboardRequests(stats) {
  api.get.mockImplementation((url) => {
    if (url === '/api/settings') return Promise.resolve({ data: SETTINGS });
    if (url.startsWith('/api/trades/history?type=real&limit=500')) return Promise.resolve({ data: { stats } });
    if (url.startsWith('/api/trades/history?')) return Promise.resolve({ data: { trades: [] } });
    return Promise.resolve({ data: {} });
  });
}

async function renderDashboard(stats) {
  mockDashboardRequests(stats);
  render(<Dashboard />);
  await screen.findByText('Save Settings');
}

beforeEach(() => {
  api.get.mockReset();
  window.localStorage.clear();
});

test('does not show the review ask with 7 completed trades', async () => {
  await renderDashboard({ wins: 4, losses: 2, ties: 1, winRate: 55, totalProfit: 10 });

  expect(reviewCard()).not.toBeInTheDocument();
});

test('shows the review ask with 8 completed trades — reachable inside the 10-trade demo cap', async () => {
  await renderDashboard({ wins: 4, losses: 3, ties: 1, winRate: 55, totalProfit: 10 });

  expect(reviewCard()).toBeInTheDocument();
});

test('dismissing the review ask hides it and persists the completed flag', async () => {
  await renderDashboard({ wins: 8, losses: 0, ties: 0, winRate: 100, totalProfit: 10 });

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

  expect(reviewCard()).not.toBeInTheDocument();
  expect(window.localStorage.getItem('avalisa-review-ask-complete')).toBe('true');
});

test('does not show the review ask when it was already completed, even at 500 trades', async () => {
  window.localStorage.setItem('avalisa-review-ask-complete', 'true');

  await renderDashboard({ wins: 250, losses: 240, ties: 10, winRate: 51, totalProfit: 10 });

  expect(reviewCard()).not.toBeInTheDocument();
});

test('continues to render when localStorage throws on read and write', async () => {
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: jest.fn(() => { throw new Error('storage unavailable'); }),
      setItem: jest.fn(() => { throw new Error('storage unavailable'); }),
      clear: jest.fn(() => { throw new Error('storage unavailable'); }),
    },
  });

  try {
    await renderDashboard({ wins: 8, losses: 0, ties: 0, winRate: 100, totalProfit: 10 });
    expect(screen.getByText('Save Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(reviewCard()).not.toBeInTheDocument();
  } finally {
    Object.defineProperty(window, 'localStorage', localStorageDescriptor);
  }
});

test('review ask copy contains no incentive language', async () => {
  await renderDashboard({ wins: 8, losses: 0, ties: 0, winRate: 100, totalProfit: 10 });

  expect(reviewCard()).not.toHaveTextContent(/free|discount|unlock|reward|bonus|pro plan/i);
});

// THE TEST THAT WOULD HAVE CAUGHT THE ORIGINAL BUG.
// The ask was set at 20 completed trades while the Demo plan caps at 10 for the LIFETIME of
// the account, so no free user could ever see it — and with only a handful of paid accounts,
// that meant essentially nobody. It tested green and could not fire. This asserts the
// RELATIONSHIP rather than the number: the threshold must stay reachable inside the free tier.
test('the review-ask threshold is reachable within the demo trade cap', async () => {
  const DEMO_TRADE_CAP = 10; // backend/src/lib/plans.js -> PLAN_ENTITLEMENTS[DEMO].tradesLimit

  // One below the cap must already qualify, so a free user meets it before hitting the wall.
  await renderDashboard({ wins: DEMO_TRADE_CAP - 1, losses: 0, ties: 0, winRate: 100, totalProfit: 1 });
  expect(reviewCard()).toBeInTheDocument();
});

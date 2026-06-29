import { render, screen, waitFor } from '@testing-library/react';
import Pricing from './pages/Pricing';

let mockCurrentHash = '';
let mockUser = null;

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ pathname: '/pricing', hash: mockCurrentHash }),
}), { virtual: true });

jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const renderPricing = () => render(<Pricing />);

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({}) }));
  window.requestAnimationFrame = jest.fn((callback) => {
    callback();
    return 1;
  });
  window.cancelAnimationFrame = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
  mockCurrentHash = '';
  mockUser = null;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('scrolls to pricing plan from a deep link hash', async () => {
  mockCurrentHash = '#pro';
  renderPricing();

  const proCard = screen.getByRole('heading', { name: /\$119/i }).closest('article');

  await waitFor(() => {
    expect(proCard).toHaveClass('is-targeted');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });
});

test('keeps current plan accessibility separate from hash targeting', () => {
  mockUser = { license: { plan: 'basic' } };
  mockCurrentHash = '#pro';

  renderPricing();

  const basicCard = screen.getByRole('heading', { name: /\$69/i }).closest('article');
  const proCard = screen.getByRole('heading', { name: /\$119/i }).closest('article');

  expect(basicCard).toHaveAttribute('aria-current', 'true');
  expect(basicCard).not.toHaveClass('is-targeted');
  expect(proCard).toHaveClass('is-targeted');
  expect(proCard).not.toHaveAttribute('aria-current');
});

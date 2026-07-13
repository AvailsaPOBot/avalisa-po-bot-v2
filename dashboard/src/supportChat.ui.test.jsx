import { fireEvent, render, screen } from '@testing-library/react';
import FloatingChat from './components/FloatingChat';
import api from './lib/api';
import Support from './pages/Support';

jest.mock('./lib/api', () => ({
  post: jest.fn(),
}));

const escalationResponse = {
  data: {
    reply: 'Thanks for telling us. This needs human review, so please email avalisapobot@gmail.com.',
    provider: 'avalisa-escalation',
    escalate: true,
  },
};

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  api.post.mockReset();
  api.post.mockResolvedValue(escalationResponse);
});

test('support page labels sensitive support replies as human follow-up', async () => {
  render(<Support />);

  fireEvent.change(screen.getByPlaceholderText(/ask about setup/i), {
    target: { value: 'I want a refund' },
  });
  fireEvent.click(screen.getByLabelText(/send message/i));

  expect(await screen.findByText('Human follow-up needed')).toBeInTheDocument();
  expect(screen.getByText(/please email avalisapobot@gmail.com/i)).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/api/support/chat', expect.objectContaining({
    messages: expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'I want a refund' }),
    ]),
  }));
});

test('floating chat labels sensitive support replies as human follow-up', async () => {
  render(<FloatingChat />);

  fireEvent.click(screen.getByLabelText(/ask avalisa/i));
  fireEvent.change(screen.getByPlaceholderText(/ask anything about avalisa/i), {
    target: { value: 'Is this a scam?' },
  });
  fireEvent.click(screen.getByLabelText(/send message/i));

  expect(await screen.findByText('Human follow-up needed')).toBeInTheDocument();
  expect(screen.getByText(/please email avalisapobot@gmail.com/i)).toBeInTheDocument();
});

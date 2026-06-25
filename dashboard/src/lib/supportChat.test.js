import { HUMAN_FOLLOW_UP_LABEL, createAssistantMessage } from './supportChat';

test('support chat marks sensitive escalation replies for human follow-up', () => {
  const message = createAssistantMessage({
    reply: 'Please email avalisapobot@gmail.com so a human can follow up.',
    provider: 'avalisa-escalation',
    escalate: true,
  });

  expect(HUMAN_FOLLOW_UP_LABEL).toBe('Human follow-up needed');
  expect(message).toEqual({
    role: 'assistant',
    content: 'Please email avalisapobot@gmail.com so a human can follow up.',
    escalation: true,
    provider: 'avalisa-escalation',
  });
});

test('support chat keeps ordinary provider replies unmarked', () => {
  expect(createAssistantMessage({
    reply: 'Install the Chrome extension, then open Pocket Option in Chrome.',
    provider: 'gemini',
  })).toEqual({
    role: 'assistant',
    content: 'Install the Chrome extension, then open Pocket Option in Chrome.',
    escalation: false,
    provider: 'gemini',
  });
});

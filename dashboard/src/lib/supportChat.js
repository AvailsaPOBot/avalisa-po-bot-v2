export const HUMAN_FOLLOW_UP_LABEL = 'Human follow-up needed';

export function createAssistantMessage(data = {}) {
  return {
    role: 'assistant',
    content: String(data.reply || '').trim(),
    escalation: Boolean(data.escalate),
    provider: data.provider || null,
  };
}

const test = require('node:test');
const assert = require('node:assert/strict');

const supportRouter = require('../src/routes/support');

const { getSensitiveSupportEscalation, HUMAN_FOLLOW_UP_REPLY } = supportRouter.__test;

test('sensitive support complaints are routed to human follow-up before provider use', () => {
  const sensitivePrompts = [
    'I want a refund because this did not work for me',
    'Is Avalisa a scam?',
    'I lost money using the bot',
    'Please delete my account',
    'I will do a chargeback',
    'This feels fraudulent and I need legal help',
  ];

  for (const prompt of sensitivePrompts) {
    assert.equal(
      getSensitiveSupportEscalation([{ role: 'user', content: prompt }]),
      HUMAN_FOLLOW_UP_REPLY,
      prompt
    );
  }
});

test('ordinary setup and pricing questions still go to the AI support provider', () => {
  const ordinaryPrompts = [
    'How do I install the Chrome extension?',
    'What is included in the Basic plan?',
    'Where do I find my Pocket Option ID?',
  ];

  for (const prompt of ordinaryPrompts) {
    assert.equal(
      getSensitiveSupportEscalation([{ role: 'user', content: prompt }]),
      null,
      prompt
    );
  }
});


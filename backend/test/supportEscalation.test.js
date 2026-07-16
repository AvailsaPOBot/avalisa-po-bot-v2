const test = require('node:test');
const assert = require('node:assert/strict');

const supportRouter = require('../src/routes/support');

const { getSensitiveSupportEscalation, HUMAN_FOLLOW_UP_REPLY } = supportRouter.__test;

test('sensitive support complaints are routed to human follow-up before provider use', () => {
  const sensitivePrompts = [
    'I want a refund because this did not work for me',
    'Is Avalisa a scam?',
    'I lost money using the bot',
    'I lost $500 using the bot',
    'I lost 500 dollars after starting real mode',
    'I lost my deposit today',
    'This blew up my account',
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

test('human follow-up reply asks for useful support evidence without unsafe claims or private contacts', () => {
  assert.match(HUMAN_FOLLOW_UP_REPLY, /avalisapobot@gmail\.com/);
  assert.match(HUMAN_FOLLOW_UP_REPLY, /Avalisa account email/);
  assert.match(HUMAN_FOLLOW_UP_REPLY, /Pocket Option ID/);
  assert.match(HUMAN_FOLLOW_UP_REPLY, /screenshot or short screen recording/);
  assert.match(HUMAN_FOLLOW_UP_REPLY, /human from Avalisa will follow up/i);

  assert.doesNotMatch(HUMAN_FOLLOW_UP_REPLY, /oil4121|whatsapp|phone|private/i);
  assert.doesNotMatch(HUMAN_FOLLOW_UP_REPLY, /guarantee|guaranteed|risk[- ]?free|profit|income/i);
});

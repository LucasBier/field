import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverPublicSignals } from '../lib/zuri-discovery';
const now = Date.parse('2026-09-09T10:00:00Z');
const event = {
  sourcePlatform: 'x',
  postType: 'post',
  tweetId: '123',
  handle: 'criterion',
  text: 'A new film collection.',
  url: 'https://x.com/criterion/status/123',
  createdAtMs: now - 1000,
  metadata: { secret: 'must not be copied' },
};
await test('discovery copies only public fields and requires editorial verification', () => {
  const [s] = discoverPublicSignals(
    { events: [event, event], privateState: 'SECRET' },
    now,
  );
  assert.equal(
    discoverPublicSignals({ events: [event, event] }, now).length,
    1,
  );
  assert.deepEqual(s.interests, ['film']);
  assert.equal(s.certainty, 'unverified');
  assert.ok(!JSON.stringify(s).includes('secret'));
  assert.ok(!JSON.stringify(s).includes('privateState'));
});
await test('discovery rejects stale, future, duplicate, private, malformed and unrelated sources', () => {
  const changes = [
    { createdAtMs: now - 86400001 },
    { createdAtMs: now + 61000 },
    { duplicate: true },
    { sourcePlatform: 'dm' },
    { postType: 'reply' },
    { url: 'https://evil.example/123' },
    { tweetId: 123 },
    { text: 'Buy now: a film token launch!' },
    {
      text: 'ordinary unrelated text',
      handle: 'unrelated',
      url: 'https://x.com/unrelated/status/123',
    },
    { createdAtMs: NaN },
  ];
  for (const change of changes)
    assert.deepEqual(
      discoverPublicSignals({ events: [{ ...event, ...change }] }, now),
      [],
    );
  assert.throws(() =>
    discoverPublicSignals({ events: Array(501).fill(event) }, now),
  );
});

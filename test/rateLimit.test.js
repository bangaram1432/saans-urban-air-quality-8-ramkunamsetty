import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../lib/rateLimit.js';

test('blocks after the limit and recovers when the window resets', () => {
  let t = 0;
  const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
  assert.ok(rl.check('a').allowed);
  assert.ok(rl.check('a').allowed);
  const blocked = rl.check('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.ok(rl.check('b').allowed, 'other clients are unaffected');
  t = 1001;
  assert.ok(rl.check('a').allowed);
});

test('memory stays bounded', () => {
  const rl = createRateLimiter({ limit: 1, maxKeys: 10, now: () => 0 });
  for (let i = 0; i < 1000; i += 1) rl.check(`ip-${i}`);
  assert.ok(rl.check('fresh').allowed);
});

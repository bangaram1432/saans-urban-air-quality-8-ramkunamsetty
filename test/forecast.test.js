import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanestWindow } from '../lib/forecast.js';

const times = Array.from({ length: 6 }, (_, i) => `2026-11-22T${String(10 + i).padStart(2, '0')}:00`);

test('picks the cleanest consecutive window after "now"', () => {
  const w = cleanestWindow(times, [90, 80, 40, 30, 70, 100], '2026-11-22T10:15');
  assert.deepEqual(w, { start: '2026-11-22T12:00', hours: 2, avgPm25: 35 });
});

test('ignores past hours', () => {
  const w = cleanestWindow(times, [1, 1, 50, 60, 70, 80], '2026-11-22T12:00');
  assert.equal(w.start, '2026-11-22T12:00');
});

test('returns null for bad or insufficient data', () => {
  assert.equal(cleanestWindow(null, [], 'x'), null);
  assert.equal(cleanestWindow(times, [1, 2], '2026-11-22T10:00'), null);
  assert.equal(cleanestWindow(times, [1, 2, 3, 4, 5, 6], '2027-01-01T00:00'), null);
  assert.equal(cleanestWindow(times, [null, null, null, null, null, null], '2026-11-22T10:00'), null);
});

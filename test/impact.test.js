import test from 'node:test';
import assert from 'node:assert/strict';
import { cigaretteEquivalent, estimateExposure, reductionPct, weeklyCo2SavedBySwitch } from '../lib/impact.js';
import { baseProfile } from './helpers.js';

test('exposure falls monotonically as protective actions are added', () => {
  const p = { ...baseProfile, commute: 'two_wheeler', commuteMinutes: 60, exercise: 'outdoor' };
  const none = estimateExposure(150, p);
  const sealed = estimateExposure(150, p, { sealWindows: true });
  const both = estimateExposure(150, p, { sealWindows: true, usePurifier: true });
  const all = estimateExposure(150, p, { sealWindows: true, usePurifier: true, wearMask: true, exerciseIndoors: true });
  assert.ok(none > sealed && sealed > both && both > all);
});

test('exposure scales linearly with PM2.5 and is zero in clean air', () => {
  const p = { ...baseProfile, commute: 'car', commuteMinutes: 45 };
  assert.equal(estimateExposure(0, p), 0);
  assert.ok(Math.abs(estimateExposure(200, p) - 2 * estimateExposure(100, p)) < 0.2);
});

test('masks do not change a car commute (no open-air exposure to filter)', () => {
  const p = { ...baseProfile, commute: 'car', commuteMinutes: 60 };
  assert.equal(estimateExposure(100, p, { wearMask: true }), estimateExposure(100, p));
});

test('work-from-home ignores commute minutes', () => {
  assert.equal(estimateExposure(100, { ...baseProfile, commuteMinutes: 200 }), estimateExposure(100, baseProfile));
});

test('reductionPct handles edge cases', () => {
  assert.equal(reductionPct(100, 25), 75);
  assert.equal(reductionPct(0, 0), 0);
  assert.equal(reductionPct(50, 80), 0);
});

test('cigaretteEquivalent follows the 22 µg/m³ ≈ 1 cigarette rule', () => {
  assert.equal(cigaretteEquivalent(22), 1);
  assert.equal(cigaretteEquivalent(220), 10);
  assert.equal(cigaretteEquivalent(44, 12), 1);
});

test('CO2 saving only applies to vehicles that emit more than transit', () => {
  assert.ok(weeklyCo2SavedBySwitch({ commute: 'car', commuteMinutes: 60 }) > 0);
  assert.equal(weeklyCo2SavedBySwitch({ commute: 'walk', commuteMinutes: 60 }), 0);
  assert.equal(weeklyCo2SavedBySwitch({ commute: 'wfh', commuteMinutes: 0 }), 0);
});

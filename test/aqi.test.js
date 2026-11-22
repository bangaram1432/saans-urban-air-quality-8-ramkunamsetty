import test from 'node:test';
import assert from 'node:assert/strict';
import { categorize, pm25ToAqi } from '../lib/aqi.js';

test('pm25ToAqi hits every EPA breakpoint boundary', () => {
  const cases = [[0, 0], [9.0, 50], [9.1, 51], [35.4, 100], [35.5, 101], [55.4, 150],
    [55.5, 151], [125.4, 200], [125.5, 201], [225.4, 300], [225.5, 301], [325.4, 500]];
  for (const [pm, aqi] of cases) assert.equal(pm25ToAqi(pm), aqi, `pm2.5=${pm}`);
});

test('pm25ToAqi interpolates and clamps', () => {
  assert.equal(pm25ToAqi(12), 56);
  assert.equal(pm25ToAqi(9.05), 50, 'truncates to 0.1 µg/m³ like EPA');
  assert.equal(pm25ToAqi(999), 500);
});

test('pm25ToAqi rejects invalid input', () => {
  for (const bad of [-1, NaN, Infinity, '12', null, undefined]) assert.throws(() => pm25ToAqi(bad), RangeError);
});

test('categorize maps AQI to the right level', () => {
  assert.equal(categorize(0).id, 'good');
  assert.equal(categorize(50).id, 'good');
  assert.equal(categorize(51).id, 'moderate');
  assert.equal(categorize(212).id, 'very-unhealthy');
  assert.equal(categorize(301).level, 5);
  assert.equal(categorize(9999).id, 'hazardous');
  assert.throws(() => categorize(-5), RangeError);
});

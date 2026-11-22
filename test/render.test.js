import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHour, gaugePosition } from '../public/js/render.js';

test('gaugePosition maps six equal-width bands and clamps', () => {
  assert.equal(gaugePosition(0), 0);
  assert.equal(gaugePosition(50), 16.7);
  assert.equal(gaugePosition(100), 33.3);
  assert.equal(gaugePosition(500), 100);
  assert.equal(gaugePosition(-20), 0);
  assert.equal(gaugePosition(9999), 100);
  assert.equal(gaugePosition('abc'), 0);
});

test('formatHour produces friendly 12-hour labels', () => {
  assert.equal(formatHour('2026-11-22T00:00'), '12 am');
  assert.equal(formatHour('2026-11-22T12:00'), '12 pm');
  assert.equal(formatHour('2026-11-22T15:00', '2026-11-22T10:00'), '3 pm');
  assert.equal(formatHour('2026-11-23T05:00', '2026-11-22T10:00'), '5 am tomorrow');
  assert.equal(formatHour('garbage'), '');
});

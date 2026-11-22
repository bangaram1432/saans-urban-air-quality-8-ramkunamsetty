import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../lib/http.js';
import { cleanText, validateAdviceRequest } from '../lib/validate.js';

const errorsFor = (input) => {
  try { validateAdviceRequest(input); } catch (e) { assert.ok(e instanceof HttpError); return e.details.map((d) => d.field); }
  return [];
};

test('accepts a minimal request and applies safe defaults', () => {
  const v = validateAdviceRequest({ pm25: 80 });
  assert.equal(v.commute, 'wfh');
  assert.equal(v.cooking, 'lpg');
  assert.equal(v.children, false);
  assert.equal(v.question, '');
});

test('drops unknown fields (mass-assignment safe)', () => {
  const v = validateAdviceRequest({ pm25: 80, isAdmin: true, __proto__: { x: 1 } });
  assert.ok(!('isAdmin' in v));
});

test('rejects bad pm25 values', () => {
  for (const pm25 of [undefined, '80', -1, 1001, NaN, null]) assert.deepEqual(errorsFor({ pm25 }), ['pm25']);
});

test('rejects invalid enums, flags and minutes with field-level errors', () => {
  assert.deepEqual(errorsFor({ pm25: 1, commute: 'rocket' }), ['commute']);
  assert.deepEqual(errorsFor({ pm25: 1, children: 'yes' }), ['children']);
  assert.deepEqual(errorsFor({ pm25: 1, commuteMinutes: 1.5 }), ['commuteMinutes']);
  assert.deepEqual(errorsFor({ pm25: 1, commuteMinutes: 999 }), ['commuteMinutes']);
});

test('free text is cleaned and length-limited', () => {
  assert.equal(cleanText('  hi\u0000\n\tthere  '), 'hi there');
  assert.equal(validateAdviceRequest({ pm25: 1, question: 'a\u0007b\n\nc' }).question, 'a b c');
  assert.deepEqual(errorsFor({ pm25: 1, question: 'x'.repeat(301) }), ['question']);
  assert.deepEqual(errorsFor({ pm25: 1, city: 42 }), ['city']);
});

test('work-from-home forces commute minutes to zero', () => {
  assert.equal(validateAdviceRequest({ pm25: 1, commute: 'wfh', commuteMinutes: 60 }).commuteMinutes, 0);
});

test('non-object input is rejected cleanly', () => {
  for (const bad of [null, undefined, 5, 'x']) assert.deepEqual(errorsFor(bad), bad == null ? ['pm25'] : ['pm25']);
});

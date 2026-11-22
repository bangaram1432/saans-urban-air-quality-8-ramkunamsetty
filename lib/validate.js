/**
 * Allow-list validation for the advice request. Anything not explicitly
 * recognised is dropped; anything malformed is rejected with a field-level
 * message the UI can show next to the right control.
 */
import { HttpError } from './http.js';

export const COMMUTES = Object.freeze(['wfh', 'walk', 'cycle', 'two_wheeler', 'car', 'transit']);
export const COOKING = Object.freeze(['lpg', 'induction', 'biomass']);
export const HEATING = Object.freeze(['none', 'electric', 'biomass']);
export const EXERCISE = Object.freeze(['none', 'outdoor', 'indoor']);
const FLAGS = Object.freeze(['children', 'elderly', 'pregnant', 'respiratory', 'hasPurifier']);

export const LIMITS = Object.freeze({ pm25Max: 1000, commuteMax: 240, cityMax: 80, questionMax: 300 });

/** Removes control characters, collapses whitespace, trims. */
export function cleanText(value) {
  return value.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function validateAdviceRequest(raw) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const input = raw ?? {};

  const pm25 = input.pm25;
  if (typeof pm25 !== 'number' || !Number.isFinite(pm25) || pm25 < 0 || pm25 > LIMITS.pm25Max) {
    fail('pm25', `PM2.5 must be a number between 0 and ${LIMITS.pm25Max}`);
  }

  const value = { pm25 };

  for (const flag of FLAGS) {
    if (input[flag] !== undefined && typeof input[flag] !== 'boolean') fail(flag, 'Must be true or false');
    value[flag] = input[flag] === true;
  }

  const enums = [
    ['commute', COMMUTES, 'wfh'],
    ['cooking', COOKING, 'lpg'],
    ['heating', HEATING, 'none'],
    ['exercise', EXERCISE, 'none'],
  ];
  for (const [field, allowed, fallback] of enums) {
    const v = input[field] ?? fallback;
    if (!allowed.includes(v)) fail(field, `Must be one of: ${allowed.join(', ')}`);
    value[field] = v;
  }

  const minutes = input.commuteMinutes ?? 0;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > LIMITS.commuteMax) {
    fail('commuteMinutes', `Must be a whole number between 0 and ${LIMITS.commuteMax}`);
  }
  value.commuteMinutes = value.commute === 'wfh' ? 0 : minutes;

  for (const [field, max] of [['city', LIMITS.cityMax], ['question', LIMITS.questionMax]]) {
    const v = input[field];
    if (v === undefined || v === null || v === '') {
      value[field] = '';
    } else if (typeof v !== 'string') {
      fail(field, 'Must be text');
    } else {
      const cleaned = cleanText(v);
      if (cleaned.length > max) fail(field, `Must be at most ${max} characters`);
      value[field] = cleaned;
    }
  }

  if (errors.length > 0) throw new HttpError(400, 'Some answers need fixing', errors);
  return value;
}

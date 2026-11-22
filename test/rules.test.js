import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvice, summarize } from '../lib/rules.js';
import { baseProfile } from './helpers.js';

const ids = (advice) => advice.recommendations.map((r) => r.id);

test('clean air: encourages ventilation, no alarming advice', () => {
  const a = buildAdvice({ ...baseProfile, pm25: 5, exercise: 'outdoor' });
  assert.equal(a.category.id, 'good');
  assert.ok(ids(a).includes('ventilate-now'));
  assert.ok(ids(a).includes('exercise-outdoors-ok'));
  assert.ok(!ids(a).includes('seal-windows'));
});

test('severe smog: seals windows, moves exercise indoors, masks two-wheeler commute', () => {
  const a = buildAdvice({ ...baseProfile, pm25: 200, exercise: 'outdoor', commute: 'two_wheeler', commuteMinutes: 40 });
  for (const id of ['seal-windows', 'exercise-indoors', 'commute-mask']) assert.ok(ids(a).includes(id), id);
  assert.ok(!ids(a).includes('ventilate-now'));
  assert.ok(a.exposure.withPlan < a.exposure.baseline);
  assert.ok(a.exposure.reductionPct > 25, `got ${a.exposure.reductionPct}%`);
});

test('sensitive households get stricter advice at the same PM2.5', () => {
  const general = buildAdvice({ ...baseProfile, pm25: 30 });
  const kids = buildAdvice({ ...baseProfile, pm25: 30, children: true });
  assert.ok(!ids(general).includes('children'));
  assert.ok(ids(kids).includes('children'));
  assert.equal(kids.sensitiveHousehold, true);
});

test('respiratory condition triggers care-plan advice without dosing instructions', () => {
  const a = buildAdvice({ ...baseProfile, pm25: 80, respiratory: true });
  const rec = a.recommendations.find((r) => r.id === 'sensitive-care');
  assert.ok(rec);
  assert.ok(!/\d+\s?(mg|mcg|puffs?)/i.test(rec.action));
});

test('owned purifier counts toward the plan; DIY option is shown but optional', () => {
  const own = buildAdvice({ ...baseProfile, pm25: 160, hasPurifier: true });
  const diy = buildAdvice({ ...baseProfile, pm25: 160 });
  assert.ok(ids(own).includes('purifier-use'));
  const diyRec = diy.recommendations.find((r) => r.id === 'purifier-diy');
  assert.equal(diyRec.optional, true);
  assert.ok(own.exposure.withPlan < diy.exposure.withPlan, 'optional DIY purifier is not counted in the plan');
});

test('biomass fuel is flagged as a top-priority alternative', () => {
  const a = buildAdvice({ ...baseProfile, pm25: 120, cooking: 'biomass', heating: 'biomass' });
  const top = a.recommendations.filter((r) => r.priority === 1).map((r) => r.id);
  assert.ok(top.includes('cooking-clean-fuel'));
  assert.ok(top.includes('heating-no-burning'));
});

test('car commuters get a CO2-quantified switch suggestion', () => {
  const a = buildAdvice({ ...baseProfile, pm25: 60, commute: 'car', commuteMinutes: 60 });
  const rec = a.recommendations.find((r) => r.id === 'commute-switch');
  assert.match(rec.impact, /kg of CO₂e per week/);
});

test('every recommendation is complete and sorted by priority', () => {
  const a = buildAdvice({ ...baseProfile, pm25: 300, children: true, elderly: true, commute: 'car', commuteMinutes: 90,
    cooking: 'biomass', heating: 'biomass', exercise: 'outdoor' });
  assert.ok(a.recommendations.length > 0 && a.recommendations.length <= 10);
  for (const r of a.recommendations) {
    for (const k of ['id', 'category', 'title', 'action', 'why', 'impact']) assert.ok(r[k], `${r.id}.${k}`);
    assert.ok(['routine', 'indoor', 'health', 'alternative'].includes(r.category));
  }
  const priorities = a.recommendations.map((r) => r.priority);
  assert.deepEqual(priorities, [...priorities].sort((x, y) => x - y));
});

test('engine is deterministic and does not mutate its input', () => {
  const input = Object.freeze({ ...baseProfile, pm25: 99 });
  assert.deepEqual(buildAdvice(input), buildAdvice(input));
});

test('summary is plain language and quotes the numbers', () => {
  const s = summarize(buildAdvice({ ...baseProfile, pm25: 220, commute: 'cycle', commuteMinutes: 30 }));
  assert.match(s, /air quality index is \d+/);
  assert.match(s, /cigarettes/);
  assert.match(s, /µg\/m³/);
});

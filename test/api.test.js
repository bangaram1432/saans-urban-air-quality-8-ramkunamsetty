import test from 'node:test';
import assert from 'node:assert/strict';
import advice from '../api/advice.js';
import geocode from '../api/geocode.js';
import airQuality from '../api/air-quality.js';
import { createApi } from '../lib/http.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { call, mockReq } from './helpers.js';

delete process.env.GEMINI_API_KEY;

const withFetch = async (impl, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
};
const jsonFetch = (payload, ok = true) => async () => ({ ok, json: async () => payload });

test('POST /api/advice returns a complete plan in rules-only mode', async () => {
  const r = await call(advice, mockReq({ method: 'POST', body: { pm25: 180, children: true, commute: 'cycle', commuteMinutes: 30 } }));
  assert.equal(r.status, 200);
  assert.equal(r.json.aiSource, 'rules');
  assert.equal(r.json.aiNote, null);
  assert.ok(r.json.summary.length > 20);
  assert.ok(r.json.recommendations.length > 0);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('advice: wrong method, wrong content type, bad JSON and bad fields', async () => {
  assert.equal((await call(advice, mockReq({ method: 'GET' }))).status, 405);
  assert.equal((await call(advice, mockReq({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: {} }))).status, 415);
  assert.equal((await call(advice, mockReq({ method: 'POST', body: '{not json' }))).status, 400);
  assert.equal((await call(advice, mockReq({ method: 'POST', body: [1, 2] }))).status, 400);
  const bad = await call(advice, mockReq({ method: 'POST', body: { pm25: -4 } }));
  assert.equal(bad.status, 400);
  assert.equal(bad.json.details[0].field, 'pm25');
});

test('advice: oversized bodies are rejected with 413', async () => {
  const r = await call(advice, mockReq({ method: 'POST', body: { pm25: 10, question: 'x'.repeat(6000) } }));
  assert.equal(r.status, 413);
});

test('rate limiting returns 429 with Retry-After', async () => {
  const handler = createApi({ methods: ['GET'], limiter: createRateLimiter({ limit: 1 }), handler: async () => ({ body: { ok: true } }) });
  assert.equal((await call(handler, mockReq())).status, 200);
  const blocked = await call(handler, mockReq());
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['retry-after']) >= 1);
});

test('unexpected errors become a generic 500 with no internals leaked', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const handler = createApi({ methods: ['GET'], handler: async () => { throw new Error('db password=hunter2'); } });
    const r = await call(handler, mockReq());
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(r.json).includes('hunter2'));
  } finally { console.error = original; }
});

test('GET /api/air-quality validates coordinates and shapes the response', async () => {
  assert.equal((await call(airQuality, mockReq({ query: { lat: 'abc', lon: '1' } }))).status, 400);
  assert.equal((await call(airQuality, mockReq({ query: { lat: '91', lon: '1' } }))).status, 400);
  assert.equal((await call(airQuality, mockReq({ query: { lon: '1' } }))).status, 400);

  const payload = {
    current: { time: '2026-11-22T10:00', pm2_5: 150.4, pm10: 210 },
    hourly: { time: ['2026-11-22T10:00', '2026-11-22T11:00', '2026-11-22T12:00'], pm2_5: [150, 90, 80] },
  };
  let requested;
  const r = await withFetch(async (url) => { requested = String(url); return jsonFetch(payload)(); }, () =>
    call(airQuality, mockReq({ query: { lat: '28.6139', lon: '77.2090' } })));
  assert.equal(r.status, 200);
  assert.equal(r.json.aqi, 226);
  assert.equal(r.json.cleanestWindow.start, '2026-11-22T11:00');
  assert.match(requested, /latitude=28\.61&longitude=77\.21/, 'coordinates are rounded');
  assert.match(r.headers['cache-control'], /s-maxage=900/);
});

test('air-quality: upstream failures map to 502 without leaking details', async () => {
  const r = await withFetch(jsonFetch({}, false), () => call(airQuality, mockReq({ query: { lat: '1', lon: '1' } })));
  assert.equal(r.status, 502);
  const empty = await withFetch(jsonFetch({ current: {} }), () => call(airQuality, mockReq({ query: { lat: '1', lon: '1' } })));
  assert.equal(empty.status, 502);
});

test('GET /api/geocode validates the query and normalises results', async () => {
  assert.equal((await call(geocode, mockReq({ query: { q: 'a' } }))).status, 400);
  assert.equal((await call(geocode, mockReq({ query: {} }))).status, 400);
  const payload = { results: [{ name: 'Delhi', admin1: 'Delhi', country: 'India', latitude: 28.65, longitude: 77.23, id: 1 }, { name: 'bad' }] };
  const r = await withFetch(jsonFetch(payload), () => call(geocode, mockReq({ query: { q: 'Delhi' } })));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.places, [{ name: 'Delhi', region: 'Delhi, India', latitude: 28.65, longitude: 77.23 }]);
});

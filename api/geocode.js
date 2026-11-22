import { fetchJson } from '../lib/fetchJson.js';
import { HttpError, createApi } from '../lib/http.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { cleanText } from '../lib/validate.js';

const limiter = createRateLimiter({ limit: 40, windowMs: 60_000 });

export default createApi({
  methods: ['GET'],
  limiter,
  async handler(req) {
    const q = typeof req.query?.q === 'string' ? cleanText(req.query.q) : '';
    if (q.length < 2 || q.length > 80) throw new HttpError(400, 'Enter a city or area name (2–80 characters)');

    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: q, count: '5', language: 'en', format: 'json' }).toString();
    const data = await fetchJson(url);

    const places = (Array.isArray(data?.results) ? data.results : [])
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .map((p) => ({
        name: String(p.name ?? ''),
        region: [p.admin1, p.country].filter(Boolean).join(', '),
        latitude: p.latitude,
        longitude: p.longitude,
      }));
    return { body: { places }, headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } };
  },
});

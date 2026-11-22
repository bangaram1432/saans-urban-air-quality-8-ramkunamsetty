import { pm25ToAqi } from '../lib/aqi.js';
import { fetchJson } from '../lib/fetchJson.js';
import { cleanestWindow } from '../lib/forecast.js';
import { HttpError, createApi } from '../lib/http.js';
import { createRateLimiter } from '../lib/rateLimit.js';

const limiter = createRateLimiter({ limit: 40, windowMs: 60_000 });

function coordinate(raw, min, max, name) {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${name} must be a number between ${min} and ${max}`);
  return Math.round(n * 100) / 100; // ~1 km: privacy-friendly and far better CDN cache hit-rate
}

export default createApi({
  methods: ['GET'],
  limiter,
  async handler(req) {
    const lat = coordinate(req.query?.lat, -90, 90, 'lat');
    const lon = coordinate(req.query?.lon, -180, 180, 'lon');

    const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'pm2_5,pm10',
      hourly: 'pm2_5',
      forecast_days: '2',
      timezone: 'auto',
    }).toString();
    const data = await fetchJson(url);

    const pm25 = data?.current?.pm2_5;
    if (!Number.isFinite(pm25)) throw new HttpError(502, 'No air quality data is available for this location yet');

    return {
      body: {
        pm25,
        pm10: Number.isFinite(data.current.pm10) ? data.current.pm10 : null,
        aqi: pm25ToAqi(pm25),
        observedAt: data.current.time,
        cleanestWindow: cleanestWindow(data.hourly?.time, data.hourly?.pm2_5, data.current.time),
        source: 'Open-Meteo (CAMS) air quality model',
      },
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    };
  },
});

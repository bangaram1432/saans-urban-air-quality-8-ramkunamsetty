/**
 * AQI maths. Uses the US EPA PM2.5 breakpoints (revised 2024), the scale the
 * data provider (Open-Meteo / CAMS) reports in µg/m³.
 * Pure functions only: no I/O, no globals, trivially testable.
 */

export const CATEGORIES = Object.freeze([
  { id: 'good', label: 'Good', level: 0, maxAqi: 50 },
  { id: 'moderate', label: 'Moderate', level: 1, maxAqi: 100 },
  { id: 'unhealthy-sensitive', label: 'Unhealthy for sensitive groups', level: 2, maxAqi: 150 },
  { id: 'unhealthy', label: 'Unhealthy', level: 3, maxAqi: 200 },
  { id: 'very-unhealthy', label: 'Very unhealthy', level: 4, maxAqi: 300 },
  { id: 'hazardous', label: 'Hazardous', level: 5, maxAqi: 500 },
]);

/** [concLow, concHigh, aqiLow, aqiHigh] in µg/m³, truncated to 0.1 per EPA. */
const PM25_BREAKPOINTS = Object.freeze([
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
]);

export const MAX_AQI = 500;

/** Converts a PM2.5 concentration (µg/m³) to an integer AQI (0–500). */
export function pm25ToAqi(pm25) {
  if (typeof pm25 !== 'number' || !Number.isFinite(pm25) || pm25 < 0) {
    throw new RangeError('pm25 must be a non-negative finite number');
  }
  const c = Math.floor(pm25 * 10 + 1e-9) / 10; // truncate to 0.1 (epsilon guards float error)
  const band = PM25_BREAKPOINTS.find(([, high]) => c <= high);
  if (!band) return MAX_AQI;
  const [cLow, cHigh, iLow, iHigh] = band;
  return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow);
}

/** Maps an AQI value to its category object. Values above 500 are clamped. */
export function categorize(aqi) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) {
    throw new RangeError('aqi must be a non-negative finite number');
  }
  return CATEGORIES.find((c) => aqi <= c.maxAqi) ?? CATEGORIES[CATEGORIES.length - 1];
}

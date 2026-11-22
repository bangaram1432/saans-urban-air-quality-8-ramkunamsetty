/**
 * DOM rendering. Every piece of server text goes in via textContent (never
 * innerHTML), so model output or API data cannot inject markup or script.
 * No DOM access at import time, which keeps the pure helpers unit-testable.
 */

const BAND_MAX = [50, 100, 150, 200, 300, 500];
const GROUPS = [
  ['routine', 'Your daily routine'],
  ['indoor', 'Inside your home'],
  ['health', 'Protect your health'],
  ['alternative', 'Cleaner alternatives'],
];

/** Creates an element; string children become text nodes. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

/** Marker position (0–100%) on a gauge of six equal-width AQI bands. */
export function gaugePosition(aqi) {
  const v = Math.min(Math.max(Number(aqi) || 0, 0), 500);
  let low = 0;
  for (let i = 0; i < BAND_MAX.length; i += 1) {
    if (v <= BAND_MAX[i]) return Math.round(((i + (v - low) / (BAND_MAX[i] - low)) / BAND_MAX.length) * 1000) / 10;
    low = BAND_MAX[i];
  }
  return 100;
}

/** "2026-11-22T15:00" → "3 pm" (+ " tomorrow" when it is after the reference day). */
export function formatHour(iso, referenceIso) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):/.exec(iso ?? '');
  if (!match) return '';
  const hour = Number(match[2]);
  const label = `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'am' : 'pm'}`;
  return referenceIso && match[1] > referenceIso.slice(0, 10) ? `${label} tomorrow` : label;
}

export function renderGauge(aqi, categoryLabel) {
  const gauge = el('div', { class: 'gauge', role: 'img', 'aria-label': `Air quality index ${aqi} out of 500: ${categoryLabel}` },
    el('div', { class: 'gauge-bar', 'aria-hidden': true }, ...BAND_MAX.map(() => el('span'))),
    el('div', { class: 'gauge-marker', 'aria-hidden': true }),
    el('div', { class: 'gauge-scale', 'aria-hidden': true }, el('span', {}, '0'), el('span', {}, '500')));
  gauge.querySelector('.gauge-marker').style.setProperty('--pos', `${gaugePosition(aqi)}%`);
  return gauge;
}

const CATEGORY_LABELS = ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'];
const categoryFor = (aqi) => CATEGORY_LABELS[Math.max(0, BAND_MAX.findIndex((max) => aqi <= max))] ?? 'Hazardous';

export function renderAir(container, reading, placeLabel) {
  const label = categoryFor(reading.aqi);
  const w = reading.cleanestWindow;
  container.replaceChildren(
    el('h3', {}, `Air quality now: ${placeLabel}`),
    el('div', { class: 'reading-top' },
      el('span', { class: 'aqi-number' }, String(reading.aqi)),
      el('span', { class: 'aqi-label' }, `AQI · ${label}`)),
    renderGauge(reading.aqi, label),
    el('p', { class: 'meta' }, `Fine particles (PM2.5): ${Math.round(reading.pm25)} µg/m³.`),
    w && el('p', { class: 'meta' },
      `Cleanest window in the next 24 hours: ${formatHour(w.start, reading.observedAt)} for ${w.hours} hours (about ${Math.round(w.avgPm25)} µg/m³). Best time to open windows or exercise outside.`));
  container.hidden = false;
}

function renderRecommendation(rec) {
  return el('li', { class: 'rec' },
    el('h4', {}, rec.title, rec.optional && el('span', { class: 'badge' }, 'Optional')),
    el('p', {}, rec.action),
    el('p', { class: 'why' }, `Why: ${rec.why}`),
    el('p', { class: 'impact' }, `Impact: ${rec.impact}`));
}

export function renderResults(container, advice, placeLabel) {
  const { exposure, cigarettesPerDay } = advice;
  const groups = GROUPS.map(([key, title]) => [title, advice.recommendations.filter((r) => r.category === key)]).filter(([, recs]) => recs.length > 0);

  container.replaceChildren(
    el('h2', { id: 'results-h' }, placeLabel ? `Your plan for today in ${placeLabel}` : 'Your plan for today'),
    el('div', { class: 'reading-top' },
      el('span', { class: 'aqi-number' }, String(advice.aqi)),
      el('span', { class: 'aqi-label' }, `AQI · ${advice.category.label}`)),
    renderGauge(advice.aqi, advice.category.label),
    el('dl', { class: 'stats' },
      el('div', {}, el('dt', {}, 'Outdoor air today is like'), el('dd', {}, `${cigarettesPerDay} cigarettes`, el('small', {}, 'smoked over a full day (rough guide)'))),
      el('div', {}, el('dt', {}, 'Your estimated exposure now'), el('dd', {}, `${exposure.baseline} µg/m³`, el('small', {}, 'dose-weighted 24-hour average'))),
      el('div', {}, el('dt', {}, 'With this plan'), el('dd', {}, `${exposure.withPlan} µg/m³`, el('small', {}, exposure.reductionPct > 0 ? `${exposure.reductionPct}% lower` : 'already low')))),
    el('p', { class: 'summary' }, advice.summary),
    advice.aiNote && el('aside', { class: 'ai-note', 'aria-label': 'Personal note written by Gemini AI' },
      el('h3', {}, 'A personal note (written by Gemini AI)'), el('p', {}, advice.aiNote)),
    ...groups.map(([title, recs]) => el('section', { 'aria-label': title },
      el('h3', {}, title), el('ul', { class: 'rec-list' }, recs.map(renderRecommendation)))));
  container.hidden = false;
}

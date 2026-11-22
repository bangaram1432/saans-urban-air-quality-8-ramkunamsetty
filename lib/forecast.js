/**
 * Finds the cleanest consecutive window in an hourly PM2.5 forecast, so the
 * app can say *when* to ventilate or exercise instead of only *whether*.
 * Times are provider-local ISO strings ("2026-11-22T14:00"), which sort
 * lexicographically, so no Date parsing (and no timezone bugs) is needed.
 */
export function cleanestWindow(times, values, nowTime, span = 2, horizon = 24) {
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) return null;
  if (typeof nowTime !== 'string') return null;
  const first = times.findIndex((t) => t >= nowTime);
  if (first < 0) return null;

  const slice = values.slice(first, first + horizon);
  let best = null;
  for (let i = 0; i + span <= slice.length; i += 1) {
    const w = slice.slice(i, i + span);
    if (!w.every((v) => Number.isFinite(v))) continue;
    const avg = w.reduce((a, b) => a + b, 0) / span;
    if (best === null || avg < best.avg) best = { index: i, avg };
  }
  if (best === null) return null;
  return {
    start: times[first + best.index],
    hours: span,
    avgPm25: Math.round(best.avg * 10) / 10,
  };
}

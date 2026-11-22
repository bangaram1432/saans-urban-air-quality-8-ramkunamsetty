import { HttpError } from './http.js';

/** fetch + timeout + status check + JSON parse. Never leaks upstream details. */
export async function fetchJson(url, { method = 'GET', headers, body, timeoutMs = 4000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(String(url), { method, headers, body, signal: controller.signal });
    if (!res.ok) throw new HttpError(502, 'The data service returned an error');
    return await res.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'The data service is unavailable right now');
  } finally {
    clearTimeout(timer);
  }
}

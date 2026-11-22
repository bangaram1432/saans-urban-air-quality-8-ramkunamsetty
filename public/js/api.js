/** Thin, typed-error wrapper over fetch for our own /api endpoints. */
const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) throw new ApiError(data?.error ?? 'Something went wrong. Please try again.', { status: res.status, details: data?.details });
  return data;
}

export const searchPlaces = (q) => request(`/api/geocode?${new URLSearchParams({ q })}`);

export const fetchAir = (lat, lon) => request(`/api/air-quality?${new URLSearchParams({ lat, lon })}`);

export const requestAdvice = (payload) =>
  request('/api/advice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

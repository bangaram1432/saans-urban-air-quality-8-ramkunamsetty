/**
 * Tiny HTTP layer shared by every serverless function: method allow-list,
 * rate limiting, JSON body parsing with size limits, uniform error shape and
 * security headers. Handlers return plain objects, so they stay pure and
 * unit-testable without a server.
 */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

const MAX_BODY_CHARS = 4096;

export function clientKey(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

/** Returns the parsed JSON body or throws a 4xx HttpError. */
export function readJsonBody(req) {
  const type = String(req.headers?.['content-type'] ?? '');
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY_CHARS) throw new HttpError(413, 'Request body too large');
    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError(400, 'Request body is not valid JSON');
    }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  if (JSON.stringify(body).length > MAX_BODY_CHARS) throw new HttpError(413, 'Request body too large');
  return body;
}

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

/**
 * @param {{methods:string[], limiter?:{check:(k:string)=>{allowed:boolean,retryAfterSec:number}},
 *          handler:(req:object)=>Promise<{status?:number, body:object, headers?:object}>}} options
 */
export function createApi({ methods, limiter, handler }) {
  return async function apiHandler(req, res) {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'Method not allowed');
      }
      if (limiter) {
        const verdict = limiter.check(clientKey(req));
        if (!verdict.allowed) {
          res.setHeader('Retry-After', String(verdict.retryAfterSec));
          throw new HttpError(429, 'Too many requests. Please wait a moment and try again.');
        }
      }
      const { status = 200, body, headers } = await handler(req);
      sendJson(res, status, body, headers);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message, ...(err.details ? { details: err.details } : {}) });
        return;
      }
      console.error('Unhandled API error:', err?.name); // never log request data or stacks with user input
      sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  };
}

/** Minimal stand-ins for Node's req/res so handlers run without a server. */
export function mockReq({ method = 'GET', query = {}, body, headers = {} } = {}) {
  return { method, query, body, headers: { 'content-type': 'application/json', ...headers } };
}

export function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(payload) { this.body = payload; },
  };
  return res;
}

export async function call(handler, req) {
  const res = mockRes();
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

export const baseProfile = Object.freeze({
  pm25: 150, city: '', children: false, elderly: false, pregnant: false, respiratory: false,
  hasPurifier: false, commute: 'wfh', commuteMinutes: 0, cooking: 'induction', heating: 'none',
  exercise: 'none', question: '',
});

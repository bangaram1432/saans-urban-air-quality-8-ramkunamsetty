import { buildAdvice, summarize } from '../lib/rules.js';
import { generateNote } from '../lib/gemini.js';
import { createApi, readJsonBody } from '../lib/http.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { validateAdviceRequest } from '../lib/validate.js';

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export default createApi({
  methods: ['POST'],
  limiter,
  async handler(req) {
    const profile = validateAdviceRequest(readJsonBody(req));
    const advice = buildAdvice(profile);
    const aiNote = await generateNote({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL,
      advice,
      profile,
    });
    return { body: { ...advice, summary: summarize(advice), aiNote, aiSource: aiNote ? 'gemini' : 'rules' } };
  },
});

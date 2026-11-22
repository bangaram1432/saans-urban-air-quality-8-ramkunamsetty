# Saans: Urban Air Quality Assistant

> **Challenge 6: Urban Air Quality Assistant.** A GenAI-powered assistant that helps families and communities get through severe winter smog with low-emission daily routines, indoor air quality hacks and sustainable alternatives, and shows the **direct impact of each choice** on the pollution they breathe.

*Saans* (साँस) means "breath" in Hindi.

## Chosen vertical

**Families and communities in smog-affected cities** (for example Delhi-NCR, Lahore, Dhaka, Kolkata and winter-inversion cities worldwide). The persona is a household with a mix of people (children, older adults, someone with asthma), a daily commute, a way of cooking and heating, and a limited budget. They need to know **what to do today**, not just what the AQI number is.

## How it works

```
 Browser (vanilla JS, no framework)
   │ 1. search a city / use location / type a PM2.5 reading
   ▼
 /api/geocode ──► Open-Meteo geocoding         (cached 24 h at the edge)
 /api/air-quality ─► Open-Meteo CAMS air model (cached 15 min; also finds the cleanest 2 h window in the next 24 h)
   │ 2. household + routine form
   ▼
 /api/advice  (POST)
   ├─ validate.js   allow-list validation, text sanitising
   ├─ rules.js      deterministic decision engine → prioritised actions
   ├─ impact.js     exposure model → "this action cuts your exposure by X%"
   └─ gemini.js     optional: Gemini explains & answers the user's question
                    using ONLY the engine's verified facts
```

### Approach and logic

1. **Context first.** PM2.5 is converted to a US-EPA AQI (2024 breakpoints). The household profile then shifts the effective severity: if anyone is a child, older adult, pregnant or has a lung/heart condition, advice becomes **one tier stricter**, as health agencies do for sensitive groups.
2. **Declarative rules.** `lib/rules.js` holds about 17 rules (`id`, `when`, `build`). Each yields an action, a plain-language **why**, and an **impact**. Rules cover routines (exercise timing, commute mode and mask use), indoor hacks (sealing windows at the morning and evening peaks, purifier use, a DIY Corsi–Rosenthal box, kitchen ventilation, damp-mopping), health protection, and sustainable alternatives (clean cooking and heating fuels, mass transit, no burning or idling).
3. **Impact is computed, not guessed.** `lib/impact.js` is a transparent micro-environment model. For each action it recomputes your 24-hour dose-weighted exposure with and without that action, so every item shows a real percentage (for example, "keep windows shut: about 25%"). The plan total uses only free actions, so an optional purchase never inflates the promise. A "cigarette equivalent" (22 µg/m³ for 24 h ≈ 1 cigarette) and weekly CO₂e saved by switching commute days make the stakes tangible.
4. **GenAI where it adds value, safely.** Gemini receives only structured, verified facts plus the user's optional question, and is told to use only those numbers. Safe-guards: no key means the app still works fully; a 6 s timeout; the model is never given the API key in a URL; output is length-capped and rendered with `textContent`; the prompt treats user text as untrusted data; and it is not allowed to diagnose or give doses.
5. **Real-time, location-aware.** Live PM2.5 comes from Open-Meteo (CAMS), with no API key needed. The hourly forecast is used to say *when* to ventilate or exercise.

## How the evaluation criteria are addressed

| Criterion | What the code does | Where |
|---|---|---|
| **Code quality** | Zero runtime dependencies. Pure, single-purpose modules. Rules and constants are data, not control flow. JSDoc on public functions. `.editorconfig`, CI (`npm run check` + tests). | `lib/`, `api/` |
| **Security** | Strict CSP (`default-src 'none'`, no inline script or style), HSTS, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`. Allow-list validation, body-size limit (413), content-type check (415), per-IP rate limiting (429). API key only in server env and in a header. XSS-proof rendering (`textContent` only). Prompt-injection hardening. No raw upstream errors or stack traces returned. Coordinates rounded to about 1 km. No server-side storage of user data. | `vercel.json`, `lib/http.js`, `lib/validate.js`, `lib/gemini.js` |
| **Efficiency** | No framework (about 10 KB of JS and CSS). Edge caching with `s-maxage` + `stale-while-revalidate` on location and air-quality calls. Rounded coordinates raise cache hit-rate. Timeouts on every upstream call. Bounded rate-limiter memory. The deterministic engine is O(rules) and needs no network. The Gemini call is capped at 400 output tokens. Stale-response guard in the UI. | `api/*.js`, `lib/rateLimit.js`, `public/js/main.js` |
| **Testing** | 51 tests with Node's built-in runner (no deps): AQI boundaries, model monotonicity, every rule path, validation fuzz cases, Gemini failure modes (timeout, HTTP error, empty reply, injection payload), HTTP status codes, rate limiting, and the geocode and air-quality handlers with a mocked `fetch`. About 95% line coverage overall and 100% across `api/`. Handlers take plain objects, so no server is needed. | `test/` |
| **Accessibility** | Semantic landmarks and a skip link. Every control has a visible label, with hints tied via `aria-describedby`. Fieldsets and legends. Live region for loading and results, and focus moves to the results heading. Field-level errors with `aria-invalid`. AQI meaning is conveyed by text and an `aria-label`, never by colour alone. Targets are at least 44 px. 4.5:1+ contrast in light and dark. `prefers-reduced-motion`, `forced-colors`, `prefers-color-scheme`. Fully keyboard-operable. Plain-language copy at about a grade-8 reading level. Works at 200% zoom and on small screens. | `public/` |
| **Problem alignment** | Each part of the brief maps to a feature: *low-emission daily routines* → commute, exercise-timing and no-idling rules; *indoor air hacks* → window timing, purifier or DIY filter, cooking and heating, dust; *sustainable alternatives* → clean fuels, transit with CO₂e saved; *tailored to location and lifestyle* → live local PM2.5 plus household and routine profile; *clearly explaining the direct impact* → per-action % exposure reduction, plan total, cigarette equivalent, and a "Why" on every item. | `lib/rules.js`, `lib/impact.js` |

## Assumptions

- **Exposure factors** (`FACTORS` in `lib/impact.js`) are rounded planning values: indoor/outdoor ratio 0.7 with windows open, 0.5 sealed, 0.4 with a purifier, 0.25 both; breathing weights of 2× for outdoor exercise and 2× for cycling; a well-fitted N95 passes about 20%. They are estimates for relative comparison, **not** clinical measurements.
- The cigarette equivalent uses the Berkeley Earth rule of thumb (22 µg/m³ for 24 h ≈ 1 cigarette) and is a communication aid only.
- Exercise is assumed to last 45 minutes. "Travel minutes" is the total per day. CO₂e per km: car 0.17, two-wheeler 0.11, transit 0.08.
- AQI uses the US EPA scale; local scales (such as India's NAQI) differ.
- The afternoon being cleaner (about 12–4 pm) reflects typical winter inversion behaviour; the live cleanest-window forecast overrides it where available.
- Open-Meteo is a modelled (CAMS) estimate, not a ground-station reading, so the manual PM2.5 input is provided as a fallback.
- The app gives general guidance and is **not medical advice**.

## Run locally

```bash
git clone <your-repo-url> && cd <repo>
npm test                 # 51 tests, no install needed
npm run dev              # http://localhost:3000  (optionally: GEMINI_API_KEY=... npm run dev)
```

## Deploy to Vercel

1. Push this repo to GitHub (see below), then on vercel.com choose **Add New → Project** and import it. No framework preset or build command is needed.
2. *(Optional, enables the Gemini personal note)* In **Settings → Environment Variables** add `GEMINI_API_KEY` (free key at <https://aistudio.google.com/apikey>). Redeploy. Without it the app runs on the rules engine alone.

Or with the CLI: `npx vercel --prod`.

## Submission checklist (hackathon rules)

```bash
git init -b main
git add . && git commit -m "Saans: urban air quality assistant"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main      # one branch only; repo must be public; size is about 200 KB (< 10 MB)
```

## Known limitations

- The rate limiter is per serverless instance (best-effort). For production use, back it with Vercel KV or Upstash.
- Rendering code in `public/js/render.js` and `main.js` needs a browser to test; the pure helpers are unit-tested, and an end-to-end Playwright suite is the natural next step.
- English only. Copy is kept simple so it can be translated; Gemini can answer in other languages if asked.

## Data and credits

Air quality and geocoding by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0), using Copernicus Atmosphere Monitoring Service data. AI notes by Google Gemini.

/**
 * Decision engine. Turns a validated profile into a prioritised, explained
 * action plan. Rules are declarative data (id, trigger, content) so adding or
 * auditing advice never means touching control flow.
 *
 * "effLevel" = AQI category level, raised by one tier when the household
 * includes someone sensitive (children, older adults, pregnancy, lung/heart
 * conditions) — mirroring how health agencies issue earlier, stricter advice
 * for sensitive groups.
 */
import { categorize, pm25ToAqi } from './aqi.js';
import { cigaretteEquivalent, estimateExposure, reductionPct, weeklyCo2SavedBySwitch } from './impact.js';

const MASKABLE = new Set(['walk', 'cycle', 'two_wheeler', 'transit']);
const OPEN_AIR = new Set(['walk', 'cycle']);
const MAX_RECOMMENDATIONS = 10;

/** @typedef {'routine'|'indoor'|'health'|'alternative'} Category */

const RULES = [
  {
    id: 'ventilate-now',
    category: 'indoor',
    when: (c) => c.effLevel <= 1,
    build: () => ({
      priority: 3,
      title: 'Good day to air out your home',
      action: 'Open windows for 15–20 minutes around midday to flush out stale indoor air.',
      why: 'When outdoor air is clean, ventilating lowers pollutants that build up from cooking and cleaning.',
      impact: 'Fresher air indoors at no cost.',
    }),
  },
  {
    id: 'exercise-outdoors-ok',
    category: 'routine',
    when: (c) => c.effLevel <= 1 && c.exercise === 'outdoor',
    build: () => ({
      priority: 3,
      title: 'Outdoor exercise is fine today',
      action: 'Enjoy your usual workout outside; check again if the smog thickens.',
      why: 'At this air quality level most people can exercise outdoors without extra risk.',
      impact: 'No change needed.',
    }),
  },
  {
    id: 'exercise-shift',
    category: 'routine',
    when: (c) => c.exercise === 'outdoor' && (c.effLevel === 2 || c.effLevel === 3),
    build: () => ({
      priority: 2,
      title: 'Move your outdoor workout to the cleanest hours',
      action: 'Exercise outside in the afternoon (about 12–4 pm), keep it light, and stay off busy roads. Use the cleanest-window time above if shown.',
      why: 'In winter, cold still air traps smog near the ground overnight and in the early morning. It usually thins out by afternoon. Hard exercise also makes you breathe about twice as much air.',
      impact: 'Cuts the smog you breathe in during exercise. Biggest gain comes from timing.',
    }),
  },
  {
    id: 'exercise-indoors',
    category: 'routine',
    when: (c) => c.exercise === 'outdoor' && c.effLevel >= 4,
    build: () => ({
      priority: 1,
      title: 'Exercise indoors today',
      action: 'Swap your outdoor workout for a home routine: yoga, stretching, stair climbs or a brisk walk inside a mall or gym.',
      why: 'Deep, fast breathing pulls polluted air deep into your lungs. At this level, outdoor exercise does more harm than good.',
      actionKey: 'exerciseIndoors',
    }),
  },
  {
    id: 'commute-mask',
    category: 'health',
    when: (c) => MASKABLE.has(c.commute) && c.commuteMinutes > 0 && c.effLevel >= 3,
    build: () => ({
      priority: 1,
      title: 'Wear a fitted N95 / FFP2 mask on your commute',
      action: 'Choose an N95, FFP2 or KN95 mask. Press the metal strip to your nose and check there are no gaps at the cheeks. Cloth and surgical masks do not stop fine smog particles.',
      why: 'PM2.5 particles are small enough to reach deep into your lungs and blood. A well-fitted N95 filters about 95% of them; loose masks filter far less.',
      actionKey: 'wearMask',
    }),
  },
  {
    id: 'commute-quiet-route',
    category: 'routine',
    when: (c) => OPEN_AIR.has(c.commute) && c.commuteMinutes > 0 && c.effLevel >= 2,
    build: () => ({
      priority: 2,
      title: 'Take quieter streets or park paths',
      action: 'Swap main roads for side streets or green paths, even if the trip is a few minutes longer. Avoid waiting right beside idling traffic.',
      why: 'Pollution is highest right next to busy roads and drops quickly within a block or two.',
      impact: 'Often lowers roadside exposure noticeably on the same trip.',
    }),
  },
  {
    id: 'commute-car-cabin',
    category: 'routine',
    when: (c) => c.commute === 'car' && c.commuteMinutes > 0 && c.effLevel >= 3,
    build: () => ({
      priority: 2,
      title: 'Keep car windows up and use recirculate',
      action: 'Close windows, switch the air conditioning to recirculate, and replace the cabin air filter if it is more than a year old.',
      why: 'Fresh-air mode pulls exhaust from the vehicles ahead straight into the cabin; recirculation and a clean filter keep much of it out.',
      impact: 'A closed cabin is already counted in your estimate; this keeps it that way.',
    }),
  },
  {
    id: 'commute-switch',
    category: 'alternative',
    when: (c) => (c.commute === 'car' || c.commute === 'two_wheeler') && weeklyCo2SavedBySwitch(c) > 0,
    build: (c) => {
      const kg = weeklyCo2SavedBySwitch(c);
      return {
        priority: 3,
        title: 'Swap two commute days a week to metro, bus or a shared ride',
        action: 'Pick two fixed days (for example Tuesday and Thursday) to go by public transport or carpool.',
        why: 'Vehicle exhaust is a major source of winter smog, and every vehicle off the road cuts it a little.',
        impact: `Saves roughly ${kg} kg of CO₂e per week for you, and fewer exhaust plumes on your street.`,
      };
    },
  },
  {
    id: 'seal-windows',
    category: 'indoor',
    when: (c) => c.effLevel >= 3,
    build: (c) => ({
      priority: 1,
      title: c.effLevel >= 5 ? 'Keep windows shut all day' : 'Close windows during morning and evening smog peaks',
      action:
        c.effLevel >= 5
          ? 'Keep windows and doors closed and seal gaps with draught strips or a rolled towel.'
          : 'Close windows and seal gaps before 7 am and after 5 pm. Open them briefly (5–10 minutes) in the afternoon only if the air outside looks clearer.',
      why: 'Smog seeps in through open windows and cracks. Closing up keeps indoor air cleaner than outdoors.',
      actionKey: 'sealWindows',
    }),
  },
  {
    id: 'purifier-use',
    category: 'indoor',
    when: (c) => c.hasPurifier && c.effLevel >= 2,
    build: (c) => ({
      priority: c.effLevel >= 3 ? 1 : 2,
      title: 'Run your air purifier in the room you use most',
      action: 'Keep the door closed, run it on medium or high, and put it in the bedroom at night. Clean or replace the filter as the manual says.',
      why: 'A HEPA purifier removes fine particles from the air in the room, which is where you spend most of the day.',
      actionKey: 'usePurifier',
    }),
  },
  {
    id: 'purifier-diy',
    category: 'alternative',
    when: (c) => !c.hasPurifier && c.effLevel >= 3,
    build: () => ({
      priority: 2,
      title: 'Build a low-cost Corsi–Rosenthal box',
      action: 'Tape four MERV-13 (or similar) panel filters into a cube and fix a box fan on top. Run it in your main room.',
      why: 'Tests by universities and public-health groups show these DIY filters clean room air similarly to many commercial purifiers at a fraction of the price.',
      actionKey: 'usePurifier',
      optional: true,
    }),
  },
  {
    id: 'cooking-ventilation',
    category: 'indoor',
    when: (c) => c.cooking !== 'induction' && c.effLevel >= 2,
    build: (c) => ({
      priority: 2,
      title: 'Vent your kitchen while cooking',
      action: c.effLevel >= 4
        ? 'Use the chimney or exhaust fan, cover pots, shut the kitchen door, and avoid deep frying today.'
        : 'Use the chimney or exhaust fan, cover pots, and shut the kitchen door while you cook.',
      why: 'Cooking, especially frying and burning fuel, can push indoor fine-particle levels as high as the outdoor smog.',
      impact: 'Keeps cooking smoke out of the rest of the home.',
    }),
  },
  {
    id: 'cooking-clean-fuel',
    category: 'alternative',
    when: (c) => c.cooking === 'biomass',
    build: () => ({
      priority: 1,
      title: 'Move to LPG, piped gas or induction for cooking',
      action: 'Switch from wood, coal or dung to LPG/PNG or an induction hob. Until then, cook outdoors or beside an open door.',
      why: 'Burning solid fuel indoors releases large amounts of fine particles and carbon monoxide, often more than outdoor smog.',
      impact: 'The single biggest indoor-air improvement for homes that cook on solid fuel.',
    }),
  },
  {
    id: 'heating-no-burning',
    category: 'alternative',
    when: (c) => c.heating === 'biomass',
    build: (c) => ({
      priority: c.effLevel >= 3 ? 1 : 2,
      title: 'Warm up without burning wood, charcoal or dung',
      action: 'Use layers, a hot-water bottle, blankets or an electric heater. Never burn anything in a closed room: it also produces carbon monoxide.',
      why: 'Indoor fires release fine particles and carbon monoxide that stay in the room and add to the smog outside.',
      impact: 'Removes a major indoor source and a poisoning risk.',
    }),
  },
  {
    id: 'dust-smoke',
    category: 'indoor',
    when: (c) => c.effLevel >= 2,
    build: () => ({
      priority: 3,
      title: 'Damp-mop and skip incense, coils and candles',
      action: 'Wipe surfaces and mop with a damp cloth instead of dry sweeping. Avoid incense sticks, mosquito coils and candles while the air is bad.',
      why: 'Dry sweeping lifts settled dust back into the air, and burning things indoors adds fine particles.',
      impact: 'Small, free wins that stop you adding to the problem.',
    }),
  },
  {
    id: 'children',
    category: 'health',
    when: (c) => c.children && c.effLevel >= 2,
    build: (c) => ({
      priority: c.effLevel >= 3 ? 1 : 2,
      title: 'Keep children’s outdoor time short',
      action: 'Keep outdoor play short and gentle, prefer indoor games, and ask the school to move PE and assembly indoors on bad days.',
      why: 'Children breathe faster for their body size and their lungs are still developing, so smog affects them more.',
      impact: 'Protects growing lungs during the worst hours.',
    }),
  },
  {
    id: 'sensitive-care',
    category: 'health',
    when: (c) => (c.elderly || c.pregnant || c.respiratory) && c.effLevel >= 3,
    build: (c) => ({
      priority: 1,
      title: 'Limit time outdoors and keep your care plan close',
      action: c.respiratory
        ? 'Stay indoors as much as you can, keep your usual reliever medicine within reach, and follow your doctor’s action plan. Call your doctor if breathing gets harder.'
        : 'Stay indoors as much as you can, rest if you feel dizzy or short of breath, and call your doctor if symptoms get worse.',
      why: 'Fine particles can strain the heart and lungs, and people who are older, pregnant or have asthma, COPD or heart conditions feel it first.',
      impact: 'Lowers the chance of a flare-up or emergency visit.',
    }),
  },
  {
    id: 'errand-mask',
    category: 'health',
    when: (c) => (c.commute === 'wfh' || c.commute === 'car') && c.effLevel >= 4,
    build: () => ({
      priority: 2,
      title: 'Carry an N95 / FFP2 mask for errands',
      action: 'Keep a fitted mask by the door and wear it for any quick trip outside.',
      why: 'Even short trips in very polluted air add up, and a good mask is the cheapest protection you can carry.',
      impact: 'A well-fitted N95 filters about 95% of fine particles.',
    }),
  },
  {
    id: 'community',
    category: 'alternative',
    when: (c) => c.effLevel >= 2,
    build: () => ({
      priority: 3,
      title: 'Cut local smog: no burning, no idling',
      action: 'Turn off the engine when waiting (school pick-up, traffic lights), never burn leaves or rubbish, and report open burning to your local pollution control board or municipal helpline.',
      why: 'Open burning and idling engines are big, avoidable local sources of smog.',
      impact: 'Cleaner air for your street, including your own windows.',
    }),
  },
];

function buildContext(profile) {
  const aqi = pm25ToAqi(profile.pm25);
  const category = categorize(aqi);
  const sensitive = profile.children || profile.elderly || profile.pregnant || profile.respiratory;
  return { ...profile, aqi, category, sensitive, effLevel: Math.min(5, category.level + (sensitive ? 1 : 0)) };
}

/** Builds the full advice object for a validated profile. Deterministic. */
export function buildAdvice(profile) {
  const ctx = buildContext(profile);
  const baseline = estimateExposure(ctx.pm25, ctx);

  const recommendations = RULES.filter((rule) => rule.when(ctx))
    .map((rule) => {
      const { priority, title, action, why, impact, actionKey, optional } = rule.build(ctx);
      const pct = actionKey ? reductionPct(baseline, estimateExposure(ctx.pm25, ctx, { [actionKey]: true })) : null;
      return {
        id: rule.id,
        category: rule.category,
        priority,
        title,
        action,
        why,
        impact: pct !== null ? `Cuts your estimated daily exposure by about ${pct}% on its own.` : impact,
        reductionPct: pct,
        optional: optional === true,
        actionKey: actionKey ?? null,
      };
    })
    .sort((a, b) => a.priority - b.priority || (b.reductionPct ?? 0) - (a.reductionPct ?? 0) || a.id.localeCompare(b.id))
    .slice(0, MAX_RECOMMENDATIONS);

  const planActions = {};
  for (const rec of recommendations) if (rec.actionKey && !rec.optional) planActions[rec.actionKey] = true;
  const withPlan = estimateExposure(ctx.pm25, ctx, planActions);

  return {
    pm25: ctx.pm25,
    aqi: ctx.aqi,
    category: { id: ctx.category.id, label: ctx.category.label, level: ctx.category.level },
    sensitiveHousehold: ctx.sensitive,
    cigarettesPerDay: cigaretteEquivalent(ctx.pm25),
    exposure: { baseline, withPlan, reductionPct: reductionPct(baseline, withPlan) },
    recommendations: recommendations.map(({ actionKey, ...rest }) => rest),
  };
}

/** Plain-language summary used when the AI note is unavailable (and always shown). */
export function summarize(advice) {
  const { aqi, category, cigarettesPerDay, exposure, sensitiveHousehold } = advice;
  const parts = [`The air quality index is ${aqi} (${category.label.toLowerCase()}).`];
  if (cigarettesPerDay >= 0.5) {
    parts.push(`Breathing outdoor air like this for a full day is roughly like smoking ${cigarettesPerDay} cigarettes.`);
  }
  if (sensitiveHousehold && category.level >= 1) {
    parts.push('Because your household includes someone more sensitive, the advice below is stricter than for the general public.');
  }
  if (exposure.reductionPct >= 5) {
    parts.push(`Following the plan could cut your estimated exposure from ${exposure.baseline} to ${exposure.withPlan} µg/m³, about ${exposure.reductionPct}% lower.`);
  } else {
    parts.push('Your estimated exposure is already low; the tips below help you keep it that way.');
  }
  return parts.join(' ');
}

/**
 * Exposure model: turns "what you do" into "how much polluted air you breathe".
 *
 * This is a deliberately simple, transparent micro-environment model, not a
 * clinical tool. Each factor below is a rounded planning value drawn from the
 * indoor/outdoor and filtration literature; the README lists them as
 * assumptions. Every number the app shows is derived from these constants, so
 * they can be audited and tuned in one place.
 */

/** Effective exposure weight per hour, relative to the outdoor concentration. */
export const FACTORS = Object.freeze({
  indoor: { open: 0.7, sealed: 0.5, purifier: 0.4, sealedPurifier: 0.25 },
  commute: { wfh: 0, walk: 1.3, cycle: 2.0, two_wheeler: 1.3, car: 0.6, transit: 0.9 },
  outdoorExercise: 2.0, // harder breathing ≈ 2× inhaled dose
  indoorExerciseBreathing: 1.5, // multiplies the indoor factor
  maskPenetration: 0.2, // a well-fitted N95/FFP2 in real-world use
});

const MASKABLE_COMMUTES = new Set(['walk', 'cycle', 'two_wheeler', 'transit']);
const EXERCISE_HOURS = 0.75;
const MAX_COMMUTE_MINUTES = 240;
const CIGARETTE_PM25_PER_DAY = 22; // Berkeley Earth rule of thumb: 22 µg/m³ for 24 h ≈ 1 cigarette

const KG_CO2E_PER_KM = Object.freeze({ car: 0.17, two_wheeler: 0.11, transit: 0.08, walk: 0, cycle: 0, wfh: 0 });
const URBAN_SPEED_KMH = Object.freeze({ car: 22, two_wheeler: 25, transit: 18, walk: 5, cycle: 12, wfh: 0 });

const round1 = (n) => Math.round(n * 10) / 10;

function indoorFactor({ sealWindows, usePurifier }) {
  if (sealWindows && usePurifier) return FACTORS.indoor.sealedPurifier;
  if (usePurifier) return FACTORS.indoor.purifier;
  if (sealWindows) return FACTORS.indoor.sealed;
  return FACTORS.indoor.open;
}

/**
 * Estimated 24-hour average personal exposure (µg/m³, dose-weighted).
 * @param {number} pm25 outdoor concentration
 * @param {object} profile validated profile (commute, commuteMinutes, exercise)
 * @param {{sealWindows?:boolean,usePurifier?:boolean,wearMask?:boolean,exerciseIndoors?:boolean}} [actions]
 */
export function estimateExposure(pm25, profile, actions = {}) {
  const commuteHours = profile.commute === 'wfh' ? 0 : Math.min(profile.commuteMinutes, MAX_COMMUTE_MINUTES) / 60;
  const exerciseHours = profile.exercise === 'none' ? 0 : EXERCISE_HOURS;
  const home = indoorFactor(actions);
  const masked = actions.wearMask ? FACTORS.maskPenetration : 1;

  const exerciseIndoors = profile.exercise === 'indoor' || actions.exerciseIndoors === true;
  const exerciseTerm = exerciseIndoors
    ? exerciseHours * home * FACTORS.indoorExerciseBreathing
    : exerciseHours * FACTORS.outdoorExercise * masked;

  const commuteMask = MASKABLE_COMMUTES.has(profile.commute) ? masked : 1;
  const commuteTerm = commuteHours * FACTORS.commute[profile.commute] * commuteMask;
  const indoorHours = 24 - commuteHours - exerciseHours;

  return round1((pm25 * (indoorHours * home + commuteTerm + exerciseTerm)) / 24);
}

/** Percentage reduction from `before` to `after`, clamped to 0–100. */
export function reductionPct(before, after) {
  if (before <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - after / before) * 100)));
}

/** "Cigarette-equivalent" of breathing a PM2.5 level for a full day. */
export function cigaretteEquivalent(pm25, hours = 24) {
  return round1((pm25 / CIGARETTE_PM25_PER_DAY) * (hours / 24));
}

/** kg CO₂e saved per week by switching `days` commute days to public transit. */
export function weeklyCo2SavedBySwitch(profile, days = 2) {
  const speed = URBAN_SPEED_KMH[profile.commute] ?? 0;
  const km = (Math.min(profile.commuteMinutes, MAX_COMMUTE_MINUTES) / 60) * speed;
  const saving = km * (KG_CO2E_PER_KM[profile.commute] - KG_CO2E_PER_KM.transit);
  return saving > 0 ? round1(saving * days) : 0;
}

import { ApiError, fetchAir, requestAdvice, searchPlaces } from './api.js';
import { renderAir, renderResults } from './render.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'saans.profile.v1';
const REMEMBERED = ['children', 'elderly', 'pregnant', 'respiratory', 'hasPurifier', 'commute', 'commuteMinutes', 'exercise', 'cooking', 'heating'];

const state = { reading: null, place: '', token: 0 };
const ui = {
  status: $('status'), air: $('air'), list: $('place-results'), form: $('plan-form'),
  submit: $('submit-btn'), error: $('form-error'), results: $('results'), q: $('place-q'),
};

const announce = (message) => { ui.status.textContent = message; };

function busy(button, isBusy, idleText, busyText) {
  button.disabled = isBusy;
  button.textContent = isBusy ? busyText : idleText;
  button.setAttribute('aria-busy', String(isBusy));
}

/* ---------- Step 1: location & air quality ---------- */

async function loadAir(lat, lon, label) {
  const token = ++state.token; // ignore stale responses if the user picks again
  announce(`Loading air quality for ${label}…`);
  try {
    const reading = await fetchAir(lat, lon);
    if (token !== state.token) return;
    state.reading = reading;
    state.place = label;
    renderAir(ui.air, reading, label);
    ui.list.replaceChildren();
    announce(`Air quality index in ${label} is ${reading.aqi}.`);
  } catch (err) {
    if (token !== state.token) return;
    announce('');
    ui.air.hidden = false;
    ui.air.textContent = `${err.message} You can enter a PM2.5 reading yourself below.`;
  }
}

$('location-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const q = ui.q.value.trim();
  const button = event.submitter ?? event.target.querySelector('button');
  if (q.length < 2) {
    announce('Enter at least 2 characters for a city or area.');
    ui.q.focus();
    return;
  }
  busy(button, true, 'Search', 'Searching…');
  try {
    const { places } = await searchPlaces(q);
    const note = (text) => { const li = document.createElement('li'); li.textContent = text; return li; };
    ui.list.replaceChildren(...places.map((p) => {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.append(p.name);
      const region = document.createElement('small');
      region.textContent = p.region;
      choice.append(region);
      choice.addEventListener('click', () => loadAir(p.latitude, p.longitude, p.name));
      const item = document.createElement('li');
      item.append(choice);
      return item;
    }));
    announce(places.length ? `${places.length} places found. Choose one.` : 'No places found. Try another spelling or a nearby city.');
    if (!places.length) ui.list.replaceChildren(note('No places found. Try another spelling or a nearby city.'));
  } catch (err) {
    announce(err.message);
    const li = document.createElement('li');
    li.textContent = err.message;
    ui.list.replaceChildren(li);
  } finally {
    busy(button, false, 'Search', 'Searching…');
  }
});

$('use-location').addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    announce('Your browser cannot share location. Search for your city instead.');
    return;
  }
  announce('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => loadAir(coords.latitude, coords.longitude, 'your location'),
    () => announce('We could not get your location. Search for your city instead.'),
    { timeout: 10000, maximumAge: 600000 },
  );
});

$('manual-apply').addEventListener('click', () => {
  const input = $('manual-pm25');
  const pm25 = Number(input.value);
  if (input.value === '' || !Number.isFinite(pm25) || pm25 < 0 || pm25 > 1000) {
    announce('Enter a PM2.5 value between 0 and 1000.');
    input.focus();
    return;
  }
  state.reading = { pm25, aqi: null };
  state.place = 'your reading';
  ui.air.hidden = false;
  ui.air.textContent = `Using your PM2.5 reading of ${pm25} µg/m³.`;
  announce(`Using your PM2.5 reading of ${pm25}.`);
});

/* ---------- Step 2: profile form ---------- */

const form = ui.form;
const commute = form.elements.commute;
const toggleMinutes = () => { $('minutes-field').hidden = commute.value === 'wfh'; };
commute.addEventListener('change', toggleMinutes);

function restoreProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return;
    for (const name of REMEMBERED) {
      const field = form.elements[name];
      if (!field || !(name in saved)) continue;
      if (field.type === 'checkbox') field.checked = saved[name] === true;
      else if (typeof saved[name] === 'string') field.value = saved[name];
    }
  } catch { /* storage unavailable or corrupted: start fresh */ }
  toggleMinutes();
}

function saveProfile() {
  try {
    const data = Object.fromEntries(REMEMBERED.map((n) => [n, form.elements[n].type === 'checkbox' ? form.elements[n].checked : form.elements[n].value]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* private mode: not essential */ }
}

function buildPayload() {
  const f = form.elements;
  return {
    pm25: state.reading.pm25,
    city: state.place === 'your location' || state.place === 'your reading' ? '' : state.place,
    children: f.children.checked, elderly: f.elderly.checked, pregnant: f.pregnant.checked,
    respiratory: f.respiratory.checked, hasPurifier: f.hasPurifier.checked,
    commute: f.commute.value, commuteMinutes: Math.round(Number(f.commuteMinutes.value) || 0),
    exercise: f.exercise.value, cooking: f.cooking.value, heating: f.heating.value,
    question: f.question.value,
  };
}

function showFieldErrors(details) {
  for (const { field, message } of details ?? []) {
    const input = form.elements[field];
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    ui.error.textContent = `${ui.error.textContent} ${message}.`.trim();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  ui.error.textContent = '';
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');

  if (!state.reading) {
    ui.error.textContent = 'First choose a location in step 1, or enter a PM2.5 reading yourself.';
    ui.q.focus();
    return;
  }
  saveProfile();
  busy(ui.submit, true, 'Get my plan', 'Building your plan…');
  announce('Building your plan…');
  try {
    const advice = await requestAdvice(buildPayload());
    renderResults(ui.results, advice, state.place === 'your reading' ? '' : state.place);
    ui.results.focus();
    ui.results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    announce(`Your plan is ready. Air quality index ${advice.aqi}, ${advice.category.label}.`);
  } catch (err) {
    announce('');
    ui.error.textContent = err.message;
    if (err instanceof ApiError && err.status === 400) showFieldErrors(err.details);
  } finally {
    busy(ui.submit, false, 'Get my plan', 'Building your plan…');
  }
});

restoreProfile();

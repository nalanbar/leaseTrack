import { todayISO } from './calculations.js';

const STORAGE_KEY = 'leasetrack.v1';

function defaultState() {
  return {
    lease: {
      vehicleName: '',
      startDate: todayISO(),
      termMonths: 36,
      annualMileageAllowance: 15000,
      startOdometer: 0,
      overageRatePerMile: null,
      configured: false,
    },
    entries: [],
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      lease: { ...defaultState().lease, ...parsed.lease },
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export { defaultState };

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function makeEntryId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `e${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

import { loadState, saveState, defaultState, clearState, makeEntryId } from './storage.js';
import { computeStats, todayISO, daysBetween } from './calculations.js';
import { renderChart } from './chart.js';
import { encodeSyncCode, decodeSyncCode } from './sync.js';
import { formatMiles, formatSignedMiles, formatMilesPerDay, formatDate, formatCurrency, formatPercent } from './format.js';

let state = loadState();

const emptyState = document.getElementById('emptyState');
const dashboard = document.getElementById('dashboard');
const vehicleTagline = document.getElementById('vehicleTagline');
const statGrid = document.getElementById('statGrid');
const chartWrap = document.getElementById('chartWrap');
const chartLegend = document.getElementById('chartLegend');
const logTableBody = document.getElementById('logTableBody');
const logEmptyNote = document.getElementById('logEmptyNote');
const entryForm = document.getElementById('entryForm');
const entryDateInput = document.getElementById('entryDate');
const entryOdometerInput = document.getElementById('entryOdometer');
const entryError = document.getElementById('entryError');

const settingsDialog = document.getElementById('settingsDialog');
const settingsForm = document.getElementById('settingsForm');
const settingsError = document.getElementById('settingsError');
const settingsBtn = document.getElementById('settingsBtn');
const emptyStateSettingsBtn = document.getElementById('emptyStateSettingsBtn');
const emptyStateSyncBtn = document.getElementById('emptyStateSyncBtn');
const emptyStateImportBtn = document.getElementById('emptyStateImportBtn');
const cancelSettingsBtn = document.getElementById('cancelSettings');

const vehicleNameInput = document.getElementById('vehicleName');
const startDateInput = document.getElementById('startDate');
const termMonthsInput = document.getElementById('termMonths');
const annualAllowanceInput = document.getElementById('annualAllowance');
const startOdometerInput = document.getElementById('startOdometer');
const overageRateInput = document.getElementById('overageRate');

const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const resetBtn = document.getElementById('resetBtn');

const syncCapacity = document.getElementById('syncCapacity');
const syncCodeOutput = document.getElementById('syncCodeOutput');
const copySyncCodeBtn = document.getElementById('copySyncCodeBtn');
const syncCopiedNote = document.getElementById('syncCopiedNote');
const syncCodeInput = document.getElementById('syncCodeInput');
const loadSyncCodeBtn = document.getElementById('loadSyncCodeBtn');
const syncCodeError = document.getElementById('syncCodeError');

const loadSyncDialog = document.getElementById('loadSyncDialog');
const loadSyncForm = document.getElementById('loadSyncForm');
const loadSyncInput = document.getElementById('loadSyncInput');
const loadSyncError = document.getElementById('loadSyncError');
const cancelLoadSync = document.getElementById('cancelLoadSync');

function persist() {
  saveState(state);
}

function openSettings() {
  const l = state.lease;
  vehicleNameInput.value = l.vehicleName || '';
  startDateInput.value = l.startDate;
  termMonthsInput.value = l.termMonths;
  annualAllowanceInput.value = l.annualMileageAllowance;
  startOdometerInput.value = l.startOdometer;
  overageRateInput.value = l.overageRatePerMile ?? '';
  settingsError.hidden = true;
  settingsDialog.showModal();
}

settingsBtn.addEventListener('click', openSettings);
emptyStateSettingsBtn.addEventListener('click', openSettings);
cancelSettingsBtn.addEventListener('click', () => settingsDialog.close());

function showSettingsError(msg) {
  settingsError.textContent = msg;
  settingsError.hidden = false;
}

settingsForm.addEventListener('submit', (evt) => {
  evt.preventDefault();

  const startDate = startDateInput.value;
  const termMonths = Number(termMonthsInput.value);
  const annualMileageAllowance = Number(annualAllowanceInput.value);
  const startOdometer = Number(startOdometerInput.value);
  const overageRateRaw = overageRateInput.value.trim();
  const overageRatePerMile = overageRateRaw === '' ? null : Number(overageRateRaw);

  if (!startDate || !Number.isFinite(termMonths) || termMonths <= 0
    || !Number.isFinite(annualMileageAllowance) || annualMileageAllowance < 0
    || !Number.isFinite(startOdometer) || startOdometer < 0) {
    showSettingsError('Please fill in all required fields with valid values.');
    return;
  }

  const badEntry = state.entries.find((e) => e.odometer < startOdometer);
  if (badEntry) {
    showSettingsError(`Starting odometer must be at or below your earliest log entry (${formatMiles(badEntry.odometer)} mi on ${formatDate(badEntry.date)}).`);
    return;
  }

  state.lease = {
    vehicleName: vehicleNameInput.value.trim(),
    startDate,
    termMonths,
    annualMileageAllowance,
    startOdometer,
    overageRatePerMile,
    configured: true,
  };
  persist();
  settingsDialog.close();
  render();
});

function showEntryError(msg) {
  entryError.textContent = msg;
  entryError.hidden = false;
}

entryForm.addEventListener('submit', (evt) => {
  evt.preventDefault();
  entryError.hidden = true;

  const date = entryDateInput.value;
  const odometer = Number(entryOdometerInput.value);

  if (!date || !Number.isFinite(odometer)) {
    showEntryError('Enter a date and odometer reading.');
    return;
  }
  if (date < state.lease.startDate) {
    showEntryError(`Date can't be before your lease start (${formatDate(state.lease.startDate)}).`);
    return;
  }
  if (odometer < state.lease.startOdometer) {
    showEntryError(`Odometer can't be less than your starting odometer (${formatMiles(state.lease.startOdometer)} mi).`);
    return;
  }
  if (state.entries.some((e) => e.date === date)) {
    showEntryError('You already have a reading for that date — delete it first or pick another date.');
    return;
  }

  const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
  const before = [...sorted].reverse().find((e) => e.date < date);
  const after = sorted.find((e) => e.date > date);
  if (before && odometer < before.odometer) {
    showEntryError(`Odometer must be at least ${formatMiles(before.odometer)} mi (your reading from ${formatDate(before.date)}).`);
    return;
  }
  if (after && odometer > after.odometer) {
    showEntryError(`Odometer must be at most ${formatMiles(after.odometer)} mi (your reading from ${formatDate(after.date)}).`);
    return;
  }

  state.entries.push({ id: makeEntryId(), date, odometer });
  persist();
  entryOdometerInput.value = '';
  entryDateInput.value = todayISO();
  render();
});

logTableBody.addEventListener('click', (evt) => {
  const btn = evt.target.closest('.row-delete');
  if (!btn) return;
  state.entries = state.entries.filter((e) => e.id !== btn.dataset.id);
  persist();
  render();
});

exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leasetrack-export-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => importFile.click());
emptyStateImportBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.lease || !Array.isArray(parsed.entries)) throw new Error('Unexpected file shape');
    state = { lease: { ...defaultState().lease, ...parsed.lease }, entries: parsed.entries };
    persist();
    render();
  } catch {
    alert("That file doesn't look like a LeaseTrack export.");
  } finally {
    importFile.value = '';
  }
});

resetBtn.addEventListener('click', () => {
  if (!confirm('This permanently deletes your lease settings and mileage log from this browser. Continue?')) return;
  clearState();
  state = defaultState();
  render();
});

function renderSyncCode() {
  const { code, includedCount, totalCount } = encodeSyncCode(state.lease, state.entries);
  syncCodeOutput.value = code;
  if (totalCount === 0) {
    syncCapacity.textContent = 'no readings yet';
  } else if (includedCount === totalCount) {
    syncCapacity.textContent = totalCount === 1 ? 'your 1 reading' : `all ${totalCount} of your readings`;
  } else {
    syncCapacity.textContent = `your ${includedCount} most recent readings (of ${totalCount} total)`;
  }
}

copySyncCodeBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(syncCodeOutput.value);
  } catch {
    syncCodeOutput.select();
    document.execCommand('copy');
  }
  syncCopiedNote.hidden = false;
  clearTimeout(copySyncCodeBtn._hideTimer);
  copySyncCodeBtn._hideTimer = setTimeout(() => { syncCopiedNote.hidden = true; }, 2000);
});

/**
 * Decodes and applies a sync code, replacing the current lease + log.
 * Confirms first only if there's existing configured data to lose.
 * Throws (with a user-facing message) if the code is invalid — callers
 * are responsible for catching and displaying that.
 * @returns {boolean} true if applied, false if the user cancelled.
 */
function applySyncCode(rawCode) {
  const decoded = decodeSyncCode(rawCode);
  if (state.lease.configured) {
    const proceed = confirm('This replaces your current lease settings and mileage log with the ones from this code. Continue?');
    if (!proceed) return false;
  }
  state = { lease: decoded.lease, entries: decoded.entries };
  persist();
  render();
  return true;
}

loadSyncCodeBtn.addEventListener('click', () => {
  syncCodeError.hidden = true;
  try {
    if (applySyncCode(syncCodeInput.value)) {
      syncCodeInput.value = '';
    }
  } catch (err) {
    syncCodeError.textContent = err.message;
    syncCodeError.hidden = false;
  }
});

emptyStateSyncBtn.addEventListener('click', () => {
  loadSyncInput.value = '';
  loadSyncError.hidden = true;
  loadSyncDialog.showModal();
});
cancelLoadSync.addEventListener('click', () => loadSyncDialog.close());

loadSyncForm.addEventListener('submit', (evt) => {
  evt.preventDefault();
  loadSyncError.hidden = true;
  try {
    if (applySyncCode(loadSyncInput.value)) {
      loadSyncDialog.close();
    }
  } catch (err) {
    loadSyncError.textContent = err.message;
    loadSyncError.hidden = false;
  }
});

function statTile({ label, value, sub, delta, deltaStatus, emphasis, meter }) {
  return `
    <div class="stat-tile${emphasis ? ' emphasis' : ''}">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
      ${meter != null ? `<div class="meter"><div class="meter-fill status-${deltaStatus || 'good'}" style="width:${Math.min(100, Math.max(0, meter))}%"></div></div>` : ''}
      ${delta ? `<div class="stat-delta status-${deltaStatus || 'good'}">${delta}</div>` : ''}
    </div>`;
}

function paceLabel(status) {
  switch (status) {
    case 'critical': return 'Ahead of pace';
    case 'warning': return 'Slightly ahead';
    case 'good': return 'On pace';
    default: return 'No data yet';
  }
}

function renderStatGrid(stats) {
  const tiles = [];

  tiles.push(statTile({
    label: 'Miles / day — allowed',
    value: stats.milesPerDayAllowed.toFixed(1),
    sub: `${formatMiles(stats.totalAllowed)} mi over ${stats.termDays.toLocaleString()} days`,
  }));

  tiles.push(statTile({
    label: 'Miles / day — actual',
    value: formatMilesPerDay(stats.milesPerDayActual),
    sub: stats.hasData
      ? `${formatMiles(stats.actualMiles)} mi over ${stats.daysElapsed} day${stats.daysElapsed === 1 ? '' : 's'}`
      : 'No odometer readings yet',
    delta: stats.milesPerDayActual != null
      ? `${stats.milesPerDayActual >= stats.milesPerDayAllowed ? '+' : ''}${(stats.milesPerDayActual - stats.milesPerDayAllowed).toFixed(1)} vs. allowed`
      : null,
    deltaStatus: stats.paceStatus,
  }));

  tiles.push(statTile({
    label: 'Miles / day — remaining budget',
    value: stats.daysRemaining > 0 ? formatMilesPerDay(stats.milesPerDayRemaining) : '—',
    sub: stats.daysRemaining > 0
      ? `${formatSignedMiles(stats.milesRemaining)} mi over ${stats.daysRemaining} day${stats.daysRemaining === 1 ? '' : 's'} left`
      : (stats.leaseEnded ? 'Lease term has ended' : '—'),
    delta: stats.milesRemaining < 0 ? `${formatMiles(Math.abs(stats.milesRemaining))} mi over allowance already` : null,
    deltaStatus: stats.milesRemaining < 0 ? 'critical' : 'good',
  }));

  tiles.push(statTile({
    label: 'Days remaining',
    value: stats.daysRemaining.toLocaleString(),
    sub: `${stats.daysElapsed.toLocaleString()} of ${stats.termDays.toLocaleString()} days elapsed · ends ${formatDate(stats.endDate)}`,
  }));

  tiles.push(statTile({
    label: 'Miles used',
    value: `${formatMiles(stats.actualMiles)} mi`,
    sub: `of ${formatMiles(stats.totalAllowed)} mi allowed (${formatPercent(stats.percentMilesUsed, 1)})`,
    meter: stats.percentMilesUsed,
    deltaStatus: stats.paceStatus === 'none' ? 'good' : stats.paceStatus,
    emphasis: true,
  }));

  tiles.push(statTile({
    label: 'Pace vs. schedule',
    value: paceLabel(stats.paceStatus),
    sub: stats.hasData
      ? `${formatPercent(stats.percentMilesUsed, 1)} of miles used vs. ${formatPercent(stats.percentTermElapsed, 1)} of term elapsed`
      : 'Add a reading to see your pace',
    deltaStatus: stats.paceStatus === 'none' ? 'good' : stats.paceStatus,
  }));

  tiles.push(statTile({
    label: 'Projected ending mileage',
    value: stats.projectedTotalMiles != null ? `${formatMiles(stats.projectedTotalMiles)} mi` : '—',
    sub: stats.projectedTotalMiles != null ? `vs. ${formatMiles(stats.totalAllowed)} mi allowed` : 'Based on your average daily pace',
    delta: stats.projectedOverUnder != null
      ? (stats.projectedOverUnder > 0
        ? `${formatMiles(stats.projectedOverUnder)} mi over at this pace`
        : `${formatMiles(Math.abs(stats.projectedOverUnder))} mi under at this pace`)
      : null,
    deltaStatus: stats.projectedOverUnder > 0 ? 'critical' : 'good',
  }));

  if (state.lease.overageRatePerMile) {
    const cost = stats.estimatedOverageCost ?? 0;
    tiles.push(statTile({
      label: 'Estimated overage cost',
      value: formatCurrency(cost),
      sub: cost > 0
        ? `At ${formatCurrency(state.lease.overageRatePerMile)}/mi if current pace holds`
        : 'No overage projected at current pace',
      deltaStatus: cost > 0 ? 'critical' : 'good',
    }));
  }

  if (stats.recentPace != null) {
    tiles.push(statTile({
      label: 'Recent pace',
      value: `${stats.recentPace.toFixed(1)} mi/day`,
      sub: `Over your last ${stats.recentPaceDays} day${stats.recentPaceDays === 1 ? '' : 's'} between readings`,
      delta: `${stats.recentPace >= stats.milesPerDayAllowed ? '+' : ''}${(stats.recentPace - stats.milesPerDayAllowed).toFixed(1)} vs. allowed`,
      deltaStatus: stats.recentPace > stats.milesPerDayAllowed * 1.1 ? 'critical' : (stats.recentPace > stats.milesPerDayAllowed ? 'warning' : 'good'),
    }));
  }

  statGrid.innerHTML = tiles.join('');
}

function renderLegend() {
  chartLegend.innerHTML = state.entries.length
    ? `<span class="legend-item"><span class="legend-swatch solid"></span>Actual</span>
       <span class="legend-item"><span class="legend-swatch dashed"></span>Allowed pace</span>`
    : '';
}

function renderLogTable() {
  const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
  logEmptyNote.hidden = sorted.length > 0;
  logTableBody.innerHTML = sorted.map((e, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const milesSince = prev ? e.odometer - prev.odometer : e.odometer - state.lease.startOdometer;
    const daysSince = prev ? daysBetween(prev.date, e.date) : daysBetween(state.lease.startDate, e.date);
    const rate = daysSince > 0 ? milesSince / daysSince : null;
    return `<tr>
      <td>${formatDate(e.date)}</td>
      <td>${formatMiles(e.odometer)}</td>
      <td>${formatSignedMiles(milesSince)}</td>
      <td>${daysSince}</td>
      <td>${rate != null ? `${rate.toFixed(1)} mi/day` : '—'}</td>
      <td class="col-actions"><button class="row-delete" data-id="${e.id}" title="Delete reading" aria-label="Delete reading">×</button></td>
    </tr>`;
  }).join('');
}

function render() {
  const configured = !!state.lease.configured;
  emptyState.hidden = configured;
  dashboard.hidden = !configured;
  if (!configured) return;

  vehicleTagline.textContent = state.lease.vehicleName
    ? `${state.lease.vehicleName} · ${state.lease.annualMileageAllowance.toLocaleString()} mi/yr lease`
    : `${state.lease.termMonths}-month lease · ${state.lease.annualMileageAllowance.toLocaleString()} mi/yr`;

  const stats = computeStats(state.lease, state.entries);
  renderStatGrid(stats);
  renderLegend();
  renderChart(chartWrap, { lease: state.lease, stats, entries: state.entries });
  renderLogTable();
  renderSyncCode();
}

entryDateInput.value = todayISO();
render();

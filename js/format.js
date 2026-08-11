export function formatMiles(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function formatSignedMiles(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const rounded = Math.round(n);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('en-US')}`;
}

export function formatMilesPerDay(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

export function formatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function formatShortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatCurrency(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function formatPercent(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

// Pure date/mileage math for the lease dashboard. No DOM access here.

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toUTC(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function addDays(dateStr, days) {
  return new Date(toUTC(dateStr).getTime() + days * 86400000).toISOString().slice(0, 10);
}

export function addMonths(dateStr, months) {
  const d = toUTC(dateStr);
  const result = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + Math.round(months),
    d.getUTCDate()
  ));
  return result.toISOString().slice(0, 10);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {{startDate:string, termMonths:number, annualMileageAllowance:number,
 *          startOdometer:number, overageRatePerMile:?number}} lease
 * @param {{date:string, odometer:number}[]} entries
 */
export function computeStats(lease, entries) {
  const { startDate, termMonths, annualMileageAllowance, startOdometer, overageRatePerMile } = lease;

  const endDate = addMonths(startDate, termMonths);
  const termDays = Math.max(1, daysBetween(startDate, endDate));
  const today = todayISO();
  const daysElapsed = clamp(daysBetween(startDate, today), 0, termDays);
  const daysRemaining = termDays - daysElapsed;
  const leaseNotStarted = today < startDate;
  const leaseEnded = today >= endDate;

  const totalAllowed = annualMileageAllowance * (termMonths / 12);
  const milesPerDayAllowed = totalAllowed / termDays;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] || null;
  const hasData = !!latest;
  const actualMiles = hasData ? Math.max(0, latest.odometer - startOdometer) : 0;

  // Days the odometer data itself actually covers — i.e. as of your latest
  // reading, not as of today. Using `daysElapsed` (today-based) here would
  // silently assume zero miles were driven on any day since your last
  // logged reading, understating your real pace whenever readings lag
  // behind today, then producing a confusing jump once you catch up.
  // Capped at daysElapsed as a safety bound against a future-dated entry.
  const daysAsOfLatest = hasData ? Math.min(clamp(daysBetween(startDate, latest.date), 0, termDays), daysElapsed) : 0;

  const milesPerDayActual = (hasData && daysAsOfLatest > 0) ? actualMiles / daysAsOfLatest : null;

  const milesRemaining = totalAllowed - actualMiles;
  const milesPerDayRemaining = (daysRemaining > 0) ? milesRemaining / daysRemaining : null;

  let recentPace = null;
  let recentPaceDays = null;
  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const days = daysBetween(prev.date, latest.date);
    if (days > 0) {
      recentPace = (latest.odometer - prev.odometer) / days;
      recentPaceDays = days;
    }
  }

  const projectedTotalMiles = milesPerDayActual != null ? milesPerDayActual * termDays : null;
  const projectedOverUnder = projectedTotalMiles != null ? projectedTotalMiles - totalAllowed : null;
  const estimatedOverageCost = (overageRatePerMile && projectedOverUnder != null && projectedOverUnder > 0)
    ? projectedOverUnder * overageRatePerMile
    : null;

  const percentTermElapsed = (daysElapsed / termDays) * 100;
  const percentMilesUsed = totalAllowed > 0 ? (actualMiles / totalAllowed) * 100 : 0;
  const paceDeltaPct = percentMilesUsed - percentTermElapsed;

  let paceStatus = 'none';
  if (hasData) {
    if (paceDeltaPct > 10) paceStatus = 'critical';
    else if (paceDeltaPct > 3) paceStatus = 'warning';
    else paceStatus = 'good';
  }

  return {
    endDate,
    termDays,
    today,
    daysElapsed,
    daysRemaining,
    leaseNotStarted,
    leaseEnded,
    totalAllowed,
    milesPerDayAllowed,
    hasData,
    latestEntry: latest,
    actualMiles,
    daysAsOfLatest,
    milesPerDayActual,
    milesRemaining,
    milesPerDayRemaining,
    recentPace,
    recentPaceDays,
    projectedTotalMiles,
    projectedOverUnder,
    estimatedOverageCost,
    percentTermElapsed,
    percentMilesUsed,
    paceDeltaPct,
    paceStatus,
  };
}

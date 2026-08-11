import { daysBetween } from './calculations.js';
import { formatMiles, formatDate } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VB_W = 880;
const VB_H = 300;
const PAD = { top: 16, right: 16, bottom: 34, left: 56 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

function niceCeil(x) {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const base = Math.pow(10, exp);
  const norm = x / base;
  let niceNorm;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 5) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * base;
}

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function renderChart(container, { lease, stats, entries }) {
  container.innerHTML = '';

  if (!entries.length) {
    const note = document.createElement('p');
    note.className = 'empty-chart-note';
    note.textContent = 'Add an odometer reading to see your mileage pace chart.';
    container.appendChild(note);
    return;
  }

  const { startDate } = lease;
  const { endDate, termDays, totalAllowed, milesPerDayAllowed, today } = stats;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const points = [{ date: startDate, miles: 0 }];
  for (const e of sorted) {
    const miles = Math.max(0, e.odometer - lease.startOdometer);
    points.push({ date: e.date, miles });
  }
  const actualMax = points[points.length - 1].miles;

  const yMax = niceCeil(Math.max(totalAllowed, actualMax) * 1.02);

  const dayOffset = (dateStr) => Math.min(termDays, Math.max(0, daysBetween(startDate, dateStr)));
  const xScale = (dateStr) => PAD.left + (dayOffset(dateStr) / termDays) * PLOT_W;
  const yScale = (miles) => PAD.top + PLOT_H - (Math.min(miles, yMax) / yMax) * PLOT_H;

  const svg = el('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, role: 'img', 'aria-label': 'Mileage driven vs. lease allowance over time' });

  // Gridlines + y ticks
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const v = (yMax / tickCount) * i;
    const y = yScale(v);
    svg.appendChild(el('line', {
      x1: PAD.left, x2: PAD.left + PLOT_W, y1: y, y2: y,
      stroke: 'var(--gridline)', 'stroke-width': 1,
    }));
    const label = el('text', {
      x: PAD.left - 8, y: y + 4, 'text-anchor': 'end',
      fill: 'var(--text-muted)', 'font-size': 11,
    });
    label.textContent = formatMiles(v);
    svg.appendChild(label);
  }

  // Baseline axis
  svg.appendChild(el('line', {
    x1: PAD.left, x2: PAD.left + PLOT_W, y1: PAD.top + PLOT_H, y2: PAD.top + PLOT_H,
    stroke: 'var(--baseline)', 'stroke-width': 1,
  }));

  // X labels: start, today (if in range), end
  const xLabels = [{ date: startDate, anchor: 'start' }];
  if (today > startDate && today < endDate) xLabels.push({ date: today, anchor: 'middle' });
  xLabels.push({ date: endDate, anchor: 'end' });
  for (const { date, anchor } of xLabels) {
    const x = xScale(date);
    const label = el('text', {
      x, y: PAD.top + PLOT_H + 20, 'text-anchor': anchor,
      fill: 'var(--text-muted)', 'font-size': 11,
    });
    label.textContent = formatDate(date);
    svg.appendChild(label);
  }

  // Today marker
  if (today >= startDate && today <= endDate) {
    const x = xScale(today);
    svg.appendChild(el('line', {
      x1: x, x2: x, y1: PAD.top, y2: PAD.top + PLOT_H,
      stroke: 'var(--gridline)', 'stroke-width': 1, 'stroke-dasharray': '2 3',
    }));
  }

  // Allowed-pace target line (dashed, neutral)
  svg.appendChild(el('line', {
    x1: xScale(startDate), y1: yScale(0),
    x2: xScale(endDate), y2: yScale(totalAllowed),
    stroke: 'var(--baseline)', 'stroke-width': 2, 'stroke-dasharray': '5 5',
    'stroke-linecap': 'round',
  }));

  // Actual line
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.date)},${yScale(p.miles)}`).join(' ');
  svg.appendChild(el('path', {
    d: pathD, fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));

  // Markers on actual readings (skip synthetic start point if it duplicates first entry date)
  const markerPoints = points.slice(sorted.length && points[0].date === sorted[0].date ? 1 : 0);
  for (const p of markerPoints) {
    svg.appendChild(el('circle', {
      cx: xScale(p.date), cy: yScale(p.miles), r: 4,
      fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2,
    }));
  }

  // Hover layer
  const crosshair = el('line', {
    x1: 0, x2: 0, y1: PAD.top, y2: PAD.top + PLOT_H,
    stroke: 'var(--text-muted)', 'stroke-width': 1, opacity: 0,
  });
  svg.appendChild(crosshair);
  const hoverDot = el('circle', { r: 5, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2, opacity: 0 });
  svg.appendChild(hoverDot);

  const hitRect = el('rect', {
    x: PAD.left, y: PAD.top, width: PLOT_W, height: PLOT_H,
    fill: 'transparent',
  });
  svg.appendChild(hitRect);

  container.appendChild(svg);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  container.appendChild(tooltip);

  function nearestPoint(dateGuess) {
    let best = points[0];
    let bestDiff = Infinity;
    for (const p of points) {
      const diff = Math.abs(daysBetween(p.date, dateGuess));
      if (diff < bestDiff) { bestDiff = diff; best = p; }
    }
    return best;
  }

  function onMove(evt) {
    const rect = svg.getBoundingClientRect();
    const relX = (evt.clientX - rect.left) / rect.width;
    const svgX = relX * VB_W;
    const frac = Math.min(1, Math.max(0, (svgX - PAD.left) / PLOT_W));
    const guessDate = new Date(new Date(`${startDate}T00:00:00Z`).getTime() + frac * termDays * 86400000)
      .toISOString().slice(0, 10);
    const p = nearestPoint(guessDate);
    const px = xScale(p.date);
    const py = yScale(p.miles);
    crosshair.setAttribute('x1', px);
    crosshair.setAttribute('x2', px);
    crosshair.setAttribute('opacity', 1);
    hoverDot.setAttribute('cx', px);
    hoverDot.setAttribute('cy', py);
    hoverDot.setAttribute('opacity', 1);

    const targetMiles = milesPerDayAllowed * dayOffset(p.date);
    const delta = p.miles - targetMiles;
    tooltip.innerHTML = `
      <div class="tt-date">${formatDate(p.date)}</div>
      <div class="tt-row"><span class="k">Miles driven</span><span class="v">${formatMiles(p.miles)}</span></div>
      <div class="tt-row"><span class="k">Allowed by now</span><span class="v">${formatMiles(targetMiles)}</span></div>
      <div class="tt-row"><span class="k">Vs. pace</span><span class="v">${delta >= 0 ? '+' : ''}${formatMiles(delta)}</span></div>
    `;
    const pxPixels = (px / VB_W) * rect.width;
    const pyPixels = (py / VB_H) * rect.height;
    tooltip.style.left = `${pxPixels}px`;
    tooltip.style.top = `${pyPixels}px`;
    tooltip.classList.add('visible');
  }

  function onLeave() {
    crosshair.setAttribute('opacity', 0);
    hoverDot.setAttribute('opacity', 0);
    tooltip.classList.remove('visible');
  }

  hitRect.addEventListener('pointermove', onMove);
  hitRect.addEventListener('pointerleave', onLeave);
}

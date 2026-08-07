export const fmtUSD = (n) =>
  n == null || isNaN(n)
    ? '-'
    : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtNum = (n, d = 2) => (n == null || isNaN(n) ? '-' : Number(n).toFixed(d));

export const fmtR = (n) => (n == null || isNaN(n) ? '-' : (n > 0 ? '+' : '') + Number(n).toFixed(2) + 'R');

export const pnlClass = (n) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// Compute aggregate stats from a list of decorated trades.
export function computeStats(trades) {
  const closed = trades.filter((t) => t.resultDollars != null);
  const n = closed.length;
  const wins = closed.filter((t) => t.resultDollars > 0);
  const losses = closed.filter((t) => t.resultDollars < 0);
  const grossWin = wins.reduce((s, t) => s + t.resultDollars, 0);
  const grossLoss = losses.reduce((s, t) => s + t.resultDollars, 0); // negative
  const totalPnl = closed.reduce((s, t) => s + t.resultDollars, 0);
  const rs = closed.filter((t) => t.rMultiple != null).map((t) => t.rMultiple);
  return {
    count: n,
    totalPnl,
    winRate: n ? (wins.length / n) * 100 : 0,
    winCount: wins.length,
    lossCount: losses.length,
    profitFactor: grossLoss !== 0 ? grossWin / Math.abs(grossLoss) : (grossWin > 0 ? Infinity : 0),
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.resultDollars)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.resultDollars)) : 0,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    expectancy: n ? totalPnl / n : 0,
  };
}

// Closed trades ordered chronologically (oldest -> newest).
function closedChrono(trades) {
  return trades
    .filter((t) => t.resultDollars != null)
    .slice()
    .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
}

// Build equity curve points ordered chronologically (oldest -> newest).
export function equitySeries(trades) {
  let cum = 0;
  return closedChrono(trades).map((t, i) => {
    cum += t.resultDollars;
    return { i: i + 1, equity: +cum.toFixed(2), label: t.date || '', pnl: t.resultDollars };
  });
}

// Order-sensitive stats: max drawdown, win/loss streaks, best and worst day.
export function riskStats(trades) {
  const closed = closedChrono(trades);
  let equity = 0, peak = 0, maxDrawdown = 0;
  let winStreak = 0, lossStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
  const byDay = {};
  for (const t of closed) {
    equity += t.resultDollars;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDrawdown) maxDrawdown = peak - equity;
    if (t.resultDollars > 0) { winStreak++; lossStreak = 0; }
    else if (t.resultDollars < 0) { lossStreak++; winStreak = 0; }
    else { winStreak = 0; lossStreak = 0; }
    if (winStreak > maxWinStreak) maxWinStreak = winStreak;
    if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
    const d = t.date || 'Unknown';
    byDay[d] = +((byDay[d] || 0) + t.resultDollars).toFixed(2);
  }
  let bestDay = null, worstDay = null;
  for (const [date, pnl] of Object.entries(byDay)) {
    if (!bestDay || pnl > bestDay.pnl) bestDay = { date, pnl };
    if (!worstDay || pnl < worstDay.pnl) worstDay = { date, pnl };
  }
  return {
    maxDrawdown: +maxDrawdown.toFixed(2),
    maxWinStreak, maxLossStreak,
    currentWinStreak: winStreak, currentLossStreak: lossStreak,
    bestDay, worstDay,
  };
}

// "HH:MM" -> "09:00–10:00" bucket, or null when the trade has no time.
export function hourBucket(time) {
  const m = /^(\d{1,2}):/.exec(String(time || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (h < 0 || h > 23) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:00–${pad((h + 1) % 24)}:00`;
}

export const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_BY_INDEX = ['Sunday', ...WEEKDAY_ORDER.slice(0, 6)];

// "YYYY-MM-DD" -> weekday name, or null when the date is missing/invalid.
export function weekdayName(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  if (!m) return null;
  return WEEKDAY_BY_INDEX[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
}

// Bucket R-multiples into fixed-width bins for the distribution chart.
// Outliers beyond ±clampR land in the outermost bins.
export function rHistogram(trades, step = 0.5, clampR = 5) {
  const rs = trades.filter((t) => t.rMultiple != null).map((t) => t.rMultiple);
  if (!rs.length) return [];
  const maxIdx = Math.round(clampR / step);
  const counts = new Map();
  for (const r of rs) {
    const idx = Math.min(maxIdx - 1, Math.max(-maxIdx, Math.floor(r / step)));
    counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  const idxs = [...counts.keys()];
  const lo = Math.min(...idxs), hi = Math.max(...idxs);
  const fmtEdge = (v) => (v > 0 ? '+' : '') + (Number.isInteger(v) ? v : v.toFixed(1)) + 'R';
  const bins = [];
  for (let i = lo; i <= hi; i++) {
    const from = +(i * step).toFixed(2), to = +((i + 1) * step).toFixed(2);
    const range = i === -maxIdx ? `≤ ${fmtEdge(to)}` : i === maxIdx - 1 ? `≥ ${fmtEdge(from)}` : `${fmtEdge(from)} to ${fmtEdge(to)}`;
    bins.push({ label: fmtEdge(from), from, to, range, count: counts.get(i) || 0 });
  }
  return bins;
}

// Group by a key, returning per-group stats.
export function groupStats(trades, keyFn) {
  const groups = {};
  for (const t of trades) {
    const k = keyFn(t) || 'Unspecified';
    (groups[k] = groups[k] || []).push(t);
  }
  return Object.entries(groups)
    .map(([k, arr]) => ({ key: k, ...computeStats(arr) }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}

export const SESSIONS = ['London', 'NY', 'Asia'];
export const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_PV = { NQ: 20, ES: 50, MNQ: 2, MES: 5 };
export const defaultPointValue = (sym) => DEFAULT_PV[String(sym || '').toUpperCase()] ?? 1;

// Client-side preview of the same metrics the server computes.
export function previewMetrics(t) {
  const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const entry = n(t.entry), exit = n(t.exit), stop = n(t.stopLoss);
  const contracts = n(t.contracts) || 0;
  const pv = n(t.pointValue) || defaultPointValue(t.symbol);
  const comm = n(t.commissions) || 0;
  const dir = t.direction === 'short' ? -1 : 1;
  let points = null, dollars = null, r = null, risk = null;
  if (entry != null && exit != null) {
    points = +(dir * (exit - entry)).toFixed(4);
    dollars = +(points * pv * contracts - comm).toFixed(2);
  }
  if (stop != null && entry != null && contracts > 0) {
    risk = Math.abs(entry - stop) * pv * contracts;
    if (risk > 0 && dollars != null) r = +(dollars / risk).toFixed(2);
  }
  return { points, dollars, r, risk, pv };
}

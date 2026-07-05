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

// Build equity curve points ordered chronologically (oldest -> newest).
export function equitySeries(trades) {
  const closed = trades
    .filter((t) => t.resultDollars != null)
    .slice()
    .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  let cum = 0;
  return closed.map((t, i) => {
    cum += t.resultDollars;
    return { i: i + 1, equity: +cum.toFixed(2), label: t.date || '', pnl: t.resultDollars };
  });
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

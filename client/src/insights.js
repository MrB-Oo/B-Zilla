// Turn the analytics breakdowns into plain-English observations.
// Slices with too few trades stay silent so one lucky trade can't
// masquerade as an edge.
import { computeStats, groupStats, hourBucket, weekdayName, fmtUSD } from './helpers.js';

const MIN_TOTAL = 5; // closed trades needed before any insight is shown
const MIN_SLICE = 3; // closed trades a slice needs to be cited

const usable = (rows) => rows.filter((r) => r.key !== 'Unspecified' && r.count >= MIN_SLICE);

// Share of total profits contributed by the best slice, when it's meaningful
// (more than one profitable slice, and not the trivial 100%).
function profitShare(rows, best) {
  const posSum = rows.filter((r) => r.totalPnl > 0).reduce((s, r) => s + r.totalPnl, 0);
  if (posSum <= 0 || best.totalPnl <= 0) return null;
  const pct = Math.round((best.totalPnl / posSum) * 100);
  return pct > 0 && pct < 100 ? pct : null;
}

const statsTxt = (r) => `${fmtUSD(r.totalPnl)} across ${r.count} trades (${Math.round(r.winRate)}% win rate)`;

export function buildInsights(trades) {
  const closed = trades.filter((t) => t.resultDollars != null);
  if (closed.length < MIN_TOTAL) return [];
  const overall = computeStats(closed);
  const out = [];

  // Time of day
  const byHour = usable(groupStats(closed, (t) => hourBucket(t.time)));
  if (byHour.length >= 2) {
    const best = byHour[0], worst = byHour[byHour.length - 1];
    if (best.totalPnl > 0) {
      const share = profitShare(byHour, best);
      out.push({
        tone: 'pos',
        text: share != null
          ? `${share}% of your profits come from the ${best.key} window: ${statsTxt(best)}.`
          : `The ${best.key} window is your most profitable: ${statsTxt(best)}.`,
      });
    }
    if (worst.totalPnl < 0) {
      out.push({ tone: 'neg', text: `The ${worst.key} window is costing you money: ${statsTxt(worst)}.` });
    }
  }

  // Weekday
  const byDay = usable(groupStats(closed, (t) => weekdayName(t.date)));
  if (byDay.length >= 2) {
    const best = byDay[0], worst = byDay[byDay.length - 1];
    if (best.totalPnl > 0) {
      const share = profitShare(byDay, best);
      out.push({
        tone: 'pos',
        text: share != null
          ? `${best.key} accounts for ${share}% of your profits: ${statsTxt(best)}.`
          : `${best.key} is your strongest day: ${statsTxt(best)}.`,
      });
    }
    if (worst.totalPnl < 0) {
      out.push({ tone: 'neg', text: `${worst.key} is your weakest day: ${statsTxt(worst)}.` });
    }
  }

  // Session win rate vs overall
  const bySession = usable(groupStats(closed, (t) => t.session));
  if (bySession.length >= 2) {
    const topWr = bySession.slice().sort((a, b) => b.winRate - a.winRate)[0];
    if (topWr.winRate - overall.winRate >= 10) {
      out.push({
        tone: 'pos',
        text: `You win ${Math.round(topWr.winRate)}% of trades in the ${topWr.key} session vs ${Math.round(overall.winRate)}% overall.`,
      });
    }
  }

  // Setup
  const bySetup = usable(groupStats(closed, (t) => t.setup));
  if (bySetup.length >= 2) {
    const best = bySetup[0], worst = bySetup[bySetup.length - 1];
    if (best.totalPnl > 0) {
      out.push({ tone: 'pos', text: `Your best setup is “${best.key}”: ${statsTxt(best)}.` });
    }
    if (worst.totalPnl < 0) {
      out.push({ tone: 'neg', text: `“${worst.key}” is a losing setup: ${statsTxt(worst)} — worth a review.` });
    }
  }

  // Direction skew
  const byDir = usable(groupStats(closed, (t) => (t.direction === 'short' ? 'short' : 'long')));
  if (byDir.length === 2 && byDir[0].totalPnl > 0 && byDir[1].totalPnl < 0) {
    const [win, lose] = byDir;
    out.push({
      tone: 'neg',
      text: `${win.key === 'long' ? 'Longs' : 'Shorts'} are making you money (${fmtUSD(win.totalPnl)}) while ${lose.key === 'long' ? 'longs' : 'shorts'} are losing (${fmtUSD(lose.totalPnl)}).`,
    });
  }

  return out.slice(0, 8);
}

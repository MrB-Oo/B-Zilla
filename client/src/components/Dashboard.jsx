import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { computeStats, equitySeries, fmtUSD, fmtNum, pnlClass } from '../helpers.js';

function Stat({ label, value, sub, cls }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className={'value ' + (cls || '')}>{value}</div>
      {sub != null && <div className="sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ trades }) {
  const s = computeStats(trades);
  const eq = equitySeries(trades);
  const pf = s.profitFactor === Infinity ? '∞' : fmtNum(s.profitFactor, 2);

  if (!trades.length) {
    return <div className="empty-state">No trades match the current filters. Add a trade to get started.</div>;
  }

  return (
    <div>
      <div className="grid stat-grid">
        <Stat label="Total P&L" value={fmtUSD(s.totalPnl)} cls={pnlClass(s.totalPnl)} sub={`${s.count} trades`} />
        <Stat label="Win rate" value={fmtNum(s.winRate, 1) + '%'} sub={`${s.winCount}W / ${s.lossCount}L`} />
        <Stat label="Profit factor" value={pf} />
        <Stat label="Expectancy / trade" value={fmtUSD(s.expectancy)} cls={pnlClass(s.expectancy)} sub={s.avgR != null ? `avg ${fmtNum(s.avgR, 2)}R` : null} />
        <Stat label="Avg win" value={fmtUSD(s.avgWin)} cls="pos" />
        <Stat label="Avg loss" value={fmtUSD(s.avgLoss)} cls="neg" />
        <Stat label="Largest win" value={fmtUSD(s.largestWin)} cls="pos" />
        <Stat label="Largest loss" value={fmtUSD(s.largestLoss)} cls="neg" />
      </div>

      <div className="section-title">Equity curve</div>
      <div className="card">
        {eq.length ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={eq} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#262d3a" strokeDasharray="3 3" />
              <XAxis dataKey="i" stroke="#8b98a9" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8b98a9" tick={{ fontSize: 11 }} tickFormatter={(v) => '$' + v.toLocaleString()} width={70} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #262d3a', borderRadius: 8, color: '#e6edf3' }}
                formatter={(v) => [fmtUSD(v), 'Equity']}
                labelFormatter={(l) => 'Trade #' + l}
              />
              <ReferenceLine y={0} stroke="#8b98a9" />
              <Line type="monotone" dataKey="equity" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="hint">No closed trades yet.</div>}
      </div>
    </div>
  );
}

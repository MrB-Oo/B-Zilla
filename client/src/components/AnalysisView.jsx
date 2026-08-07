import React from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { groupStats, hourBucket, weekdayName, WEEKDAY_ORDER, rHistogram, fmtUSD, fmtNum, pnlClass } from '../helpers.js';
import { buildInsights } from '../insights.js';

function Table({ title, rows }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="section-title">{title}</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{title.replace('By ', '')}</th>
              <th className="num">Trades</th>
              <th className="num">Win %</th>
              <th className="num">P&L</th>
              <th className="num">Profit factor</th>
              <th className="num">Avg R</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><span className="tag">{r.key}</span></td>
                <td className="num">{r.count}</td>
                <td className="num">{fmtNum(r.winRate, 1)}%</td>
                <td className={'num ' + pnlClass(r.totalPnl)}>{fmtUSD(r.totalPnl)}</td>
                <td className="num">{r.profitFactor === Infinity ? '∞' : fmtNum(r.profitFactor, 2)}</td>
                <td className={'num ' + pnlClass(r.avgR)}>{r.avgR == null ? '-' : fmtNum(r.avgR, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Insights({ trades }) {
  const items = buildInsights(trades);
  if (!items.length) return null;
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h3>Insights</h3>
      <ul className="insights">
        {items.map((ins, i) => <li key={i} className={ins.tone}>{ins.text}</li>)}
      </ul>
    </div>
  );
}

function RDistribution({ trades }) {
  const bins = rHistogram(trades);
  if (!bins.length) return null;
  const withR = trades.filter((t) => t.rMultiple != null).length;
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="section-title">R-multiple distribution</div>
      <div className="card">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={bins} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#262d3a" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#8b98a9" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} stroke="#8b98a9" tick={{ fontSize: 11 }} width={40} />
            <Tooltip
              contentStyle={{ background: '#161b22', border: '1px solid #262d3a', borderRadius: 8, color: '#e6edf3' }}
              formatter={(v) => [v, 'Trades']}
              labelFormatter={(l, payload) => payload?.[0]?.payload?.range || l}
              cursor={{ fill: 'rgba(139,152,169,0.08)' }}
            />
            <Bar dataKey="count">
              {bins.map((b) => <Cell key={b.label} fill={b.from < 0 ? '#ef4444' : '#22c55e'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="hint" style={{ marginTop: 8 }}>
          {withR} trades with a defined risk (entry + stop). Bins of 0.5R.
        </div>
      </div>
    </div>
  );
}

export default function AnalysisView({ trades }) {
  if (!trades.length) return <div className="empty-state">No trades match the current filters.</div>;
  const byHour = groupStats(trades, (t) => hourBucket(t.time))
    .sort((a, b) => a.key.localeCompare(b.key));
  const dayOrder = [...WEEKDAY_ORDER, 'Unspecified'];
  const byWeekday = groupStats(trades, (t) => weekdayName(t.date))
    .sort((a, b) => dayOrder.indexOf(a.key) - dayOrder.indexOf(b.key));
  return (
    <div>
      <Insights trades={trades} />
      <RDistribution trades={trades} />
      <Table title="By time of day" rows={byHour} />
      <Table title="By weekday" rows={byWeekday} />
      <Table title="By symbol" rows={groupStats(trades, (t) => t.symbol)} />
      <Table title="By setup" rows={groupStats(trades, (t) => t.setup)} />
      <Table title="By session" rows={groupStats(trades, (t) => t.session)} />
      <Table title="By direction" rows={groupStats(trades, (t) => (t.direction === 'short' ? 'Short' : 'Long'))} />
    </div>
  );
}

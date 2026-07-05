import React from 'react';
import { groupStats, fmtUSD, fmtNum, pnlClass } from '../helpers.js';

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

export default function AnalysisView({ trades }) {
  if (!trades.length) return <div className="empty-state">No trades match the current filters.</div>;
  return (
    <div>
      <Table title="By symbol" rows={groupStats(trades, (t) => t.symbol)} />
      <Table title="By setup" rows={groupStats(trades, (t) => t.setup)} />
      <Table title="By session" rows={groupStats(trades, (t) => t.session)} />
      <Table title="By direction" rows={groupStats(trades, (t) => (t.direction === 'short' ? 'Short' : 'Long'))} />
    </div>
  );
}

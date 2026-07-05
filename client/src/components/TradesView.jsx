import React, { useState, useMemo } from 'react';
import { fmtUSD, fmtNum, fmtR, pnlClass } from '../helpers.js';

const COLS = [
  ['date', 'Date'], ['time', 'Time'], ['symbol', 'Symbol'], ['direction', 'Dir'],
  ['entry', 'Entry'], ['exit', 'Exit'], ['contracts', 'Qty'],
  ['resultPoints', 'Pts'], ['resultDollars', 'P&L'], ['rMultiple', 'R'],
  ['setup', 'Setup'], ['session', 'Session'],
];

export default function TradesView({ trades, onEdit, onDelete }) {
  const [sortKey, setSortKey] = useState('date');
  const [dir, setDir] = useState('desc');

  const sorted = useMemo(() => {
    const arr = trades.slice();
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'date') { av = (a.date || '') + (a.time || ''); bv = (b.date || '') + (b.time || ''); }
      if (typeof av === 'number' || typeof bv === 'number') { av = av ?? -Infinity; bv = bv ?? -Infinity; return dir === 'asc' ? av - bv : bv - av; }
      av = (av || '').toString(); bv = (bv || '').toString();
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [trades, sortKey, dir]);

  function sortBy(k) {
    if (k === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setDir('desc'); }
  }

  if (!trades.length) return <div className="empty-state">No trades match the current filters.</div>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLS.map(([k, label]) => (
              <th key={k} className={['entry','exit','contracts','resultPoints','resultDollars','rMultiple'].includes(k) ? 'num' : ''} onClick={() => sortBy(k)}>
                {label}{sortKey === k ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th>📷</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.id}>
              <td>{t.date}</td>
              <td>{t.time || '-'}</td>
              <td><span className="tag">{t.symbol}</span></td>
              <td><span className={'pill ' + t.direction}>{t.direction === 'short' ? 'Short' : 'Long'}</span></td>
              <td className="num">{fmtNum(t.entry, 2)}</td>
              <td className="num">{fmtNum(t.exit, 2)}</td>
              <td className="num">{t.contracts ?? '-'}</td>
              <td className={'num ' + pnlClass(t.resultPoints)}>{fmtNum(t.resultPoints, 2)}</td>
              <td className={'num ' + pnlClass(t.resultDollars)}>{fmtUSD(t.resultDollars)}</td>
              <td className={'num ' + pnlClass(t.rMultiple)}>{t.rMultiple == null ? '-' : fmtR(t.rMultiple)}</td>
              <td>{t.setup ? <span className="tag">{t.setup}</span> : '-'}</td>
              <td>{t.session || '-'}</td>
              <td>{(t.screenshots || []).length || ''}</td>
              <td>
                <div className="row-actions">
                  <button className="btn ghost sm" onClick={() => onEdit(t)}>Edit</button>
                  <button className="btn danger sm" onClick={() => onDelete(t)}>Del</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

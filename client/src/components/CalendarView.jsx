import React, { useState } from 'react';
import { fmtUSD, pnlClass } from '../helpers.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarView({ trades }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // aggregate P&L per day
  const byDay = {};
  for (const t of trades) {
    if (!t.date || t.resultDollars == null) continue;
    const d = byDay[t.date] || { pnl: 0, count: 0 };
    d.pnl += t.resultDollars; d.count += 1;
    byDay[t.date] = d;
  }

  const first = new Date(cursor.y, cursor.m, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const monthName = first.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ d, iso, data: byDay[iso] });
  }

  let monthTotal = 0, monthDays = 0;
  Object.entries(byDay).forEach(([iso, v]) => {
    if (iso.startsWith(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`)) { monthTotal += v.pnl; monthDays++; }
  });

  const shift = (delta) => setCursor((c) => {
    let m = c.m + delta, y = c.y;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    return { y, m };
  });

  return (
    <div>
      <div className="cal-head">
        <button className="btn ghost sm" onClick={() => shift(-1)}>← Prev</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{monthName}</div>
          <div className={'hint ' + pnlClass(monthTotal)}>{fmtUSD(monthTotal)} · {monthDays} trading days</div>
        </div>
        <button className="btn ghost sm" onClick={() => shift(1)}>Next →</button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="cal-cell empty" />;
          const cls = c.data ? (c.data.pnl > 0 ? 'win' : c.data.pnl < 0 ? 'loss' : '') : '';
          return (
            <div key={i} className={'cal-cell ' + cls}>
              <div className="d">{c.d}</div>
              {c.data && <>
                <div className={'p ' + pnlClass(c.data.pnl)}>{fmtUSD(c.data.pnl)}</div>
                <div className="c">{c.data.count} trade{c.data.count > 1 ? 's' : ''}</div>
              </>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

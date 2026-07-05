import React from 'react';
import { SESSIONS } from '../helpers.js';

export default function Filters({ trades, filters, setFilters }) {
  const symbols = Array.from(new Set(trades.map((t) => t.symbol).filter(Boolean))).sort();
  const setups = Array.from(new Set(trades.map((t) => t.setup).filter(Boolean))).sort();
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const active = filters.symbol || filters.setup || filters.session || filters.direction || filters.from || filters.to;

  return (
    <div className="filters">
      <div className="field">
        <label>Symbol</label>
        <select value={filters.symbol} onChange={(e) => set('symbol', e.target.value)}>
          <option value="">All</option>
          {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Setup</label>
        <select value={filters.setup} onChange={(e) => set('setup', e.target.value)}>
          <option value="">All</option>
          {setups.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Session</label>
        <select value={filters.session} onChange={(e) => set('session', e.target.value)}>
          <option value="">All</option>
          {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Direction</label>
        <select value={filters.direction} onChange={(e) => set('direction', e.target.value)}>
          <option value="">All</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
      </div>
      <div className="field">
        <label>From</label>
        <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
      </div>
      <div className="field">
        <label>To</label>
        <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
      </div>
      {active ? <button className="btn ghost" onClick={() => setFilters({ symbol: '', setup: '', session: '', direction: '', from: '', to: '' })}>Clear</button> : null}
    </div>
  );
}

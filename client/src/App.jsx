import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from './api.js';
import Filters from './components/Filters.jsx';
import Dashboard from './components/Dashboard.jsx';
import TradesView from './components/TradesView.jsx';
import TradeForm from './components/TradeForm.jsx';
import CalendarView from './components/CalendarView.jsx';
import AnalysisView from './components/AnalysisView.jsx';
import DataView from './components/DataView.jsx';

const TABS = [
  ['dashboard', 'Dashboard'],
  ['trades', 'Trades'],
  ['calendar', 'Calendar'],
  ['analysis', 'Analysis'],
  ['data', 'Data'],
];

const emptyFilters = { symbol: '', setup: '', session: '', direction: '', from: '', to: '' };

export default function App() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [filters, setFilters] = useState(emptyFilters);
  const [editing, setEditing] = useState(null); // trade object or {} for new
  const [toast, setToast] = useState(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const t = await api.listTrades();
      setTrades(t);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => trades.filter((t) => {
    if (filters.symbol && t.symbol !== filters.symbol) return false;
    if (filters.setup && t.setup !== filters.setup) return false;
    if (filters.session && t.session !== filters.session) return false;
    if (filters.direction && t.direction !== filters.direction) return false;
    if (filters.from && (t.date || '') < filters.from) return false;
    if (filters.to && (t.date || '') > filters.to) return false;
    return true;
  }), [trades, filters]);

  async function del(t) {
    if (!confirm(`Delete this ${t.symbol} trade from ${t.date}?`)) return;
    try {
      await api.deleteTrade(t.id);
      notify('Trade deleted');
      load();
    } catch (e) { notify('Delete failed: ' + e.message); }
  }

  const showFilters = tab !== 'data';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="z">◤</span> Trade<span className="z">zilla</span> <span className="full muted" style={{ fontWeight: 400, fontSize: 13 }}>Journal</span></div>
        <nav className="nav">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing({})}>+ New trade</button>
      </header>

      <main className="content">
        {error && <div className="card" style={{ borderColor: 'var(--neg)', marginBottom: 16 }}>
          Could not load your data: {error}. This app stores data in your browser (IndexedDB) — private browsing modes may block it.
        </div>}
        {loading ? <div className="empty-state">Loading…</div> : (
          <>
            {showFilters && <Filters trades={trades} filters={filters} setFilters={setFilters} />}
            {tab === 'dashboard' && <Dashboard trades={filtered} />}
            {tab === 'trades' && <TradesView trades={filtered} onEdit={setEditing} onDelete={del} />}
            {tab === 'calendar' && <CalendarView trades={filtered} />}
            {tab === 'analysis' && <AnalysisView trades={filtered} />}
            {tab === 'data' && <DataView trades={trades} onChanged={load} notify={notify} />}
          </>
        )}
      </main>

      {editing && (
        <TradeForm
          trade={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => load()}
          notify={notify}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

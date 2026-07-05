import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import { importFreq, setImportFreq, lastImportText } from '../reminder.js';

export default function DataView({ trades, onChanged, notify }) {
  const csvRef = useRef();
  const jsonRef = useRef();
  const tvRef = useRef();
  const [busy, setBusy] = useState(false);
  const [freq, setFreq] = useState(importFreq());

  async function importTradovate(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.importTradovate(await file.text());
      let msg = `Tradovate: ${res.imported} new trade(s) imported`;
      if (res.duplicates) msg += `, ${res.duplicates} already imported (skipped)`;
      if (res.open) msg += `, ${res.open} still-open position(s) ignored`;
      notify(msg);
      onChanged();
    } catch (err) { notify('Tradovate import failed: ' + err.message); }
    finally { setBusy(false); if (tvRef.current) tvRef.current.value = ''; }
  }

  function changeFreq(v) { setImportFreq(v); setFreq(v); }

  async function exportCsv() {
    try { await api.exportCsv(); }
    catch (err) { notify('Export failed: ' + err.message); }
  }

  async function backup() {
    try {
      const res = await api.backup();
      notify(`Backup downloaded (${res.trades} trade(s), ${res.screenshots} screenshot(s))`);
    } catch (err) { notify('Backup failed: ' + err.message); }
  }

  async function importCsv(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const res = await api.importCsv(text);
      notify(`Imported ${res.imported} trade(s)`);
      onChanged();
    } catch (err) { notify('Import failed: ' + err.message); }
    finally { setBusy(false); if (csvRef.current) csvRef.current.value = ''; }
  }

  async function restore(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Restoring replaces ALL current trades with the backup contents. A safety backup of your current data will be downloaded first. Continue?')) {
      if (jsonRef.current) jsonRef.current.value = ''; return;
    }
    setBusy(true);
    try {
      if (trades.length) await api.backup('tradezilla-pre-restore'); // safety backup first
      const data = JSON.parse(await file.text());
      const res = await api.restore(data);
      notify(`Restored ${res.restored} trade(s)`);
      onChanged();
    } catch (err) { notify('Restore failed: ' + err.message); }
    finally { setBusy(false); if (jsonRef.current) jsonRef.current.value = ''; }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
      <div className="card">
        <h3>Export</h3>
        <p className="hint">Download all {trades.length} trade(s) as a spreadsheet-ready CSV file.</p>
        <button className="btn" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="card">
        <h3>Tradovate import</h3>
        <p className="hint">
          In Tradovate: Reports → Fills → pick a date range → Download CSV, then drop the file here.
          Fills are paired into round-trip trades automatically; anything already imported is skipped,
          so overlapping date ranges are safe.
        </p>
        <input ref={tvRef} type="file" accept=".csv,text/csv" onChange={importTradovate} disabled={busy} />
        <p className="hint" style={{ marginTop: 10 }}>
          Remind me to import:{' '}
          <select value={freq} onChange={(e) => changeFreq(e.target.value)}>
            <option value="off">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          {' '}· Last import: {lastImportText()}
        </p>
      </div>
      <div className="card">
        <h3>Import CSV</h3>
        <p className="hint">Append trades from a CSV. Recognised columns: date, time, symbol, direction, entry, exit, contracts, stopLoss, takeProfit, commissions, setup, session, notes.</p>
        <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={importCsv} disabled={busy} />
      </div>
      <div className="card">
        <h3>Backup (full)</h3>
        <p className="hint">Download a complete JSON backup (all fields + screenshot images). Your data lives in this browser, so keep backups somewhere safe.</p>
        <button className="btn" onClick={backup}>Download backup</button>
      </div>
      <div className="card">
        <h3>Restore</h3>
        <p className="hint">Replace all data from a JSON backup file. A safety backup of current data is downloaded first.</p>
        <input ref={jsonRef} type="file" accept=".json,application/json" onChange={restore} disabled={busy} />
      </div>
    </div>
  );
}

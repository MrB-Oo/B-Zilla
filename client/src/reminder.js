// Tradovate import reminder settings (localStorage).
// A static site can't poll Tradovate's API, so instead the app reminds you
// to export/import on the cadence you choose.

const FREQ_KEY = 'tzImportFreq';
const LAST_KEY = 'tzLastTradovateImport';

export function importFreq() {
  try { return localStorage.getItem(FREQ_KEY) || 'off'; } catch { return 'off'; }
}

export function setImportFreq(v) {
  try { localStorage.setItem(FREQ_KEY, v); } catch {}
}

export function lastImport() {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v ? new Date(v) : null;
  } catch { return null; }
}

export function lastImportText() {
  const d = lastImport();
  return d ? d.toLocaleString() : 'never';
}

// Returns true when an import is due under the chosen cadence.
export function importOverdue() {
  const freq = importFreq();
  if (freq === 'off') return false;
  const last = lastImport();
  if (!last) return true;
  const days = freq === 'daily' ? 1 : 7;
  return Date.now() - last.getTime() > days * 24 * 60 * 60 * 1000;
}

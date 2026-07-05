// Browser-only storage layer (IndexedDB). Replaces the old Express API so the
// app can be hosted as a static site (e.g. GitHub Pages). Same interface as before.

import { parseFills, pairFills, fingerprint } from './tradovate.js';

const DB_NAME = 'tradezilla';
const DB_VERSION = 2;

const DEFAULT_POINT_VALUES = { NQ: 20, ES: 50, MNQ: 2, MES: 5 };
const defaultPointValue = (sym) => DEFAULT_POINT_VALUES[String(sym || '').toUpperCase()] ?? 1;

// ---------- IndexedDB plumbing ----------
let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('trades')) db.createObjectStore('trades', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('shots')) db.createObjectStore('shots', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('fingerprints')) db.createObjectStore('fingerprints', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        const result = fn(t);
        t.oncomplete = () => resolve(result.value);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('transaction aborted'));
      })
  );
}

function reqValue(idbRequest, box) {
  idbRequest.onsuccess = () => { box.value = idbRequest.result; };
  return box;
}

const getAll = (store) => tx([store], 'readonly', (t) => reqValue(t.objectStore(store).getAll(), {}));
const getOne = (store, key) => tx([store], 'readonly', (t) => reqValue(t.objectStore(store).get(key), {}));

// ---------- Metrics (ported from the old server store) ----------
function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeMetrics(t) {
  const entry = num(t.entry);
  const exit = num(t.exit);
  const contracts = num(t.contracts) || 0;
  const pv = num(t.pointValue) || defaultPointValue(t.symbol);
  const commissions = num(t.commissions) || 0;
  const dir = t.direction === 'short' ? -1 : 1;

  let resultPoints = null, resultDollars = null;
  if (entry != null && exit != null) {
    resultPoints = +(dir * (exit - entry)).toFixed(4);
    resultDollars = +(resultPoints * pv * contracts - commissions).toFixed(2);
  }

  let riskDollars = null, rMultiple = null;
  const stop = num(t.stopLoss);
  if (stop != null && entry != null && contracts > 0) {
    riskDollars = Math.abs(entry - stop) * pv * contracts;
    if (riskDollars > 0 && resultDollars != null) rMultiple = +(resultDollars / riskDollars).toFixed(2);
  }

  return {
    pointValue: pv,
    resultPoints,
    resultDollars,
    riskDollars: riskDollars != null ? +riskDollars.toFixed(2) : null,
    rMultiple,
  };
}

const decorate = (t) => ({ ...t, ...computeMetrics(t) });

const FIELDS = [
  'date', 'time', 'symbol', 'direction', 'entry', 'exit', 'contracts',
  'stopLoss', 'takeProfit', 'commissions', 'pointValue', 'setup',
  'session', 'notes',
];

function sanitize(input) {
  const out = {};
  for (const f of FIELDS) out[f] = input[f] === undefined ? null : input[f];
  return out;
}

function sanitizePatch(input) {
  const out = {};
  for (const f of FIELDS) if (input[f] !== undefined) out[f] = input[f];
  return out;
}

const sortDesc = (a, b) =>
  (((b.date || '') + ' ' + (b.time || ''))).localeCompare((a.date || '') + ' ' + (a.time || ''));

// ---------- CSV (ported from the old server) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function csvToObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ''; });
    return o;
  });
}

function csvEsc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const CSV_COLUMNS = [
  'date', 'time', 'symbol', 'direction', 'entry', 'exit', 'contracts',
  'stopLoss', 'takeProfit', 'pointValue', 'commissions', 'resultPoints',
  'resultDollars', 'riskDollars', 'rMultiple', 'setup', 'session', 'notes',
];

// ---------- Download / base64 helpers ----------
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}

// ---------- Public API (same shape the components already use) ----------
export const api = {
  async listTrades() {
    const trades = (await getAll('trades')) || [];
    return trades.map(decorate).sort(sortDesc);
  },

  async createTrade(input) {
    const now = new Date().toISOString();
    const t = {
      id: crypto.randomUUID(),
      ...sanitize(input),
      screenshots: Array.isArray(input.screenshots) ? input.screenshots : [],
      createdAt: now,
      updatedAt: now,
    };
    await tx(['trades'], 'readwrite', (tr) => reqValue(tr.objectStore('trades').put(t), {}));
    return decorate(t);
  },

  async updateTrade(id, input) {
    const existing = await getOne('trades', id);
    if (!existing) throw new Error('not found');
    const t = { ...existing, ...sanitizePatch(input), updatedAt: new Date().toISOString() };
    await tx(['trades'], 'readwrite', (tr) => reqValue(tr.objectStore('trades').put(t), {}));
    return decorate(t);
  },

  async deleteTrade(id) {
    const t = await getOne('trades', id);
    if (!t) throw new Error('not found');
    await tx(['trades', 'shots'], 'readwrite', (tr) => {
      tr.objectStore('trades').delete(id);
      (t.screenshots || []).forEach((s) => tr.objectStore('shots').delete(s.id));
      return {};
    });
    return { ok: true };
  },

  meta: async () => ({ pointValues: DEFAULT_POINT_VALUES }),

  async uploadScreenshot(tradeId, file, label) {
    if (!/^image\//.test(file.type)) throw new Error('not an image file');
    const t = await getOne('trades', tradeId);
    if (!t) throw new Error('trade not found');
    const shot = { id: crypto.randomUUID(), label: label || '' };
    t.screenshots = [...(t.screenshots || []), shot];
    t.updatedAt = new Date().toISOString();
    await tx(['trades', 'shots'], 'readwrite', (tr) => {
      tr.objectStore('shots').put({ id: shot.id, blob: file });
      tr.objectStore('trades').put(t);
      return {};
    });
    return shot;
  },

  async deleteScreenshot(tradeId, sid) {
    const t = await getOne('trades', tradeId);
    if (!t) throw new Error('not found');
    t.screenshots = (t.screenshots || []).filter((s) => s.id !== sid);
    t.updatedAt = new Date().toISOString();
    await tx(['trades', 'shots'], 'readwrite', (tr) => {
      tr.objectStore('shots').delete(sid);
      tr.objectStore('trades').put(t);
      return {};
    });
    return { ok: true };
  },

  // Returns an object URL for a stored screenshot (or null if missing).
  async screenshotUrl(sid) {
    const rec = await getOne('shots', sid);
    return rec && rec.blob ? URL.createObjectURL(rec.blob) : null;
  },

  async importCsv(text) {
    if (!text || !text.trim()) throw new Error('empty csv');
    const objs = csvToObjects(text);
    const now = new Date().toISOString();
    const mapped = objs.map((o) => ({
      id: crypto.randomUUID(),
      ...sanitize({
        date: o.date || o.Date || '',
        time: o.time || o.Time || '',
        symbol: o.symbol || o.Symbol || '',
        direction: (o.direction || o.Direction || 'long').toLowerCase().startsWith('s') ? 'short' : 'long',
        entry: o.entry ?? o.Entry ?? '',
        exit: o.exit ?? o.Exit ?? '',
        contracts: o.contracts ?? o.Contracts ?? o.qty ?? o.Qty ?? '',
        stopLoss: o.stopLoss ?? o.stop ?? o.Stop ?? '',
        takeProfit: o.takeProfit ?? o.target ?? o.Target ?? '',
        pointValue: o.pointValue ?? '',
        commissions: o.commissions ?? o.Commissions ?? o.fees ?? '',
        setup: o.setup ?? o.Setup ?? o.strategy ?? '',
        session: o.session ?? o.Session ?? '',
        notes: o.notes ?? o.Notes ?? '',
      }),
      screenshots: [],
      createdAt: now,
      updatedAt: now,
    }));
    await tx(['trades'], 'readwrite', (tr) => {
      mapped.forEach((t) => tr.objectStore('trades').put(t));
      return {};
    });
    return { imported: mapped.length };
  },

  // Import a Tradovate Fills/Orders CSV. Pairs fills into round-trip trades and
  // skips any trade already imported before (fingerprint dedup), so overlapping
  // date ranges are safe to re-import.
  async importTradovate(text) {
    const fills = parseFills(text);
    const { trades, openCount } = pairFills(fills);
    const existing = new Set(((await getAll('fingerprints')) || []).map((f) => f.id));

    const now = new Date().toISOString();
    const fresh = [];
    for (const t of trades) {
      const fp = fingerprint(t);
      if (existing.has(fp)) continue;
      existing.add(fp);
      fresh.push({
        record: {
          id: crypto.randomUUID(),
          ...sanitize({ ...t, notes: 'Imported from Tradovate' }),
          screenshots: [],
          createdAt: now,
          updatedAt: now,
        },
        fp,
      });
    }

    await tx(['trades', 'fingerprints'], 'readwrite', (tr) => {
      fresh.forEach(({ record, fp }) => {
        tr.objectStore('trades').put(record);
        tr.objectStore('fingerprints').put({ id: fp });
      });
      return {};
    });

    try { localStorage.setItem('tzLastTradovateImport', new Date().toISOString()); } catch {}
    return { imported: fresh.length, duplicates: trades.length - fresh.length, open: openCount };
  },

  async exportCsv() {
    const trades = await api.listTrades();
    const lines = [CSV_COLUMNS.join(',')];
    for (const t of trades) lines.push(CSV_COLUMNS.map((c) => csvEsc(t[c])).join(','));
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), 'trades.csv');
  },

  // Full backup: trades + screenshot images (base64), all in one JSON file.
  async backup(filenamePrefix = 'tradezilla-backup') {
    const trades = (await getAll('trades')) || [];
    const shots = (await getAll('shots')) || [];
    const screenshots = [];
    for (const s of shots) {
      screenshots.push({ id: s.id, dataUrl: await blobToDataUrl(s.blob) });
    }
    const fingerprints = ((await getAll('fingerprints')) || []).map((f) => f.id);
    const payload = { version: 2, exportedAt: new Date().toISOString(), trades, screenshots, fingerprints };
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      `${filenamePrefix}-${stamp}.json`
    );
    return { trades: trades.length, screenshots: screenshots.length };
  },

  // Replace ALL data from a backup. Accepts v2 backups (with images),
  // v1 server backups ({ trades: [...] }), or a bare array of trades.
  async restore(data) {
    const trades = Array.isArray(data) ? data : data && data.trades;
    if (!Array.isArray(trades)) throw new Error('expected { trades: [...] }');
    const screenshots = (!Array.isArray(data) && Array.isArray(data.screenshots)) ? data.screenshots : [];

    const shotBlobs = [];
    for (const s of screenshots) {
      if (s && s.id && s.dataUrl) shotBlobs.push({ id: s.id, blob: await dataUrlToBlob(s.dataUrl) });
    }
    const shotIds = new Set(shotBlobs.map((s) => s.id));

    const now = new Date().toISOString();
    const cleaned = trades.map((t) => ({
      id: t.id || crypto.randomUUID(),
      ...sanitize(t),
      // keep only screenshot refs whose image we actually have
      screenshots: (Array.isArray(t.screenshots) ? t.screenshots : []).filter((s) => shotIds.has(s.id)),
      createdAt: t.createdAt || now,
      updatedAt: now,
    }));

    const fingerprints = (!Array.isArray(data) && Array.isArray(data.fingerprints)) ? data.fingerprints : [];
    await tx(['trades', 'shots', 'fingerprints'], 'readwrite', (tr) => {
      tr.objectStore('trades').clear();
      tr.objectStore('shots').clear();
      tr.objectStore('fingerprints').clear();
      cleaned.forEach((t) => tr.objectStore('trades').put(t));
      shotBlobs.forEach((s) => tr.objectStore('shots').put(s));
      fingerprints.forEach((id) => tr.objectStore('fingerprints').put({ id }));
      return {};
    });
    return { restored: cleaned.length };
  },
};

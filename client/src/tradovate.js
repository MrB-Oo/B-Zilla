// Tradovate Fills/Orders CSV → round-trip trades.
// Self-contained: own CSV parser, fuzzy header detection, FIFO fill pairing.

// ---- CSV parsing (RFC-4180-ish) ----
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

// ---- Header detection ----
// Maps a lowercased, de-spaced header cell to a canonical field name.
const HEADER_ALIASES = {
  time: ['filltime', 'timestamp', 'time', 'date/time', 'datetime', 'date'],
  side: ['b/s', 'side', 'buy/sell', 'buysell', 'action'],
  contract: ['contract', 'symbol', 'instrument'],
  product: ['product'],
  qty: ['filledqty', 'qty', 'quantity', 'filled', 'fillqty', 'size'],
  price: ['avgprice', 'price', 'fillprice', 'avgfillprice'],
  orderId: ['orderid', 'order#', 'ordernumber', 'id'],
  commission: ['commission', 'commissions', 'fees', 'fee', 'comm', 'totalfees'],
  account: ['account', 'accountid'],
};

function detectHeaders(headerRow) {
  const map = {}; // canonical -> column index
  headerRow.forEach((h, i) => {
    const key = String(h).toLowerCase().replace(/[\s_-]/g, '');
    for (const [canon, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[canon] === undefined && aliases.includes(key)) { map[canon] = i; break; }
    }
  });
  return map;
}

// ---- Symbol normalization: NQZ5 / MESU26 -> NQ / MES ----
const MONTH_CODES = 'FGHJKMNQUVXZ';
export function normalizeSymbol(contract, product) {
  if (product) return String(product).toUpperCase().trim();
  const c = String(contract || '').toUpperCase().trim();
  const m = c.match(/^([A-Z0-9]+?)([FGHJKMNQUVXZ])(\d{1,2})$/);
  return m && MONTH_CODES.includes(m[2]) ? m[1] : c;
}

// ---- Timestamp parsing -> { date: 'YYYY-MM-DD', time: 'HH:MM', ts: sortable string } ----
function parseWhen(raw) {
  const s = String(raw || '').trim();
  if (!s) return { date: '', time: '', ts: '' };
  // MM/DD/YYYY[ HH:MM[:SS][ AM/PM]]
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (m) {
    let [, mo, d, y, h = '0', min = '00', sec = '00', ap] = m;
    if (y.length === 2) y = '20' + y;
    let hh = parseInt(h, 10);
    if (ap) { if (/pm/i.test(ap) && hh < 12) hh += 12; if (/am/i.test(ap) && hh === 12) hh = 0; }
    const date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const time = `${String(hh).padStart(2, '0')}:${min}`;
    return { date, time, ts: `${date} ${time}:${sec}` };
  }
  // ISO-ish: YYYY-MM-DD[ T]HH:MM[:SS]
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h = '00', min = '00', sec = '00'] = m;
    const date = `${y}-${mo}-${d}`;
    return { date, time: h === '00' && min === '00' ? '' : `${h}:${min}`, ts: `${date} ${h}:${min}:${sec}` };
  }
  return { date: '', time: '', ts: s };
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[$,()]/g, (c) => (c === '(' ? '-' : c === ')' ? '' : '')));
  return Number.isFinite(n) ? n : null;
};

// ---- Parse the CSV into normalized fills ----
export function parseFills(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV has no data rows');
  const cols = detectHeaders(rows[0]);
  const missing = ['time', 'side', 'qty', 'price'].filter((k) => cols[k] === undefined);
  if (cols.contract === undefined && cols.product === undefined) missing.push('contract/symbol');
  if (missing.length) {
    throw new Error(`Unrecognized CSV — missing column(s): ${missing.join(', ')}. Export from Tradovate Reports → Fills.`);
  }
  const fills = [];
  for (const r of rows.slice(1)) {
    const qty = Math.abs(num(r[cols.qty]) ?? 0);
    const price = num(r[cols.price]);
    if (!qty || price == null) continue; // skip unfilled / malformed rows
    const sideRaw = String(r[cols.side] || '').trim().toLowerCase();
    const side = sideRaw.startsWith('s') ? -1 : 1; // Sell/Short -> -1, Buy -> +1
    const when = parseWhen(r[cols.time]);
    fills.push({
      ...when,
      side,
      qty,
      price,
      symbol: normalizeSymbol(cols.contract !== undefined ? r[cols.contract] : '', cols.product !== undefined ? r[cols.product] : ''),
      commission: cols.commission !== undefined ? Math.abs(num(r[cols.commission]) ?? 0) : 0,
      orderId: cols.orderId !== undefined ? String(r[cols.orderId] || '') : '',
    });
  }
  fills.sort((a, b) => a.ts.localeCompare(b.ts));
  return fills;
}

// ---- FIFO pairing: fills -> round-trip trades ----
// Walks fills per symbol, tracking net position. A trade opens when position
// leaves zero and closes when it returns to zero. Fills that cross zero are split.
export function pairFills(fills) {
  const bySymbol = {};
  for (const f of fills) (bySymbol[f.symbol] = bySymbol[f.symbol] || []).push(f);

  const trades = [];
  let openCount = 0;

  for (const symbol of Object.keys(bySymbol)) {
    let pos = 0;      // signed net position
    let cur = null;   // accumulating trade

    const start = (f, qty) => {
      cur = {
        symbol,
        direction: f.side > 0 ? 'long' : 'short',
        date: f.date, time: f.time, ts: f.ts,
        entryQty: 0, entryValue: 0,
        exitQty: 0, exitValue: 0,
        commissions: 0,
      };
      add(f, qty);
    };
    const add = (f, qty) => {
      const isEntry = (cur.direction === 'long') === (f.side > 0);
      if (isEntry) { cur.entryQty += qty; cur.entryValue += qty * f.price; }
      else { cur.exitQty += qty; cur.exitValue += qty * f.price; }
      // apportion commission by the share of the fill used in this trade
      cur.commissions += f.qty ? f.commission * (qty / f.qty) : 0;
    };
    const close = () => {
      trades.push({
        date: cur.date,
        time: cur.time,
        ts: cur.ts,
        symbol: cur.symbol,
        direction: cur.direction,
        entry: +(cur.entryValue / cur.entryQty).toFixed(4),
        exit: +(cur.exitValue / cur.exitQty).toFixed(4),
        contracts: cur.entryQty,
        commissions: +cur.commissions.toFixed(2),
      });
      cur = null;
    };

    for (const f of bySymbol[symbol]) {
      let remaining = f.qty;
      while (remaining > 0) {
        if (pos === 0) {
          const q = remaining;
          start(f, q);
          pos = f.side * q;
          remaining = 0;
        } else if ((pos > 0) === (f.side > 0)) {
          add(f, remaining); // scaling in
          pos += f.side * remaining;
          remaining = 0;
        } else {
          const closeQty = Math.min(remaining, Math.abs(pos));
          add(f, closeQty);
          pos += f.side * closeQty;
          remaining -= closeQty;
          if (pos === 0) close(); // flat -> trade complete; leftover opens a new one
        }
      }
    }
    if (cur) { openCount++; cur = null; } // unclosed position at end of data
  }

  trades.sort((a, b) => a.ts.localeCompare(b.ts));
  return { trades, openCount };
}

// Stable fingerprint used to skip trades that were already imported.
export function fingerprint(t) {
  return ['tv', t.symbol, t.direction, t.ts, t.contracts, t.entry, t.exit].join('|');
}

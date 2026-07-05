const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('./store');
const csv = require('./csv');

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

app.use(express.json({ limit: '5mb' }));

// ---- Screenshot uploads ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, crypto.randomUUID() + ext);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

app.use('/uploads', express.static(UPLOAD_DIR));

// ---- Trades CRUD ----
app.get('/api/trades', (req, res) => res.json(store.listTrades()));

app.get('/api/trades/:id', (req, res) => {
  const t = store.getTrade(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

app.post('/api/trades', (req, res) => res.status(201).json(store.createTrade(req.body || {})));

app.put('/api/trades/:id', (req, res) => {
  const t = store.updateTrade(req.params.id, req.body || {});
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

app.delete('/api/trades/:id', (req, res) => {
  const ok = store.deleteTrade(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Screenshots ----
app.post('/api/trades/:id/screenshots', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image file' });
  const shot = store.addScreenshot(req.params.id, req.file.filename, req.body.label);
  if (!shot) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    return res.status(404).json({ error: 'trade not found' });
  }
  res.status(201).json(shot);
});

app.delete('/api/trades/:id/screenshots/:sid', (req, res) => {
  const ok = store.removeScreenshot(req.params.id, req.params.sid);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- CSV export ----
const CSV_COLUMNS = [
  'date', 'time', 'symbol', 'direction', 'entry', 'exit', 'contracts',
  'stopLoss', 'takeProfit', 'pointValue', 'commissions', 'resultPoints',
  'resultDollars', 'riskDollars', 'rMultiple', 'setup', 'session', 'notes',
];

app.get('/api/export/csv', (req, res) => {
  const trades = store.listTrades();
  const text = csv.stringify(trades, CSV_COLUMNS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
  res.send(text);
});

// ---- CSV import (append). Body: { csv: "..." } ----
app.post('/api/import/csv', (req, res) => {
  const text = (req.body && req.body.csv) || '';
  if (!text.trim()) return res.status(400).json({ error: 'empty csv' });
  let objs;
  try { objs = csv.toObjects(text); } catch (e) { return res.status(400).json({ error: 'parse error' }); }
  const mapped = objs.map((o) => ({
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
  }));
  const count = store.bulkAdd(mapped);
  res.json({ imported: count });
});

// ---- Full JSON backup / restore ----
app.get('/api/backup', (req, res) => {
  store.makeBackup();
  const data = store.readAll();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="tradezilla-backup.json"');
  res.send(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), trades: data }, null, 2));
});

app.post('/api/restore', (req, res) => {
  const body = req.body || {};
  const trades = Array.isArray(body) ? body : body.trades;
  if (!Array.isArray(trades)) return res.status(400).json({ error: 'expected { trades: [...] }' });
  store.makeBackup(); // safety backup of current state first
  const count = store.replaceAll(trades);
  res.json({ restored: count });
});

app.get('/api/meta', (req, res) => res.json({ pointValues: store.DEFAULT_POINT_VALUES }));

// ---- Serve built frontend ----
const DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Tradezilla journal running on http://localhost:${PORT}`));

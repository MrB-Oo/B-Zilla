import React, { useState, useMemo, useRef, useEffect } from 'react';
import { api } from '../api.js';
import { previewMetrics, defaultPointValue, fmtUSD, fmtR, fmtNum, SESSIONS, todayISO } from '../helpers.js';

const QUICK_SYMBOLS = ['NQ', 'ES', 'MNQ', 'MES'];

const blank = () => ({
  date: todayISO(), time: '', symbol: 'NQ', direction: 'long',
  entry: '', exit: '', contracts: '1', stopLoss: '', takeProfit: '',
  pointValue: String(defaultPointValue('NQ')), commissions: '', setup: '',
  session: 'NY', notes: '', screenshots: [],
});

export default function TradeForm({ trade, onClose, onSaved, notify }) {
  const [form, setForm] = useState(() => (trade ? normalize(trade) : blank()));
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [shotUrls, setShotUrls] = useState({}); // shot id -> object URL
  const fileRef = useRef();
  const isEditing = !!form.id;

  // Resolve screenshot blobs from IndexedDB into object URLs.
  useEffect(() => {
    let cancelled = false;
    const missing = (form.screenshots || []).filter((s) => !shotUrls[s.id]);
    if (!missing.length) return;
    (async () => {
      const entries = await Promise.all(missing.map(async (s) => [s.id, await api.screenshotUrl(s.id)]));
      if (!cancelled) setShotUrls((m) => ({ ...m, ...Object.fromEntries(entries.filter(([, u]) => u)) }));
    })();
    return () => { cancelled = true; };
  }, [form.screenshots]);

  // Revoke object URLs when the form unmounts.
  const shotUrlsRef = useRef(shotUrls);
  shotUrlsRef.current = shotUrls;
  useEffect(() => () => { Object.values(shotUrlsRef.current).forEach((u) => URL.revokeObjectURL(u)); }, []);

  const preview = useMemo(() => previewMetrics(form), [form]);

  function set(k, v) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'symbol' && (!f.pointValue || f.pointValue === String(defaultPointValue(f.symbol)))) {
        next.pointValue = String(defaultPointValue(v));
      }
      return next;
    });
  }

  async function save() {
    if (!form.date) return notify('Date is required');
    setSaving(true);
    try {
      const payload = stripComputed(form);
      let saved;
      if (isEditing) saved = await api.updateTrade(form.id, payload);
      else saved = await api.createTrade(payload);
      onSaved(saved);
      if (!isEditing) {
        // keep modal open in edit mode so screenshots can be attached
        setForm(normalize(saved));
        notify('Trade saved. You can now attach screenshots.');
      } else {
        notify('Trade updated');
      }
    } catch (e) {
      notify('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !form.id) return;
    const label = prompt('Label for these screenshot(s)? (e.g. Entry, Exit)') || '';
    try {
      for (const file of files) {
        const shot = await api.uploadScreenshot(form.id, file, label);
        setForm((f) => ({ ...f, screenshots: [...(f.screenshots || []), shot] }));
      }
      onSaved(); // refresh list
      notify('Screenshot added');
    } catch (err) {
      notify('Upload failed: ' + err.message);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function delShot(sid) {
    await api.deleteScreenshot(form.id, sid);
    setForm((f) => ({ ...f, screenshots: f.screenshots.filter((s) => s.id !== sid) }));
    onSaved();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isEditing ? 'Edit trade' : 'New trade'}</h2>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.date || ''} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div className="field">
              <label>Time</label>
              <input type="time" value={form.time || ''} onChange={(e) => set('time', e.target.value)} />
            </div>
            <div className="field">
              <label>Session</label>
              <select value={form.session || ''} onChange={(e) => set('session', e.target.value)}>
                <option value="">-</option>
                {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Symbol</label>
              <div className="seg" style={{ marginBottom: 6 }}>
                {QUICK_SYMBOLS.map((s) => (
                  <button key={s} className={form.symbol === s ? 'active' : ''} type="button" onClick={() => set('symbol', s)}>{s}</button>
                ))}
              </div>
              <input value={form.symbol || ''} onChange={(e) => set('symbol', e.target.value.toUpperCase())} placeholder="Other symbol" />
            </div>
            <div className="field">
              <label>Direction</label>
              <div className="seg">
                <button type="button" className={form.direction === 'long' ? 'active' : ''} onClick={() => set('direction', 'long')}>Long</button>
                <button type="button" className={form.direction === 'short' ? 'active' : ''} onClick={() => set('direction', 'short')}>Short</button>
              </div>
            </div>
            <div className="field">
              <label>Contracts</label>
              <input type="number" min="0" step="1" value={form.contracts || ''} onChange={(e) => set('contracts', e.target.value)} />
            </div>

            <div className="field">
              <label>Entry price</label>
              <input type="number" step="any" value={form.entry || ''} onChange={(e) => set('entry', e.target.value)} />
            </div>
            <div className="field">
              <label>Exit price</label>
              <input type="number" step="any" value={form.exit || ''} onChange={(e) => set('exit', e.target.value)} />
            </div>
            <div className="field">
              <label>Point value ($)</label>
              <input type="number" step="any" value={form.pointValue || ''} onChange={(e) => set('pointValue', e.target.value)} />
            </div>

            <div className="field">
              <label>Stop loss</label>
              <input type="number" step="any" value={form.stopLoss || ''} onChange={(e) => set('stopLoss', e.target.value)} />
            </div>
            <div className="field">
              <label>Take profit</label>
              <input type="number" step="any" value={form.takeProfit || ''} onChange={(e) => set('takeProfit', e.target.value)} />
            </div>
            <div className="field">
              <label>Commissions ($)</label>
              <input type="number" step="any" value={form.commissions || ''} onChange={(e) => set('commissions', e.target.value)} />
            </div>

            <div className="field">
              <label>Setup / strategy</label>
              <input value={form.setup || ''} onChange={(e) => set('setup', e.target.value)} placeholder="e.g. ORB, Reversal" />
            </div>
            <div className="field full">
              <label>Notes</label>
              <textarea rows="2" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="computed" style={{ marginTop: 16 }}>
            <div><span>Result (points)</span><b className={cls(preview.points)}>{fmtNum(preview.points)}</b></div>
            <div><span>Result ($)</span><b className={cls(preview.dollars)}>{fmtUSD(preview.dollars)}</b></div>
            <div><span>Risk ($)</span><b>{preview.risk == null ? '-' : fmtUSD(preview.risk)}</b></div>
            <div><span>R multiple</span><b className={cls(preview.r)}>{fmtR(preview.r)}</b></div>
          </div>

          <div style={{ marginTop: 18 }}>
            <label className="hint">Screenshots (charts for entry / exit)</label>
            {!isEditing && <div className="hint">Save the trade first, then you can attach screenshots.</div>}
            {isEditing && (
              <>
                <div className="shots">
                  {(form.screenshots || []).map((s) => (
                    <div className="shot" key={s.id}>
                      <img src={shotUrls[s.id] || ''} onClick={() => shotUrls[s.id] && setLightbox(shotUrls[s.id])} alt={s.label} />
                      <button className="del" onClick={() => delShot(s.id)}>×</button>
                      {s.label && <div className="cap">{s.label}</div>}
                    </div>
                  ))}
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={upload} style={{ marginTop: 10 }} />
              </>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <span className="hint">{isEditing ? 'Editing existing trade' : 'New entry'}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn ghost" onClick={onClose}>Close</button>
            <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : (isEditing ? 'Save changes' : 'Save trade')}</button>
          </div>
        </div>
      </div>
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="" /></div>
      )}
    </div>
  );
}

const cls = (n) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '');

function normalize(t) {
  const o = { ...t };
  ['entry', 'exit', 'contracts', 'stopLoss', 'takeProfit', 'pointValue', 'commissions'].forEach((k) => {
    o[k] = t[k] == null ? '' : String(t[k]);
  });
  o.screenshots = t.screenshots || [];
  return o;
}

function stripComputed(form) {
  const { id, resultPoints, resultDollars, riskDollars, rMultiple, screenshots, createdAt, updatedAt, ...rest } = form;
  return rest;
}

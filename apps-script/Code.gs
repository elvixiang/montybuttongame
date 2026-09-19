/**
 * MONTY CUP CHALLENGE — Leaderboard backend (Google Sheets)
 * ---------------------------------------------------------
 * 1. Create a Google Sheet → Extensions → Apps Script → paste this file.
 * 2. Change ADMIN_TOKEN below (used only to reset a leaderboard from the tablet).
 * 3. Deploy → New deployment → type "Web app"
 *      Execute as: Me      Who has access: Anyone
 * 4. Copy the Web app URL (ends with /exec) into SHEETS_URL in js/config.js
 *    (or paste it in the game's Admin screen).
 * After editing this code: Deploy → Manage deployments → Edit → Version: New version.
 */
const SHEET_NAME = 'Scores';
const ARCHIVE_NAME = 'Archive';
const ADMIN_TOKEN = 'CHANGE-ME-monty-2026';
const TZ = 'Asia/Jakarta';
const HEADERS = ['Timestamp', 'ID', 'Event', 'Name', 'Status', 'Time (sec)', 'Time (ms)', 'Taps', 'Client TS', 'Config'];
const C = { TS: 0, ID: 1, EVENT: 2, NAME: 3, STATUS: 4, SEC: 5, MS: 6, TAPS: 7, CTS: 8, CONFIG: 9 };

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return json_({ ok: true, now: new Date().toISOString() });
    return json_(list_(String(p.event || '')));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'submit') return json_(submit_(body.entries || []));
    if (body.action === 'reset') return json_(reset_(String(body.event || ''), String(body.token || '')));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name || SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(name || SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(sh) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, HEADERS.length).getValues() : [];
}

/** Completed players sorted fastest first (ties → earlier result first) + totals. */
function list_(event) {
  const all = rows_(sheet_()).filter(r => String(r[C.EVENT]) === event);
  const completed = all
    .filter(r => r[C.STATUS] === 'COMPLETED')
    .map(r => ({ id: String(r[C.ID]), name: String(r[C.NAME]), timeMs: Number(r[C.MS]), taps: Number(r[C.TAPS]), ts: Number(r[C.CTS]), completed: true }))
    .sort((a, b) => a.timeMs - b.timeMs || a.ts - b.ts);
  return {
    ok: true,
    completed: completed,
    totals: { players: all.length, completed: completed.length, failed: all.length - completed.length }
  };
}

function cleanName_(n) {
  n = String(n || '').replace(/[<>"'`=+@\\]/g, '').replace(/^[-\s]+/, '').trim().toUpperCase().slice(0, 12);
  return n || 'MONTY FAN';
}

function submit_(entries) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_();
    const existing = new Set(rows_(sh).map(r => String(r[C.ID])));
    const out = [];
    entries.slice(0, 50).forEach(e => {
      const id = String(e.id || '');
      if (!id || existing.has(id)) return;           // retry-safe: never double-save
      existing.add(id);
      const done = !!e.completed;
      const ms = Math.max(0, Math.round(Number(e.timeMs) || 0));
      const ts = Number(e.ts) || Date.now();
      out.push([
        Utilities.formatDate(new Date(ts), TZ, 'yyyy-MM-dd HH:mm:ss'),
        id, String(e.event || ''), cleanName_(e.name),
        done ? 'COMPLETED' : 'NOT COMPLETED',
        done ? Math.round(ms / 10) / 100 : '',
        ms, Math.round(Number(e.taps) || 0), ts, String(e.config || '').slice(0, 40)
      ]);
    });
    if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, HEADERS.length).setValues(out);
    return { ok: true, accepted: out.length };
  } finally {
    lock.releaseLock();
  }
}

/** Moves one event's rows to the Archive sheet (nothing is deleted forever). */
function reset_(event, token) {
  if (token !== ADMIN_TOKEN) return { ok: false, error: 'Wrong admin token' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_();
    const all = rows_(sh);
    const keep = all.filter(r => String(r[C.EVENT]) !== event);
    const moved = all.filter(r => String(r[C.EVENT]) === event);
    if (moved.length) {
      const ar = sheet_(ARCHIVE_NAME);
      ar.getRange(ar.getLastRow() + 1, 1, moved.length, HEADERS.length).setValues(moved);
    }
    if (all.length) sh.getRange(2, 1, all.length, HEADERS.length).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, HEADERS.length).setValues(keep);
    return { ok: true, archived: moved.length };
  } finally {
    lock.releaseLock();
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
   LEADERBOARD
   --------------------------------------------------------------------------
   • Every result is ALWAYS saved on the tablet first (localStorage), so the
     game never waits for the internet.
   • If SHEETS_URL is set, results are queued and synced to Google Sheets in
     the background (retries automatically when the connection comes back).
   • Ranking = fastest completion time; ties go to whoever got it first.

   To swap in Firebase / Supabase later, write an adapter with the same 3
   methods as SheetsAdapter:  fetchSnapshot(eventId), submit(entries), reset(eventId, token)
   ========================================================================== */
window.MCC = window.MCC || {};

(function () {
  var K_LOCAL = "mcc.scores.v1";
  var K_QUEUE = "mcc.queue.v1";
  var K_CACHE = "mcc.remoteCache.v1";

  function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function byTime(a, b) { return a.timeMs - b.timeMs || a.ts - b.ts; }

  // ---- Local store (source of truth when no Sheets URL) ----------------------
  var LocalAdapter = {
    name: "local",
    fetchSnapshot: function (eventId) {
      var all = read(K_LOCAL, []).filter(function (e) { return e.event === eventId; });
      var done = all.filter(function (e) { return e.completed; }).sort(byTime);
      return Promise.resolve({
        completed: done,
        totals: { players: all.length, completed: done.length, failed: all.length - done.length }
      });
    },
    submit: function () { return Promise.resolve({ ok: true }); }, // already stored locally
    reset: function (eventId) {
      write(K_LOCAL, read(K_LOCAL, []).filter(function (e) { return e.event !== eventId; }));
      return Promise.resolve({ ok: true });
    }
  };

  // ---- Google Sheets (Apps Script Web App) -----------------------------------
  function SheetsAdapter(url) { this.url = url; this.name = "sheets"; }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]);
  }
  SheetsAdapter.prototype.fetchSnapshot = function (eventId) {
    var u = this.url + (this.url.indexOf("?") < 0 ? "?" : "&") + "action=list&event=" + encodeURIComponent(eventId) + "&_=" + Date.now();
    return withTimeout(fetch(u, { method: "GET", redirect: "follow" }), 6000)
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || "Sheets error"); return d; });
  };
  SheetsAdapter.prototype.submit = function (entries) {
    // text/plain body = "simple request" (no CORS preflight, works with Apps Script)
    return withTimeout(fetch(this.url, { method: "POST", redirect: "follow", body: JSON.stringify({ action: "submit", entries: entries }) }), 8000)
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || "Sheets error"); return d; });
  };
  SheetsAdapter.prototype.reset = function (eventId, token) {
    return withTimeout(fetch(this.url, { method: "POST", redirect: "follow", body: JSON.stringify({ action: "reset", event: eventId, token: token }) }), 10000)
      .then(function (r) { return r.json(); });
  };
  SheetsAdapter.prototype.ping = function () {
    var u = this.url + (this.url.indexOf("?") < 0 ? "?" : "&") + "action=ping&_=" + Date.now();
    return withTimeout(fetch(u, { redirect: "follow" }), 6000).then(function (r) { return r.json(); });
  };

  // ---- Service ---------------------------------------------------------------
  var LB = {
    status: "local",      // local | online | offline
    flushing: false,

    remote: function () {
      var url = (MCC.config.SHEETS_URL || "").trim();
      return url ? new SheetsAdapter(url) : null;
    },

    newEntry: function (result, name) {
      return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        event: MCC.config.EVENT_ID,
        name: LB.cleanName(name),
        completed: !!result.completed,
        timeMs: result.timeMs,
        taps: result.taps,
        ts: Date.now(),
        config: result.configTag || ""
      };
    },

    cleanName: function (n) {
      n = String(n || "").replace(/[<>"'`=+@\\]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
      n = n.slice(0, MCC.config.NAME_MAX_LENGTH);
      return n || MCC.config.DEFAULT_NAME;
    },

    /* Save immediately on the tablet; sync to Sheets in the background. */
    submit: function (entry) {
      var all = read(K_LOCAL, []);
      all.push(entry);
      if (all.length > 5000) all = all.slice(all.length - 5000);
      write(K_LOCAL, all);
      if (LB.remote()) {
        var q = read(K_QUEUE, []); q.push(entry); write(K_QUEUE, q);
        LB.flush();
      }
      return entry;
    },

    pending: function () { return read(K_QUEUE, []); },

    flush: function () {
      var r = LB.remote();
      var q = read(K_QUEUE, []);
      if (!r || !q.length || LB.flushing) return Promise.resolve();
      LB.flushing = true;
      var batch = q.slice(0, 25);
      return r.submit(batch).then(function () {
        var ids = {}; batch.forEach(function (e) { ids[e.id] = 1; });
        write(K_QUEUE, read(K_QUEUE, []).filter(function (e) { return !ids[e.id]; }));
        // fold the synced entries into the cache so rankings stay correct offline
        var c = read(K_CACHE, null);
        if (c && c.event === MCC.config.EVENT_ID) {
          var have = {}; c.completed.forEach(function (e) { have[e.id] = 1; });
          batch.forEach(function (e) {
            if (e.event !== c.event || have[e.id]) return;
            c.totals.players++;
            if (e.completed) { c.totals.completed++; c.completed.push(e); } else c.totals.failed++;
          });
          write(K_CACHE, c);
        }
        LB.status = "online";
        LB.flushing = false;
        if (read(K_QUEUE, []).length) return LB.flush();
      }).catch(function () { LB.status = "offline"; LB.flushing = false; });
    },

    /* Returns a merged, sorted snapshot. Never throws. */
    load: function () {
      var ev = MCC.config.EVENT_ID;
      var r = LB.remote();
      if (!r) {
        LB.status = "local";
        return LocalAdapter.fetchSnapshot(ev).then(function (s) { s.source = "local"; return s; });
      }
      return r.fetchSnapshot(ev).then(function (d) {
        LB.status = "online";
        var snap = { event: ev, completed: d.completed || [], totals: d.totals || { players: 0, completed: 0, failed: 0 }, at: Date.now() };
        write(K_CACHE, snap);
        return LB.mergePending(snap, "online");
      }).catch(function () {
        LB.status = "offline";
        var c = read(K_CACHE, null);
        if (!c || c.event !== ev) c = { event: ev, completed: [], totals: { players: 0, completed: 0, failed: 0 } };
        return LB.mergePending(c, "offline");
      });
    },

    /* Instant (no network) snapshot from cache + pending — used right after a round. */
    loadCached: function () {
      var ev = MCC.config.EVENT_ID;
      if (!LB.remote()) return LocalAdapter.fetchSnapshot(ev).then(function (s) { s.source = "local"; return s; });
      var c = read(K_CACHE, null);
      if (!c || c.event !== ev) c = { event: ev, completed: [], totals: { players: 0, completed: 0, failed: 0 } };
      return Promise.resolve(LB.mergePending(c, LB.status));
    },

    mergePending: function (snap, source) {
      var ev = MCC.config.EVENT_ID;
      var seen = {};
      var list = snap.completed.map(function (e) { seen[e.id] = 1; return e; });
      var t = { players: snap.totals.players, completed: snap.totals.completed, failed: snap.totals.failed };
      read(K_QUEUE, []).forEach(function (e) {
        if (e.event !== ev || seen[e.id]) return;
        t.players++;
        if (e.completed) { t.completed++; list.push(e); } else t.failed++;
      });
      list.sort(byTime);
      return { completed: list, totals: t, source: source };
    },

    rankOf: function (entry, snap) {
      var r = 1;
      for (var i = 0; i < snap.completed.length; i++) {
        var e = snap.completed[i];
        if (e.id === entry.id) continue;
        if (e.timeMs < entry.timeMs || (e.timeMs === entry.timeMs && e.ts < entry.ts)) r++;
      }
      return r;
    },

    resetAll: function (token) {
      var ev = MCC.config.EVENT_ID;
      var r = LB.remote();
      write(K_QUEUE, read(K_QUEUE, []).filter(function (e) { return e.event !== ev; }));
      write(K_CACHE, null);
      return LocalAdapter.reset(ev).then(function () {
        if (!r) return { ok: true };
        return r.reset(ev, token);
      });
    },

    clearLocalData: function () {
      [K_LOCAL, K_QUEUE, K_CACHE].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    },

    exportCSV: function () {
      var rows = [["timestamp", "event", "name", "status", "time_sec", "taps", "config", "id"]];
      read(K_LOCAL, []).forEach(function (e) {
        rows.push([new Date(e.ts).toISOString(), e.event, e.name, e.completed ? "COMPLETED" : "NOT COMPLETED",
          e.completed ? (e.timeMs / 1000).toFixed(2) : "", e.taps, e.config, e.id]);
      });
      return rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    },

    ping: function () { var r = LB.remote(); return r ? r.ping() : Promise.resolve({ ok: false, error: "No Sheets URL set" }); }
  };

  // retry the queue every 20 s and whenever the tablet comes back online
  setInterval(function () { LB.flush(); }, 20000);
  window.addEventListener("online", function () { LB.flush(); });

  MCC.Leaderboard = LB;
  MCC.LeaderboardAdapters = { LocalAdapter: LocalAdapter, SheetsAdapter: SheetsAdapter };
})();

/* ==========================================================================
   ADMIN / TEST MODE  (hidden)
   Open with:  • 5 quick taps on the top-left corner of the screen
               • Ctrl + Shift + A  (or Cmd + Shift + A)
               • the URL  /admin   or   ?admin
   Protected by ADMIN_PIN (config.js). Settings are saved on this tablet.
   ========================================================================== */
window.MCC = window.MCC || {};

MCC.Admin = (function () {
  var root, api = {}, open = false, unlocked = false;
  var FIELDS = [
    ["GAME_DURATION", "Game duration (sec)", "number"],
    ["ICE_TAPS_REQUIRED", "Ice taps required", "number"],
    ["LIME_INTERVAL", "Taps per lime slice", "number"],
    ["MAX_LIME_SLICES", "Lime slices (0–4)", "number"],
    ["LIQUID_TAPS_REQUIRED", "Liquid taps required", "number"],
    ["MIN_TAP_INTERVAL_MS", "Min ms between taps (debounce)", "number"],
    ["EVENT_ID", "Event ID (separate leaderboards)", "text"],
    ["SHEETS_URL", "Google Sheets Web App URL (/exec)", "text"],
    ["ADMIN_PIN", "Admin PIN", "text"]
  ];

  function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function msg(t, bad) { var m = root.querySelector(".msg"); if (m) { m.textContent = t; m.style.color = bad ? "#b3261e" : "#0a7a3a"; } }

  function renderPin() {
    root.innerHTML = "";
    var box = el('<div class="admin-box pin"><h2>Admin</h2><p class="note">Enter PIN</p>' +
      '<input type="password" inputmode="numeric" autocomplete="off" id="adm-pin"><div class="row" style="justify-content:center">' +
      '<button class="primary" id="adm-go">Unlock</button><button id="adm-x">Close</button></div><div class="msg"></div></div>');
    root.appendChild(box);
    var inp = box.querySelector("#adm-pin");
    setTimeout(function () { inp.focus(); }, 50);
    function tryPin() {
      if (inp.value === String(MCC.config.ADMIN_PIN)) { unlocked = true; renderPanel(); }
      else { msg("Wrong PIN", true); inp.value = ""; }
    }
    box.querySelector("#adm-go").onclick = tryPin;
    inp.onkeydown = function (e) { if (e.key === "Enter") tryPin(); e.stopPropagation(); };
    box.querySelector("#adm-x").onclick = close;
  }

  function renderPanel() {
    var c = MCC.config;
    var tapsToWin = MCC.computeProgress(0, c).tapsToWin;
    root.innerHTML = "";
    var fields = FIELDS.map(function (f) {
      return '<label>' + f[1] + '<input data-k="' + f[0] + '" type="' + f[2] + '" value="' + esc(c[f[0]]) + '"></label>';
    }).join("");
    var box = el('<div class="admin-box">' +
      '<div class="row" style="justify-content:space-between"><h2>MONTY Cup Challenge · Admin</h2><button id="adm-x">Close ✕</button></div>' +
      '<h3>Players (event: ' + esc(c.EVENT_ID) + ')</h3><div class="stats-row" id="adm-kpis"><div class="kpi">Loading…</div></div>' +
      '<h3>Physical button</h3><div class="row">Current key: <span class="keycap" id="adm-key">' + esc(MCC.Input.describeKey(c.BUTTON_KEY)) + '</span>' +
      '<button class="primary" id="adm-learn">Learn button</button>' +
      '<label style="flex-direction:row;align-items:center;gap:8px">Input mode <select id="adm-mode">' +
      [["auto", "Auto (recommended)"], ["button", "Button / keyboard only"], ["touch", "Screen tap only"], ["both", "Button + screen tap"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (c.INPUT_MODE === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + '</select></label></div>' +
      '<p class="note">Press “Learn button”, then press your Bluetooth button once. The key it sends is saved.</p>' +
      '<div class="row"><span class="note" id="adm-inmode"></span><button id="adm-reseen">Reset button detection</button></div>' +
      '<h3>Game settings</h3><div class="grid">' + fields + '</div>' +
      '<p class="note" id="adm-diff">Taps needed to complete the cup: <b>' + tapsToWin + '</b> → ' + (tapsToWin / c.GAME_DURATION).toFixed(1) + ' taps/second to win.</p>' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="adm-save">Save settings</button><button id="adm-defaults">Reset settings to defaults</button></div>' +
      '<h3>Test</h3><div class="row"><button id="adm-test">Play test round (not saved)</button>' +
      '<label style="flex-direction:row;align-items:center;gap:8px">Auto-play demo at <input id="adm-rate" type="number" value="9" style="width:70px"> taps/sec</label><button id="adm-demo">Run demo</button>' +
      '<button id="adm-ping">Test Sheets connection</button></div>' +
      '<h3>Leaderboard data</h3><div class="row"><button id="adm-add">Add 10 test scores</button><button id="adm-csv">Export CSV (this tablet)</button>' +
      '<input id="adm-token" placeholder="Sheets admin token (for reset)" style="width:240px">' +
      '<button class="danger" id="adm-reset">Reset leaderboard (this event)</button><button class="danger" id="adm-clear">Clear ALL local data</button></div>' +
      '<p class="note">Reset archives the Google Sheet rows for this event (needs the token set in Code.gs). Changing the Event ID also starts a fresh board.</p>' +
      '<h3>Kiosk</h3><div class="row"><button id="adm-fs">Enter fullscreen</button><button id="adm-reload">Reload app</button></div>' +
      '<div class="msg"></div></div>');
    root.appendChild(box);
    var $ = function (id) { return box.querySelector(id); };

    // keep typing inside admin from reaching the game
    box.addEventListener("keydown", function (e) { e.stopPropagation(); });

    $("#adm-x").onclick = close;
    $("#adm-learn").onclick = function () {
      $("#adm-key").textContent = "press your button…";
      MCC.Input.learnNextKey(function (k) {
        var key = k.key === " " ? " " : (k.key && k.key !== "Unidentified" ? k.key : k.code);
        MCC.saveConfigOverrides({ BUTTON_KEY: key });
        $("#adm-key").textContent = MCC.Input.describeKey(key) + (k.code ? "  (" + k.code + ")" : "");
        msg("Button saved: " + MCC.Input.describeKey(key));
        paintMode();
      });
    };
    var paintMode = function () {
      var I = MCC.Input;
      $("#adm-inmode").textContent = "This device: " + (I.isTouchDevice() ? "touch screen" : "no touch screen") +
        " · Bluetooth button seen: " + (I.buttonSeen() ? "yes" : "no") +
        " → screen taps are " + (I.touchAllowed() ? "ON" : "OFF") + ".";
    };
    paintMode();
    $("#adm-mode").onchange = function (e) { MCC.saveConfigOverrides({ INPUT_MODE: e.target.value }); paintMode(); msg("Saved"); if (api.onConfigChanged) api.onConfigChanged(); };
    $("#adm-reseen").onclick = function () { MCC.Input.resetButtonSeen(); paintMode(); msg("Detection reset — screen taps work again until the button is pressed."); };
    $("#adm-save").onclick = function () {
      var patch = {};
      box.querySelectorAll("[data-k]").forEach(function (i) {
        var k = i.getAttribute("data-k");
        patch[k] = i.type === "number" ? Number(i.value) : i.value.trim();
      });
      MCC.saveConfigOverrides(patch);
      renderPanel(); msg("Settings saved on this tablet.");
      if (api.onConfigChanged) api.onConfigChanged();
    };
    $("#adm-defaults").onclick = function () {
      if (!confirm("Reset all settings to config.js defaults?")) return;
      MCC.resetConfigOverrides(); renderPanel(); msg("Defaults restored.");
      if (api.onConfigChanged) api.onConfigChanged();
    };
    $("#adm-test").onclick = function () { close(); if (api.onTestRound) api.onTestRound(); };
    $("#adm-demo").onclick = function () { var r = Math.max(1, Number($("#adm-rate").value) || 9); close(); if (api.onDemo) api.onDemo(r); };
    $("#adm-ping").onclick = function () {
      msg("Testing…");
      MCC.Leaderboard.ping().then(function (d) { msg(d.ok ? "Google Sheets connected ✓" : ("Not connected: " + (d.error || "")), !d.ok); })
        .catch(function (e) { msg("Not connected: " + e.message, true); });
    };
    $("#adm-add").onclick = function () {
      var names = ["KEVIN", "JASON", "SARAH", "BUDI", "SITI", "RINA", "ANDI", "MEGA", "DIMAS", "LALA", "OSCAR", "PUTRI"];
      for (var i = 0; i < 10; i++) {
        var done = Math.random() < 0.75;
        MCC.Leaderboard.submit(MCC.Leaderboard.newEntry({
          completed: done, timeMs: done ? Math.round(15000 + Math.random() * 14500) : c.GAME_DURATION * 1000,
          taps: done ? tapsToWin : Math.round(tapsToWin * (0.5 + Math.random() * 0.45)), configTag: "TEST"
        }, names[Math.floor(Math.random() * names.length)]));
      }
      msg("Added 10 test scores."); loadKpis();
    };
    $("#adm-csv").onclick = function () {
      var blob = new Blob([MCC.Leaderboard.exportCSV()], { type: "text/csv" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "monty-cup-scores-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
    };
    $("#adm-reset").onclick = function () {
      if (!confirm("Reset the leaderboard for event “" + c.EVENT_ID + "”?")) return;
      MCC.Leaderboard.resetAll($("#adm-token").value.trim()).then(function (d) {
        msg(d && d.ok ? "Leaderboard reset." : ("Local reset done. Sheets: " + ((d && d.error) || "failed")), !(d && d.ok));
        loadKpis();
      }).catch(function (e) { msg("Local reset done. Sheets: " + e.message, true); loadKpis(); });
    };
    $("#adm-clear").onclick = function () {
      if (!confirm("Delete ALL scores and the sync queue stored on this tablet? (Google Sheet is not touched.)")) return;
      MCC.Leaderboard.clearLocalData(); msg("Local data cleared."); loadKpis();
    };
    $("#adm-fs").onclick = function () { var d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || function () {}).call(d); };
    $("#adm-reload").onclick = function () { location.reload(); };
    loadKpis();
  }

  function loadKpis() {
    var k = root.querySelector("#adm-kpis"); if (!k) return;
    MCC.Leaderboard.load().then(function (s) {
      var best = s.completed[0];
      var pend = MCC.Leaderboard.pending().length;
      k.innerHTML =
        '<div class="kpi">Total players<b>' + s.totals.players + '</b></div>' +
        '<div class="kpi">Completed<b>' + s.totals.completed + '</b></div>' +
        '<div class="kpi">Not completed<b>' + s.totals.failed + '</b></div>' +
        '<div class="kpi">Best time<b>' + (best ? (best.timeMs / 1000).toFixed(2) + "s" : "–") + '</b></div>' +
        '<div class="kpi">Storage<b style="font-size:18px">' + (MCC.config.SHEETS_URL ? "Sheets · " + s.source : "This tablet") + '</b></div>' +
        '<div class="kpi">Waiting to sync<b>' + pend + '</b></div>';
    });
  }

  function openAdmin() {
    if (open) return;
    open = true;
    root.className = "admin";
    if (api.onOpen) api.onOpen();
    if (unlocked) renderPanel(); else renderPin();
  }
  function close() {
    open = false; MCC.Input.cancelLearn();
    root.className = "admin hidden"; root.innerHTML = "";
    if (api.onClose) api.onClose();
  }

  return {
    init: function (hooks) {
      api = hooks || {};
      root = document.getElementById("admin-root");
      root.className = "admin hidden";
      // 5 taps in the top-left corner
      var taps = [];
      document.getElementById("admin-hotspot").addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        var now = Date.now(); taps = taps.filter(function (t) { return now - t < 2500; }); taps.push(now);
        if (taps.length >= 5) { taps = []; openAdmin(); }
      });
      window.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "A" || e.key === "a")) { e.preventDefault(); openAdmin(); }
      });
      var p = location.pathname.replace(/\/+$/, "");
      if (/\/admin$/.test(p) || /[?&]admin\b/.test(location.search) || location.hash === "#admin") setTimeout(openAdmin, 300);
    },
    open: openAdmin,
    close: close,
    isOpen: function () { return open; }
  };
})();

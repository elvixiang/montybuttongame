/* ==========================================================================
   UI + FLOW
   ATTRACT → COUNTDOWN → GAME → (WIN → NAME) | (TIME'S UP) → LEADERBOARD → …
   ========================================================================== */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var cfg = function () { return MCC.config; };

  var S = {
    screen: null, guardUntil: 0, result: null, entry: null,
    test: false, demo: 0, demoAcc: 0, panel: null,
    timers: {}, lastSecond: null, warned5: false
  };
  var img = {}, engine, cup, confetti;

  var STAGES = {
    1: ["STAGE 1", "FILLING ICE"],
    2: ["STAGE 2", "ADDING LIME"],
    3: ["STAGE 3", "FILLING LEMON CRUSH"]
  };

  // ---------------------------------------------------------------- boot
  function loadImages() {
    var keys = Object.keys(MCC.ASSETS);
    return Promise.all(keys.map(function (k) {
      return new Promise(function (res) {
        var i = new Image();
        i.onload = function () { img[k] = i; res(); };
        i.onerror = function () { console.error("Missing asset", MCC.ASSETS[k]); img[k] = i; res(); };
        i.src = MCC.ASSETS[k];
      });
    }));
  }

  function boot() {
    buildFloaties();
    loadImages().then(function () {
      confetti = new MCC.Confetti($("confetti"));
      cup = new MCC.CupRenderer($("cup-canvas"), img);
      engine = new MCC.GameEngine(hooks);
      MCC.Input.init(onPress, applyInputMode);
      MCC.Admin.init({
        onTestRound: function () { startRound({ test: true }); },
        onDemo: function (rate) { startRound({ test: true, demo: rate }); },
        onConfigChanged: function () { if (S.screen === "attract") goAttract(); }
      });
      wireUI();
      goAttract();
      $("app").classList.remove("loading");
      $("boot").classList.add("gone");
      requestAnimationFrame(frame);
      if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      }
    });
  }

  // ---------------------------------------------------------------- loop
  var last = performance.now();
  function frame(now) {
    var dt = now - last; last = now;
    engine.update(now);
    if (S.demo && engine.state === "playing") {
      S.demoAcc += dt * S.demo / 1000;
      while (S.demoAcc >= 1 && engine.state === "playing") { S.demoAcc -= 1; engine.press(now); }
    }
    if (S.screen === "game") { updateTimer(); cup.render(now, dt); }
    confetti.render(dt);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- screens
  function show(name) {
    ["attract", "game", "board"].forEach(function (n) { $("screen-" + n).classList.toggle("active", n === name); });
    S.screen = name;
    document.body.setAttribute("data-screen", name);
    if (name === "game") cup.resize();
  }

  function clearTimers() { Object.keys(S.timers).forEach(function (k) { clearTimeout(S.timers[k]); }); S.timers = {}; }
  function later(name, ms, fn) { clearTimeout(S.timers[name]); S.timers[name] = setTimeout(fn, ms); }

  // screen-tap vs button wording
  function applyInputMode() {
    var touch = MCC.Input.touchAllowed();
    document.body.classList.toggle("touch-input", touch);
    $("cta-text").textContent = touch ? "TAP TO PLAY" : "PRESS TO PLAY";
    $("countdown-sub").textContent = touch ? "TAP THE SCREEN AS FAST AS YOU CAN!" : "PRESS THE BUTTON AS FAST AS YOU CAN!";
  }

  function goAttract() {
    clearTimers();
    applyInputMode();
    S.panel = null; S.demo = 0;
    confetti.clear();
    show("attract");
    renderChamps();
  }

  function renderChamps() {
    var box = $("attract-champs");
    MCC.Leaderboard.load().then(function (s) {
      if (S.screen !== "attract") return;
      var top = s.completed.slice(0, 3);
      if (!top.length) { box.innerHTML = '<div class="lead">Be the first MONTY Champion!</div>'; return; }
      var medals = ["🥇", "🥈", "🥉"];
      box.innerHTML = '<div class="lead">MONTY CHAMPIONS</div>' + top.map(function (e, i) {
        return '<div class="chip">' + medals[i] + " " + esc(e.name) + " <small>" + fmt2(e.timeMs) + " sec</small></div>";
      }).join("");
    });
  }

  // ---------------------------------------------------------------- round
  function startRound(opts) {
    opts = opts || {};
    clearTimers();
    confetti.clear();
    S.test = !!opts.test; S.demo = opts.demo || 0; S.demoAcc = 0;
    S.result = null; S.entry = null; S.panel = null; S.lastSecond = null; S.warned5 = false;
    MCC.loadConfig();
    applyInputMode();

    var g = $("screen-game");
    g.classList.remove("results", "locked");
    g.classList.toggle("testing", S.test);
    $("panel-win").classList.remove("show");
    $("panel-fail").classList.remove("show");
    $("cup-stage").classList.remove("win");
    $("monty-game").className = "monty monty-game";
    $("taps").textContent = "0";
    $("time").textContent = cfg().GAME_DURATION.toFixed(1);
    $("timer-card").classList.remove("warn");
    setStage(1, false);
    setTracker(MCC.computeProgress(0, cfg()));
    $("name-input").value = "";
    $("name-input").maxLength = cfg().NAME_MAX_LENGTH;
    $("name-input").placeholder = cfg().DEFAULT_NAME;
    $("default-name").textContent = cfg().DEFAULT_NAME;

    cup.reset();
    show("game");
    engine.startCountdown(performance.now());
  }

  var hooks = {
    onCountdown: function (n) {
      var box = $("countdown"), span = $("countdown-num");
      box.classList.add("show");
      span.textContent = n > 0 ? n : "GO!";
      span.className = "outline" + (n > 0 ? "" : " go");
      void span.offsetWidth; span.classList.add("anim");
      MCC.Sound.count(n);
    },
    onStart: function () { later("hidecount", 700, function () { $("countdown").classList.remove("show"); }); },
    onTap: function (p, prev) {
      cup.onTap(p, prev, performance.now());
      var t = $("taps"); t.textContent = p.taps; t.classList.remove("pop"); void t.offsetWidth; t.classList.add("pop");
      setTracker(p);
      if (p.limes > prev.limes) MCC.Sound.lime();
      else if (p.stage === 1 || prev.stage === 1) MCC.Sound.ice();
      else if (p.stage === 2) MCC.Sound.limeTick();
      else MCC.Sound.pour();
      bounceMonty();
    },
    onStage: function (st) {
      setStage(st, true);
      banner(st === 2 ? "ICE FULL! ADD LIME!" : "POUR THE LEMON CRUSH!");
      MCC.Sound.stage();
    },
    onWin: function (res) { handleWin(res); },
    onTimeUp: function (res) { handleFail(res); }
  };

  function setStage(st, flash) {
    $("stage-no").textContent = STAGES[st][0];
    $("stage-name").textContent = STAGES[st][1];
    if (flash) { var c = $("stage-card"); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }
  }

  function setTracker(p) {
    for (var i = 1; i <= 3; i++) {
      var li = $("trk-" + i);
      li.classList.toggle("on", p.stage === i && !p.complete);
      li.classList.toggle("done", p.stageFill[i - 1] >= 1);
      $("bar-" + i).style.width = (p.stageFill[i - 1] * 100).toFixed(1) + "%";
    }
    $("trk-2").style.display = p.maxLimes > 0 ? "" : "none";
  }

  function updateTimer() {
    var ms = engine.timeLeftMs();
    var txt = (Math.ceil(ms / 100) / 10).toFixed(1);
    var el = $("time");
    if (el.textContent !== txt) el.textContent = txt;
    if (engine.state === "playing") {
      var warn = ms <= 5000;
      $("timer-card").classList.toggle("warn", warn);
      var sec = Math.ceil(ms / 1000);
      if (warn && sec !== S.lastSecond) { S.lastSecond = sec; MCC.Sound.tick(); }
      if (warn && !S.warned5 && engine.progress.stage < 3) { S.warned5 = true; banner("5 SECONDS LEFT!"); }
    }
  }

  function banner(text) {
    var b = $("banner"); b.textContent = text;
    b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
  }

  function ripple(x, y) {
    var r = document.createElement("span");
    r.className = "ripple";
    r.style.left = x + "px"; r.style.top = y + "px";
    r.addEventListener("animationend", function () { r.remove(); });
    $("screen-game").appendChild(r);
  }

  function bounceMonty() {
    var m = $("monty-game");
    if (m.animate) m.animate([{ transform: "scale(1.1,.88)" }, { transform: "translateY(-1.2rem) scale(.97,1.04)" }, { transform: "none" }], { duration: 200, easing: "ease-out" });
  }

  // ---------------------------------------------------------------- results
  function handleWin(res) {
    var now = performance.now();
    S.result = res; S.demo = 0;
    $("timer-card").classList.remove("warn");
    cup.celebrate(now);
    confetti.burst();
    MCC.Sound.win();
    banner("CUP COMPLETE!");
    $("cup-stage").classList.add("win");
    $("monty-game").classList.add("cheer");
    $("win-time").textContent = fmt2(res.timeMs);
    $("win-taps").textContent = res.taps;
    S.guardUntil = now + 1500 + cfg().RESULT_INPUT_GUARD_MS;
    later("panel", 1500, function () {
      lockPanels();
      $("screen-game").classList.add("results");
      $("panel-win").classList.add("show");
      S.panel = "win";
    });
    later("name", 1500 + cfg().NAME_TIMEOUT_MS, function () { if (S.panel === "win") submitName(true); });
  }

  function handleFail(res) {
    var now = performance.now();
    S.result = res; S.demo = 0;
    MCC.Sound.timeUp();
    banner("TIME'S UP!");
    $("time").textContent = "0.0";
    $("timer-card").classList.remove("warn");
    $("monty-game").classList.add("sad");
    $("fail-taps").textContent = res.taps;
    $("fail-time").textContent = (res.timeMs / 1000).toFixed(1);
    var pct = Math.floor(res.progress.overall * 100);
    $("fail-pct").textContent = pct + "%";
    $("fail-bar").style.width = "0%";
    if (!S.test) {
      S.entry = MCC.Leaderboard.newEntry(res, "");
      MCC.Leaderboard.submit(S.entry);
    }
    S.guardUntil = now + 900 + cfg().RESULT_INPUT_GUARD_MS;
    later("panel", 900, function () {
      lockPanels();
      $("screen-game").classList.add("results");
      $("panel-fail").classList.add("show");
      $("fail-bar").style.width = pct + "%";
      S.panel = "fail";
    });
    later("idle", 900 + cfg().IDLE_RETURN_MS, goAttract);
  }

  function lockPanels() {
    var g = $("screen-game");
    g.classList.add("locked");
    later("unlock", cfg().RESULT_INPUT_GUARD_MS, function () { g.classList.remove("locked"); });
  }

  function submitName(auto) {
    if (S.panel !== "win" || !S.result) return;
    var input = $("name-input");
    var name = auto ? "" : input.value;
    input.blur();
    var entry = MCC.Leaderboard.newEntry(S.result, name);
    if (!S.test) MCC.Leaderboard.submit(entry);
    S.entry = entry;
    S.panel = null;
    MCC.Sound.click();
    goBoard(entry);
  }

  // ---------------------------------------------------------------- leaderboard
  function goBoard(entry) {
    clearTimers();
    confetti.clear();
    show("board");
    S.guardUntil = performance.now() + 900;
    var paint = function (snap) { if (S.screen === "board") renderBoard(snap, entry); };
    MCC.Leaderboard.loadCached().then(function (snap) {
      paint(snap);
      MCC.Leaderboard.load().then(paint);
    });
    later("idle", cfg().IDLE_RETURN_MS, goAttract);
  }

  function renderBoard(snap, entry) {
    var n = cfg().LEADERBOARD_SIZE;
    var medals = ["🥇", "🥈", "🥉"];
    var rows = "";
    for (var i = 0; i < n; i++) {
      var e = snap.completed[i];
      if (e) {
        var me = entry && e.id === entry.id;
        rows += '<li class="' + (me ? "me" : "") + '" style="animation-delay:' + (i * 40) + 'ms"><span class="rk">' + (medals[i] || (i + 1)) +
          '</span><span class="nm">' + esc(e.name) + '</span><span class="tm">' + fmt2(e.timeMs) + '<small> SEC</small></span></li>';
      } else {
        rows += '<li class="empty"><span class="rk">' + (medals[i] || (i + 1)) + '</span><span class="nm">—</span><span class="tm"></span></li>';
      }
    }
    $("board-list").innerHTML = rows;

    var you = $("you-card");
    if (entry && entry.completed && !S.test) {
      var rank = MCC.Leaderboard.rankOf(entry, snap);
      var total = Math.max(snap.totals.completed, rank);
      you.innerHTML = '<div class="you-label">YOUR RESULT</div><div class="you-rank">#' + rank + '</div>' +
        '<div class="you-of">/ ' + total + (total === 1 ? " PLAYER" : " PLAYERS") + "</div>" +
        '<div class="you-name">' + esc(entry.name) + '</div><div class="you-time">' + fmt2(entry.timeMs) + " SEC</div>";
    } else if (entry && !entry.completed) {
      you.innerHTML = '<div class="you-label">YOUR RESULT</div><div class="you-big">NOT COMPLETED</div>' +
        '<div class="you-time">FINAL TAPS: <b>' + entry.taps + '</b></div><div class="you-time">TIME: ' + (entry.timeMs / 1000).toFixed(1) + " SEC</div>";
    } else if (S.test && S.result) {
      you.innerHTML = '<div class="you-label">TEST ROUND</div><div class="you-big">' + (S.result.completed ? fmt2(S.result.timeMs) + " SEC" : "NOT COMPLETED") + '</div><div class="you-time">Not saved</div>';
    } else {
      var best = snap.completed[0];
      you.innerHTML = '<div class="you-label">TIME TO BEAT</div><div class="you-big">' + (best ? fmt2(best.timeMs) + " SEC" : "—") + '</div>' +
        '<div class="you-time">' + snap.totals.completed + " champions so far</div>";
    }

    var sync = $("sync-status"), pend = MCC.Leaderboard.pending().length;
    if (!cfg().SHEETS_URL) sync.textContent = "Scores saved on this tablet";
    else if (snap.source === "online" && !pend) sync.textContent = "Synced to Google Sheets ✓";
    else sync.textContent = "Offline · " + pend + " result" + (pend === 1 ? "" : "s") + " waiting to sync";
  }

  // ---------------------------------------------------------------- input
  function onPress(ev) {
    MCC.Sound.unlock();
    keepAwake();
    if (MCC.Admin.isOpen()) return;
    var now = ev.time || performance.now();
    if (S.screen === "attract") { startRound(); return; }
    if (S.screen === "game") {
      if (engine.state === "playing") { engine.press(now); return; }
      if (now < S.guardUntil) return;
      if (S.panel === "win") submitName(false);
      else if (S.panel === "fail") startRound();
      return;
    }
    if (S.screen === "board" && now >= S.guardUntil) startRound();
  }

  function wireUI() {
    $("screen-attract").addEventListener("pointerdown", function () { MCC.Sound.unlock(); keepAwake(); if (!MCC.Admin.isOpen()) startRound(); });
    $("screen-game").addEventListener("pointerdown", function (e) {
      if (engine.state !== "playing" || e.target.closest(".panel")) return;
      if (!MCC.Input.touchAllowed()) return;
      e.preventDefault();
      if (MCC.Input.touch(performance.now())) ripple(e.clientX, e.clientY);
    });
    document.addEventListener("contextmenu", function (e) { if (!e.target.closest(".admin")) e.preventDefault(); });
    // result buttons ignore frantic taps that land right after the round ends
    var guarded = function (fn) { return function () { if (performance.now() >= S.guardUntil) fn(); }; };
    $("btn-submit").onclick = guarded(function () { submitName(false); });
    $("btn-skip").onclick = guarded(function () { submitName(true); });
    $("name-input").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitName(false); } });
    $("name-input").addEventListener("input", function (e) {
      later("name", cfg().NAME_TIMEOUT_MS, function () { if (S.panel === "win") submitName(false); });
    });
    $("btn-retry").onclick = guarded(function () { startRound(); });
    $("btn-board-fail").onclick = guarded(function () { goBoard(S.entry); });
    $("btn-again").onclick = guarded(function () { startRound(); });
    $("btn-home").onclick = goAttract;

    var mute = $("mute");
    var paintMute = function () { mute.textContent = MCC.Sound.isMuted() ? "🔇" : "🔊"; };
    paintMute();
    mute.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    mute.onclick = function () { MCC.Sound.setMuted(!MCC.Sound.isMuted()); paintMute(); };
    window.addEventListener("keydown", function (e) {
      if ((e.key === "m" || e.key === "M") && !/input|textarea/i.test(e.target.tagName) && !MCC.Admin.isOpen()) { MCC.Sound.setMuted(!MCC.Sound.isMuted()); paintMute(); }
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) keepAwake(); });
  }

  // screen wake lock so the tablet never sleeps mid-event
  var lock = null;
  function keepAwake() {
    if (lock || !navigator.wakeLock || document.hidden) return;
    navigator.wakeLock.request("screen").then(function (l) {
      lock = l; l.addEventListener("release", function () { lock = null; });
    }).catch(function () {});
  }

  // ---------------------------------------------------------------- decor
  function buildFloaties() {
    var flake = '<svg viewBox="-12 -12 24 24"><g stroke-linecap="round">' +
      [0, 60, 120].map(function (a) {
        return '<g transform="rotate(' + a + ')"><line y1="-10" y2="10"/><path d="M-3 -7 L0 -4 L3 -7 M-3 7 L0 4 L3 7" fill="none"/></g>';
      }).join("") + "</g></svg>";
    var svgFlake = flake.replace("<g stroke-linecap", '<g stroke="#fff" stroke-width="4.2" stroke-linecap') +
      flake.replace("<svg", '<svg style="position:absolute;inset:0"').replace("<g stroke-linecap", '<g stroke="#7CCBF2" stroke-width="2.2" stroke-linecap');
    var spots = [[4, 12, 5], [14, 72, 4], [30, 88, 3], [47, 6, 3.4], [62, 90, 4.4], [80, 8, 5.4], [92, 40, 3.6], [88, 78, 5], [38, 34, 2.6], [70, 30, 2.8], [8, 44, 3], [55, 62, 2.4]];
    var box = $("floaties");
    spots.forEach(function (s, i) {
      var d = document.createElement("div");
      d.className = "floaty";
      d.style.cssText = "left:" + s[0] + "%;top:" + s[1] + "%;width:" + s[2] + "rem;height:" + s[2] + "rem;--d:" + (9 + i % 5 * 2) + "s;--dx:" + ((i % 2 ? -1 : 1) * (1 + i % 3)) + "rem;--dy:" + (-2 - i % 4) + "rem;--dr:" + (30 + i * 12) + "deg";
      d.innerHTML = svgFlake;
      box.appendChild(d);
    });
  }

  // ---------------------------------------------------------------- utils
  function fmt2(ms) { return (ms / 1000).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // expose for debugging / automated tests
  MCC.App = { S: S, get engine() { return engine; }, get cup() { return cup; }, startRound: startRound, goAttract: goAttract, goBoard: goBoard };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

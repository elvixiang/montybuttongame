/* ==========================================================================
   SOUND — synthesized with the Web Audio API (no audio files, zero latency).
   The game works identically with sound off.
   ========================================================================== */
window.MCC = window.MCC || {};

MCC.Sound = (function () {
  var ctx = null, master = null, noise = null;
  var muted = !MCC.config.SOUND_ON;
  try { var m = localStorage.getItem("mcc.muted"); if (m !== null) muted = m === "1"; } catch (e) {}

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return !!ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    // 1 s of white noise, reused for ice / fizz
    var len = ctx.sampleRate;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noise.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function ok() { return !muted && ensure(); }

  function env(g, t, a, peak, dcy) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }

  function tone(type, f0, f1, dur, peak, delay) {
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, peak, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function burst(filterType, freq, q, dur, peak, delay) {
    var t = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource(); s.buffer = noise;
    var f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    var g = ctx.createGain();
    env(g, t, 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
  }

  return {
    unlock: function () { if (!muted) ensure(); },
    isMuted: function () { return muted; },
    setMuted: function (v) {
      muted = !!v;
      try { localStorage.setItem("mcc.muted", muted ? "1" : "0"); } catch (e) {}
      if (!muted) ensure();
    },
    // ---- effects ----
    ice: function () {             // crunchy ice
      if (!ok()) return;
      burst("bandpass", 2600 + Math.random() * 1800, 1.4, 0.06, 0.55);
      burst("highpass", 5000, 0.7, 0.025, 0.25, 0.012);
    },
    lime: function () {            // fresh "bloop"
      if (!ok()) return;
      tone("sine", 420, 980, 0.14, 0.5);
      tone("triangle", 1320, 1760, 0.09, 0.18, 0.05);
      burst("bandpass", 3000, 2, 0.05, 0.2, 0.02);
    },
    limeTick: function () {        // stage-2 taps between slices
      if (!ok()) return;
      tone("triangle", 700 + Math.random() * 120, 0, 0.05, 0.16);
    },
    pour: function () {            // fizz + glug
      if (!ok()) return;
      burst("lowpass", 1400, 0.8, 0.12, 0.35);
      burst("highpass", 6000, 0.5, 0.09, 0.12, 0.02);
      tone("sine", 260 + Math.random() * 60, 520, 0.08, 0.22);
    },
    count: function (n) {          // 3, 2, 1  (n=0 -> GO!)
      if (!ok()) return;
      if (n > 0) tone("square", 660, 0, 0.14, 0.22);
      else { tone("square", 880, 0, 0.1, 0.22); tone("square", 1320, 0, 0.3, 0.22, 0.1); }
    },
    tick: function () {            // last seconds
      if (!ok()) return;
      tone("square", 1200, 0, 0.04, 0.12);
    },
    stage: function () {
      if (!ok()) return;
      tone("triangle", 660, 0, 0.1, 0.25); tone("triangle", 990, 0, 0.16, 0.25, 0.08);
    },
    win: function () {
      if (!ok()) return;
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        tone("triangle", f, 0, 0.26, 0.32, i * 0.09);
        tone("square", f * 2, 0, 0.12, 0.06, i * 0.09);
      });
      for (var i = 0; i < 6; i++) burst("highpass", 7000, 1, 0.08, 0.14, 0.45 + i * 0.07);
    },
    timeUp: function () {
      if (!ok()) return;
      tone("sawtooth", 440, 220, 0.5, 0.2);
      tone("square", 330, 165, 0.55, 0.12, 0.05);
    },
    click: function () {
      if (!ok()) return;
      tone("sine", 900, 600, 0.05, 0.2);
    }
  };
})();

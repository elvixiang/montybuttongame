/* ==========================================================================
   CUP RENDERER — draws the MONTY&Co. cup being built, layer by layer:
     back rim → settled ice chunks → crushed-ice body → ice dome →
     Lemon Crush liquid → lime slices → falling pieces → front of cup → particles
   All geometry is in "cup space" = pixels of assets/cup.webp (848 × 1146).
   ========================================================================== */
window.MCC = window.MCC || {};

(function () {
  // ---- Cup geometry (measured from the reference cup) -----------------------
  var G = {
    W: 848, H: 1146, CX: 423.5,
    RIM_Y: 95,                 // centre line of the rim opening
    FLOOR_Y: 1012, FLOOR_RY: 34,
    // scene bounds (room above the cup for falling ice / waiting lime)
    L: -70, R: 918, T: -300, B: 1160
  };
  G.SW = G.R - G.L; G.SH = G.B - G.T;
  G.left = function (y) { return 66 + 0.177 * (y - 150); };
  G.right = function (y) { return 781 - 0.177 * (y - 150); };
  G.hw = function (y) { return (G.right(y) - G.left(y)) / 2; };

  var ICE_FILL_SHARE = 0.9;          // share of the ice stage that fills the cup; the rest builds the dome
  var ICE_FULL_Y = G.RIM_Y + 20;     // ice body top when the cup is full of ice
  var LIQ_FULL_Y = G.RIM_Y + 24;     // liquid surface at 100 %
  var LIME_SLOTS = [                 // matched to the Lemon Crush reference photo
    { x: 560, y: 880, r: 172, rot: 0.5 },
    { x: 150, y: 600, r: 182, rot: -0.35 },
    { x: 468, y: 362, r: 180, rot: 0.12 },
    { x: 330, y: 720, r: 150, rot: 1.1 }
  ];
  var GARNISH = { x: 668, y: 22, r: 128, rot: -0.3 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function easeOutBack(t) { var c = 1.7; t -= 1; return t * t * ((c + 1) * t + c) + 1; }
  function surfNoise(x) {
    return 9 * Math.sin(x * 0.045 + 1.3) + 6 * Math.sin(x * 0.11 + 0.4) + 4 * Math.sin(x * 0.23 + 2.1);
  }

  // ---- Paths -----------------------------------------------------------------
  function interiorPath(ctx) {
    var y0 = G.RIM_Y;
    ctx.moveTo(G.left(y0), y0);
    ctx.lineTo(G.left(G.FLOOR_Y), G.FLOOR_Y);
    ctx.ellipse(G.CX, G.FLOOR_Y, G.hw(G.FLOOR_Y), G.FLOOR_RY, 0, Math.PI, 0, true);
    ctx.lineTo(G.right(y0), y0);
    ctx.ellipse(G.CX, y0, G.hw(y0), G.hw(y0) * 0.17, 0, 0, Math.PI, true);
    ctx.closePath();
  }
  // interior ∪ everything above the rim (same winding so the union is kept)
  function contentClip(ctx) {
    ctx.beginPath();
    ctx.moveTo(G.L, G.T); ctx.lineTo(G.L, G.RIM_Y); ctx.lineTo(G.R, G.RIM_Y); ctx.lineTo(G.R, G.T); ctx.closePath();
    interiorPath(ctx);
    ctx.clip();
  }
  function bodyTopY(x, level) {
    var hw = G.hw(level), t = clamp((x - G.CX) / hw, -1, 1);
    return level - hw * 0.13 * Math.sqrt(1 - t * t) + surfNoise(x) * (level > G.FLOOR_Y - 40 ? 0.4 : 1);
  }
  function bodyPath(ctx, level) {
    var x0 = G.left(level) - 8, x1 = G.right(level) + 8;
    ctx.beginPath();
    ctx.moveTo(x0, G.B);
    for (var x = x0; x <= x1; x += 8) ctx.lineTo(x, bodyTopY(x, level));
    ctx.lineTo(x1, bodyTopY(x1, level));
    ctx.lineTo(x1, G.B);
    ctx.closePath();
  }

  // ==========================================================================
  MCC.CupRenderer = function (canvas, img) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.img = img;
    this.atlas = MCC.ICE_ATLAS;
    this.body = document.createElement("canvas");
    this.chunks = document.createElement("canvas");
    this.bubbles = [];
    for (var i = 0; i < 38; i++) this.bubbles.push(this.newBubble(true));
    this.reset();
    var self = this;
    if (window.ResizeObserver) new ResizeObserver(function () { self.resize(); }).observe(canvas.parentElement);
    window.addEventListener("resize", function () { self.resize(); });
    this.resize();
  };

  var P = MCC.CupRenderer.prototype;

  P.reset = function () {
    this.target = MCC.computeProgress(0, MCC.config);
    this.iceShown = 0;       // eased ice fill (0..1 of cup)
    this.domeShown = 0;
    this.liqShown = 0;
    this.settled = [];       // baked chunk records
    this.falling = [];       // chunks in the air
    this.particles = [];
    this.limes = [];         // {slot, t0}
    this.garnish = null;
    this.bounceT = -1e9; this.bounceAmp = 0;
    this.waveAmp = 0;
    this.lastPour = -1e9;
    this.limeNudge = -1e9;
    this.celebrating = false;
    this.clearChunks();
  };

  P.resize = function () {
    var box = this.canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(box.width * dpr);
    this.canvas.height = Math.round(box.height * dpr);
    this.canvas.style.width = box.width + "px";
    this.canvas.style.height = box.height + "px";
    var s = Math.min(box.width / G.SW, box.height / G.SH);
    this.s = s;
    this.ox = (box.width - G.SW * s) / 2 - G.L * s;
    this.oy = box.height - G.SH * s - G.T * s;   // bottom-aligned
    // off-screen layers in scene space at device resolution
    this.bs = s * dpr;
    [this.body, this.chunks].forEach(function (c) {
      c.width = Math.ceil(G.SW * this.bs); c.height = Math.ceil(G.SH * this.bs);
    }, this);
    this.bakeBody();
    this.rebakeChunks();
  };

  P.layerCtx = function (c) {
    var x = c.getContext("2d");
    x.setTransform(this.bs, 0, 0, this.bs, -G.L * this.bs, -G.T * this.bs);
    return x;
  };

  /* Full cup of crushed ice, pre-rendered once; revealed per frame by a clip. */
  P.bakeBody = function () {
    var x = this.layerCtx(this.body);
    x.clearRect(G.L, G.T, G.SW, G.SH);
    x.save();
    x.beginPath(); interiorPath(x); x.clip();
    var pat = x.createPattern(this.img.iceTex, "repeat");
    if (pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix().scale(0.8));
    x.fillStyle = pat;
    x.fillRect(G.L, G.T, G.SW, G.SH);
    // cool depth shading toward the walls + bottom (reads as ice seen through plastic)
    var gx = x.createLinearGradient(G.left(500), 0, G.right(500), 0);
    gx.addColorStop(0, "rgba(70,110,150,0.30)");
    gx.addColorStop(0.18, "rgba(120,160,200,0.06)");
    gx.addColorStop(0.5, "rgba(255,255,255,0.05)");
    gx.addColorStop(0.82, "rgba(120,160,200,0.06)");
    gx.addColorStop(1, "rgba(70,110,150,0.30)");
    x.fillStyle = gx; x.fillRect(G.L, G.T, G.SW, G.SH);
    var gy = x.createLinearGradient(0, G.RIM_Y, 0, G.FLOOR_Y + 40);
    gy.addColorStop(0, "rgba(255,255,255,0.10)");
    gy.addColorStop(1, "rgba(90,120,150,0.22)");
    x.fillStyle = gy; x.fillRect(G.L, G.T, G.SW, G.SH);
    x.restore();
  };

  P.clearChunks = function () {
    if (!this.chunks.width) return;
    this.layerCtx(this.chunks).clearRect(G.L, G.T, G.SW, G.SH);
  };
  P.rebakeChunks = function () {
    this.clearChunks();
    for (var i = 0; i < this.settled.length; i++) this.bakeChunk(this.settled[i]);
  };
  P.bakeChunk = function (c) {
    var x = this.layerCtx(this.chunks);
    x.save(); contentClip(x);
    this.drawSprite(x, c.sprite, c.x, c.y, c.scale, c.rot, 1);
    x.restore();
  };

  P.drawSprite = function (ctx, idx, x, y, scale, rot, alpha) {
    var r = this.atlas[idx], w = r[2] * scale, h = r[3] * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.drawImage(this.img.iceAtlas, r[0], r[1], r[2], r[3], -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  // ---- levels ----------------------------------------------------------------
  function iceLevelY(fill) { return G.FLOOR_Y + 30 - fill * (G.FLOOR_Y + 30 - ICE_FULL_Y); }
  function liqLevelY(fill) { return G.FLOOR_Y + 8 - fill * (G.FLOOR_Y + 8 - LIQ_FULL_Y); }
  function iceFillOf(p) { return Math.min(p.ice / ICE_FILL_SHARE, 1); }
  function domeOf(p) { return clamp((p.ice - ICE_FILL_SHARE) / (1 - ICE_FILL_SHARE), 0, 1); }

  // ---- events from the game --------------------------------------------------
  P.onTap = function (p, prev, now) {
    this.target = p;
    this.bounceT = now; this.bounceAmp = 1;
    if (p.stage === 1 || (prev.stage === 1 && p.ice >= 1)) {
      var n = 1 + (Math.random() < 0.6 ? 1 : 0);
      for (var i = 0; i < n; i++) this.dropChunk(p, now, i * 40);
      this.spray("shard", G.CX + rand(-200, 200), iceLevelY(iceFillOf(p)) - 30, 3);
    } else if (p.stage === 2) {
      this.limeNudge = now;
      this.spray("leaf", G.CX + rand(-120, 120), G.RIM_Y - 20, 3);
    }
    if (p.limes > prev.limes) {
      for (var k = prev.limes; k < p.limes; k++) this.limes.push({ slot: LIME_SLOTS[k % LIME_SLOTS.length], t0: now, fromY: -200 + prev.limePartial * 120 });
      this.spray("leaf", LIME_SLOTS[(p.limes - 1) % 4].x, G.RIM_Y, 10);
    }
    if (p.liquid > prev.liquid) {
      this.lastPour = now;
      this.waveAmp = Math.min(this.waveAmp + 5, 12);
      var ly = liqLevelY(p.liquid);
      this.spray("drop", G.CX + rand(-140, 140), ly - 10, 4);
      for (var b = 0; b < 3; b++) this.bubbles.push(this.newBubble(false));
      if (this.bubbles.length > 70) this.bubbles.splice(0, this.bubbles.length - 70);
    }
  };

  P.dropChunk = function (p, now, delay) {
    var dome = domeOf(p);
    var sprite = Math.floor(Math.random() * this.atlas.length);
    var scale = rand(0.62, 1.0) * (sprite < 8 ? 0.75 : 1);
    var tx, ty;
    if (dome <= 0) {
      var lvl = iceLevelY(iceFillOf(p));
      tx = rand(G.left(lvl) + 30, G.right(lvl) - 30);
      ty = bodyTopY(tx, lvl) - this.atlas[sprite][3] * scale * 0.18;
    } else {
      var dw = 740 * (0.85 + 0.15 * dome), dh = 300 * (0.15 + 0.85 * dome);
      var t = rand(-0.85, 0.85);
      tx = G.CX + t * dw / 2;
      ty = G.RIM_Y + 70 - dh * (0.9 - 0.75 * t * t);
    }
    this.falling.push({
      sprite: sprite, scale: scale, rot: rand(-1, 1), vr: rand(-4, 4),
      x0: tx + rand(-60, 60), y0: G.T - 60, x: tx, y: ty,
      t0: now + (delay || 0), dur: rand(230, 300), bake: dome <= 0
    });
  };

  P.spray = function (kind, x, y, n) {
    for (var i = 0; i < n; i++) {
      this.particles.push({
        kind: kind, x: x + rand(-20, 20), y: y,
        vx: rand(-420, 420), vy: rand(-900, -420),
        life: 0, max: rand(0.45, 0.7), rot: rand(0, 6), vr: rand(-10, 10),
        size: kind === "shard" ? rand(0.22, 0.4) : rand(5, 11),
        sprite: 20 + Math.floor(Math.random() * 13)
      });
    }
    if (this.particles.length > 90) this.particles.splice(0, this.particles.length - 90);
  };

  P.celebrate = function (now) {
    this.celebrating = true;
    this.bounceT = now; this.bounceAmp = 2.4;
    this.garnish = { t0: now + 120 };
    this.waveAmp = 14;
    for (var i = 0; i < 4; i++) this.spray("star", G.CX + rand(-300, 300), G.RIM_Y + rand(-40, 200), 6);
  };

  P.newBubble = function (anywhere) {
    return {
      fx: Math.random(), y: anywhere ? rand(G.RIM_Y, G.FLOOR_Y) : G.FLOOR_Y - rand(0, 60),
      r: rand(2.5, 8), v: rand(40, 140), wob: rand(0, 6)
    };
  };

  // ---- per-frame -------------------------------------------------------------
  P.render = function (now, dt) {
    var ctx = this.ctx, p = this.target;
    dt = Math.min(dt || 16, 50) / 1000;

    // ease visible levels toward targets (fast so every tap is felt)
    var k = 1 - Math.exp(-dt * 14);
    this.iceShown += (iceFillOf(p) - this.iceShown) * k;
    this.domeShown += (domeOf(p) - this.domeShown) * k;
    this.liqShown += (p.liquid - this.liqShown) * k;
    this.waveAmp *= Math.exp(-dt * 3.2);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // scene transform + tap bounce (squash around the cup base)
    var bt = now - this.bounceT, b = 0;
    if (bt < 260) b = this.bounceAmp * Math.pow(1 - bt / 260, 2) * Math.cos(bt * 0.042);
    var sx = 1 + 0.012 * b, sy = 1 - 0.02 * b;
    var S = this.s * this.dpr;
    ctx.setTransform(S, 0, 0, S, this.ox * this.dpr, this.oy * this.dpr);
    ctx.translate(G.CX, G.H); ctx.scale(sx, sy); ctx.translate(-G.CX, -G.H);

    var cup = this.img.cup;

    // 1. back rim
    ctx.save(); ctx.beginPath(); ctx.rect(G.L, G.T, G.SW, G.RIM_Y - G.T); ctx.clip();
    ctx.drawImage(cup, 0, 0); ctx.restore();

    // 2. contents
    ctx.save(); contentClip(ctx);
    var bl = this.bs;
    ctx.drawImage(this.chunks, G.L, G.T, this.chunks.width / bl, this.chunks.height / bl);
    if (this.iceShown > 0.002) {
      var lvl = iceLevelY(this.iceShown);
      ctx.save(); bodyPath(ctx, lvl); ctx.clip();
      ctx.drawImage(this.body, G.L, G.T, this.body.width / bl, this.body.height / bl);
      ctx.restore();
    }
    if (this.domeShown > 0.002) this.drawDome(ctx, this.domeShown);
    if (this.liqShown > 0.001) this.drawLiquid(ctx, now, dt);
    this.drawLimes(ctx, now);
    this.drawPour(ctx, now);
    this.drawFalling(ctx, now);
    ctx.restore();

    // 3. garnish on the rim (win) + the next lime waiting above the cup
    this.drawGarnish(ctx, now);
    this.drawWaitingLime(ctx, now);

    // 4. front of the cup (print, walls, front rim)
    ctx.save(); ctx.beginPath(); ctx.rect(G.L, G.RIM_Y, G.SW, G.B - G.RIM_Y); ctx.clip();
    ctx.drawImage(cup, 0, 0); ctx.restore();

    // 5. particles on top
    this.drawParticles(ctx, dt);
  };

  P.drawDome = function (ctx, d) {
    var img = this.img.pile;
    var w = 740 * (0.85 + 0.15 * d), h = 300 * (0.15 + 0.85 * d);
    ctx.drawImage(img, G.CX - w / 2, G.RIM_Y + 70 - h, w, h);
  };

  P.liquidBodyPath = function (ctx, y, now, wave) {
    var hw = G.hw(y) - 2, ry = hw * 0.15;
    ctx.beginPath();
    ctx.moveTo(G.CX - hw, y);
    for (var a = Math.PI; a <= Math.PI * 2 + 0.001; a += Math.PI / 24) {
      ctx.lineTo(G.CX + hw * Math.cos(a), y + ry * Math.sin(a) + wave * Math.sin(a * 3 + now * 0.009));
    }
    ctx.lineTo(G.right(G.FLOOR_Y), G.FLOOR_Y);
    ctx.ellipse(G.CX, G.FLOOR_Y, G.hw(G.FLOOR_Y), G.FLOOR_RY, 0, 0, Math.PI, false);
    ctx.closePath();
  };

  P.drawLiquid = function (ctx, now, dt) {
    var y = liqLevelY(this.liqShown);
    var wave = this.waveAmp + 1.5;
    ctx.save();
    this.liquidBodyPath(ctx, y, now, wave);
    ctx.clip();
    // tint the submerged ice (multiply keeps the ice texture visible through the drink)
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgb(245,228,122)";
    ctx.fillRect(G.L, y - 80, G.SW, G.B - y + 80);
    ctx.globalCompositeOperation = "source-over";
    var g = ctx.createLinearGradient(0, y, 0, G.FLOOR_Y);
    g.addColorStop(0, "rgba(255,244,160,0.42)");
    g.addColorStop(1, "rgba(232,208,84,0.56)");
    ctx.fillStyle = g;
    ctx.fillRect(G.L, y - 80, G.SW, G.B - y + 80);

    // bubbles
    ctx.lineWidth = 1.6;
    for (var i = 0; i < this.bubbles.length; i++) {
      var bb = this.bubbles[i];
      bb.y -= bb.v * dt;
      if (bb.y < y + 14) { var nb = this.newBubble(false); bb.fx = nb.fx; bb.y = nb.y; bb.r = nb.r; }
      var yy = bb.y;
      var xx = G.left(yy) + 14 + bb.fx * (G.hw(yy) * 2 - 28) + Math.sin(now * 0.004 + bb.wob) * 4;
      ctx.beginPath(); ctx.arc(xx, yy, bb.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,240,0.22)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.stroke();
    }
    ctx.restore();

    // surface
    var hw = G.hw(y) - 2, ry = hw * 0.15;
    ctx.beginPath();
    for (var a = 0; a <= Math.PI * 2 + 0.001; a += Math.PI / 24) {
      var px = G.CX + hw * Math.cos(a), py = y + ry * Math.sin(a) + wave * Math.sin(a * 3 + now * 0.009);
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,250,200,0.30)"; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.stroke();
  };

  P.drawLimes = function (ctx, now) {
    var lime = this.img.lime;
    for (var i = 0; i < this.limes.length; i++) {
      var L = this.limes[i], s = L.slot;
      var t = clamp((now - L.t0) / 520, 0, 1);
      var e = easeOutBack(t);
      var x = s.x, y = L.fromY + (s.y - L.fromY) * e;
      var r = s.r * (0.62 + 0.38 * Math.min(1, e));
      var rot = s.rot + (1 - t) * 3;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot);
      ctx.globalAlpha = 0.96;
      ctx.drawImage(lime, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
  };

  P.drawWaitingLime = function (ctx, now) {
    var p = this.target;
    if (p.stage !== 2 || this.celebrating) return;
    var slot = LIME_SLOTS[p.limes % LIME_SLOTS.length];
    var nudge = now - this.limeNudge < 140 ? (1 - (now - this.limeNudge) / 140) : 0;
    var y = -200 + p.limePartial * 120 + Math.sin(now * 0.006) * 6 + nudge * 10;
    var r = slot.r * (0.55 + 0.1 * p.limePartial) * (1 + nudge * 0.06);
    ctx.save();
    ctx.translate(slot.x, y); ctx.rotate(now * 0.0015 + p.limePartial * 2);
    ctx.shadowColor = "rgba(90,40,10,0.35)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 10;
    ctx.drawImage(this.img.lime, -r, -r, r * 2, r * 2);
    ctx.restore();
  };

  P.drawGarnish = function (ctx, now) {
    if (!this.garnish) return;
    var t = clamp((now - this.garnish.t0) / 560, 0, 1);
    var e = easeOutBack(t);
    var y = -380 + (GARNISH.y + 380) * e;
    ctx.save();
    ctx.translate(GARNISH.x, y); ctx.rotate(GARNISH.rot + (1 - t) * 2.5);
    ctx.drawImage(this.img.lime, -GARNISH.r, -GARNISH.r, GARNISH.r * 2, GARNISH.r * 2);
    ctx.restore();
  };

  P.drawPour = function (ctx, now) {
    var t = now - this.lastPour;
    if (t > 260 || this.celebrating) return;
    var a = 1 - t / 260;
    var y1 = liqLevelY(this.liqShown);
    var x0 = G.CX + 90, x1 = G.CX + 40;
    var w = 30 * a + 6;
    var g = ctx.createLinearGradient(x0 - w, 0, x0 + w, 0);
    g.addColorStop(0, "rgba(246,226,120,0)");
    g.addColorStop(0.35, "rgba(250,236,150," + (0.75 * a) + ")");
    g.addColorStop(0.5, "rgba(255,255,235," + (0.9 * a) + ")");
    g.addColorStop(0.65, "rgba(250,236,150," + (0.75 * a) + ")");
    g.addColorStop(1, "rgba(246,226,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - w, G.T); ctx.lineTo(x0 + w, G.T);
    ctx.lineTo(x1 + w * 0.6, y1); ctx.lineTo(x1 - w * 0.6, y1);
    ctx.closePath(); ctx.fill();
  };

  P.drawFalling = function (ctx, now) {
    var keep = [];
    for (var i = 0; i < this.falling.length; i++) {
      var c = this.falling[i];
      var t = (now - c.t0) / c.dur;
      if (t < 0) { keep.push(c); continue; }
      if (t >= 1) {
        if (c.bake) {
          var rec = { sprite: c.sprite, x: c.x, y: c.y, scale: c.scale, rot: c.rot + c.vr * c.dur / 1000 };
          this.settled.push(rec); this.bakeChunk(rec);
          if (this.settled.length > 260) this.settled.shift();
        } else if (t < 1.6) {
          this.drawSprite(ctx, c.sprite, c.x, c.y, c.scale, c.rot + c.vr * c.dur / 1000, 1 - (t - 1) / 0.6);
          keep.push(c);
        }
        continue;
      }
      var tt = t * t;
      var x = c.x0 + (c.x - c.x0) * t, y = c.y0 + (c.y - c.y0) * tt;
      this.drawSprite(ctx, c.sprite, x, y, c.scale, c.rot + c.vr * t * c.dur / 1000, 1);
      keep.push(c);
    }
    this.falling = keep;
  };

  P.drawParticles = function (ctx, dt) {
    var keep = [];
    for (var i = 0; i < this.particles.length; i++) {
      var q = this.particles[i];
      q.life += dt;
      if (q.life > q.max) continue;
      q.vy += 2600 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      var a = 1 - q.life / q.max;
      if (q.kind === "shard") this.drawSprite(ctx, q.sprite, q.x, q.y, q.size, q.rot, a);
      else {
        ctx.save(); ctx.globalAlpha = a; ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        if (q.kind === "drop") { ctx.fillStyle = "#F7E58A"; ctx.beginPath(); ctx.arc(0, 0, q.size, 0, 6.3); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.arc(-q.size * 0.3, -q.size * 0.3, q.size * 0.3, 0, 6.3); ctx.fill(); }
        else if (q.kind === "leaf") { ctx.fillStyle = "#8CC63F"; ctx.beginPath(); ctx.ellipse(0, 0, q.size * 1.4, q.size * 0.7, 0, 0, 6.3); ctx.fill(); }
        else { star(ctx, q.size * 2.2, "#FFFFFF"); }
        ctx.restore();
      }
      keep.push(q);
    }
    this.particles = keep;
  };

  function star(ctx, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (var i = 0; i < 8; i++) { var rr = i % 2 ? r * 0.35 : r, a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  MCC.CupGeometry = G;
})();

/* ==========================================================================
   FX — full-screen confetti for the win moment (idle = zero cost).
   ========================================================================== */
window.MCC = window.MCC || {};

MCC.Confetti = function (canvas) {
  this.c = canvas; this.ctx = canvas.getContext("2d"); this.p = []; this.active = false;
  var self = this;
  function fit() {
    var d = Math.min(window.devicePixelRatio || 1, 2);
    self.d = d; canvas.width = innerWidth * d; canvas.height = innerHeight * d;
  }
  fit(); window.addEventListener("resize", fit);
};

MCC.Confetti.prototype.burst = function () {
  var W = innerWidth, H = innerHeight;
  var cols = ["#E94E1E", "#F8AD35", "#FFFFFF", "#8FD3F4", "#8CC63F", "#FFE27A"];
  for (var i = 0; i < 170; i++) {
    var fromLeft = i % 2 === 0;
    this.p.push({
      x: fromLeft ? -20 : W + 20, y: H * (0.55 + Math.random() * 0.4),
      vx: (fromLeft ? 1 : -1) * (500 + Math.random() * 900), vy: -(900 + Math.random() * 900),
      w: 10 + Math.random() * 12, h: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 16,
      col: cols[i % cols.length], life: 0, max: 2.6 + Math.random() * 1.4, round: Math.random() < 0.3
    });
  }
  this.active = true;
};

MCC.Confetti.prototype.render = function (dt) {
  if (!this.active) return;
  var ctx = this.ctx, d = this.d;
  dt = Math.min(dt, 50) / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, this.c.width, this.c.height);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  var keep = [];
  for (var i = 0; i < this.p.length; i++) {
    var q = this.p[i];
    q.life += dt; if (q.life > q.max) continue;
    q.vx *= Math.pow(0.35, dt); q.vy += 1500 * dt; q.vy *= Math.pow(0.6, dt);
    q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.vr * dt;
    ctx.save(); ctx.globalAlpha = Math.min(1, (q.max - q.life) * 2);
    ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.scale(1, Math.cos(q.life * 9));
    ctx.fillStyle = q.col;
    if (q.round) { ctx.beginPath(); ctx.arc(0, 0, q.h * 0.8, 0, 6.3); ctx.fill(); }
    else ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
    ctx.restore();
    keep.push(q);
  }
  this.p = keep;
  if (!keep.length) { this.active = false; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.c.width, this.c.height); }
};

MCC.Confetti.prototype.clear = function () {
  this.p = []; this.active = false;
  this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.c.width, this.c.height);
};

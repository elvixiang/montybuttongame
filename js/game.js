/* ==========================================================================
   GAME LOGIC — countdown, 30-second timer, taps, win / time's up.
   Knows nothing about drawing; it reports events through `hooks`.
   ========================================================================== */
window.MCC = window.MCC || {};

MCC.GameEngine = function (hooks) {
  this.hooks = hooks || {};
  this.reset();
};

MCC.GameEngine.prototype.reset = function () {
  this.state = "idle";            // idle | countdown | playing | won | timeup
  this.taps = 0;
  this.countdownStart = 0;
  this.countdownStep = -1;
  this.startTime = 0;
  this.endTime = 0;
  this.elapsedMs = 0;
  this.progress = MCC.computeProgress(0, MCC.config);
};

MCC.GameEngine.prototype.startCountdown = function (now) {
  this.reset();
  this.cfg = MCC.config;          // freeze config for this round
  this.progress = MCC.computeProgress(0, this.cfg);
  this.state = "countdown";
  this.countdownStart = now;
  this.countdownStep = -1;
  this.update(now);
};

MCC.GameEngine.prototype.update = function (now) {
  if (this.state === "countdown") {
    var step = Math.floor((now - this.countdownStart) / this.cfg.COUNTDOWN_STEP_MS);
    if (step !== this.countdownStep) {
      this.countdownStep = step;
      if (step <= 2) this.emit("onCountdown", 3 - step);
      else {
        // GO! — the round starts exactly now
        this.state = "playing";
        this.startTime = this.countdownStart + 3 * this.cfg.COUNTDOWN_STEP_MS;
        this.emit("onCountdown", 0);
        this.emit("onStart");
      }
    }
  } else if (this.state === "playing") {
    this.elapsedMs = now - this.startTime;
    if (this.elapsedMs >= this.cfg.GAME_DURATION * 1000) {
      this.elapsedMs = this.cfg.GAME_DURATION * 1000;
      this.state = "timeup";
      this.endTime = now;
      this.emit("onTimeUp", this.result());
    }
  }
};

/* One physical press. Returns true if it counted. */
MCC.GameEngine.prototype.press = function (now) {
  if (this.state !== "playing") return false;
  var elapsed = now - this.startTime;
  if (elapsed >= this.cfg.GAME_DURATION * 1000) { this.update(now); return false; }

  var prev = this.progress;
  this.taps += 1;
  this.progress = MCC.computeProgress(this.taps, this.cfg);
  this.elapsedMs = elapsed;
  this.emit("onTap", this.progress, prev);
  if (this.progress.stage !== prev.stage) this.emit("onStage", this.progress.stage);
  if (this.progress.limes > prev.limes) this.emit("onLime", this.progress.limes);

  if (this.progress.complete) {
    this.state = "won";
    this.endTime = now;
    this.emit("onWin", this.result());
  }
  return true;
};

MCC.GameEngine.prototype.timeLeftMs = function () {
  if (!this.cfg) return MCC.config.GAME_DURATION * 1000;
  if (this.state === "countdown" || this.state === "idle") return this.cfg.GAME_DURATION * 1000;
  return Math.max(0, this.cfg.GAME_DURATION * 1000 - this.elapsedMs);
};

MCC.GameEngine.prototype.result = function () {
  return {
    completed: this.state === "won",
    timeMs: Math.round(this.elapsedMs),
    taps: this.taps,
    progress: this.progress,
    configTag: "I" + this.cfg.ICE_TAPS_REQUIRED + "-L" + this.cfg.LIME_INTERVAL + "x" +
      this.cfg.MAX_LIME_SLICES + "-Q" + this.cfg.LIQUID_TAPS_REQUIRED + "-" + this.cfg.GAME_DURATION + "s"
  };
};

MCC.GameEngine.prototype.emit = function (name) {
  var fn = this.hooks[name];
  if (fn) fn.apply(null, Array.prototype.slice.call(arguments, 1));
};

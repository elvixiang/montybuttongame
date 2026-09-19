/* ==========================================================================
   MONTY CUP CHALLENGE — CONFIGURATION
   --------------------------------------------------------------------------
   Change the defaults here, OR change them live on the tablet in Admin mode
   (Admin changes are saved on that tablet only and override these values).
   ========================================================================== */
window.MCC = window.MCC || {};

MCC.DEFAULT_CONFIG = {
  // ---- Game difficulty -----------------------------------------------------
  GAME_DURATION: 30,          // seconds
  ICE_TAPS_REQUIRED: 100,     // taps to fill the cup with crushed ice (stage 1)
  LIME_INTERVAL: 10,          // taps per lime slice after the ice is full (stage 2)
  MAX_LIME_SLICES: 3,         // lime slices before the liquid starts (0–4)
  LIQUID_TAPS_REQUIRED: 100,  // taps to fill the cup with Lemon Crush (stage 3)

  // ---- Physical button -----------------------------------------------------
  // The key your Bluetooth button sends. Matches KeyboardEvent.key OR .code.
  // Examples: " " or "Space" (spacebar), "Enter", "ArrowRight", "PageDown", "KeyB"
  BUTTON_KEY: " ",
  MIN_TAP_INTERVAL_MS: 30,    // ignores switch "bounce" double-fires faster than this
  // How players tap:
  //   "auto"   → laptop: keyboard/button only. Phone/tablet: tap the screen,
  //              until a Bluetooth button is pressed once — then button only.
  //   "button" → keyboard/Bluetooth button only
  //   "touch"  → screen taps only
  //   "both"   → button AND screen taps
  INPUT_MODE: "auto",

  // ---- Flow ----------------------------------------------------------------
  COUNTDOWN_STEP_MS: 850,     // speed of 3 / 2 / 1 / GO!
  RESULT_INPUT_GUARD_MS: 1600,// ignore the button right after a round ends (stops accidental skips)
  NAME_MAX_LENGTH: 12,
  DEFAULT_NAME: "MONTY FAN",
  NAME_TIMEOUT_MS: 45000,     // name screen auto-submits as DEFAULT_NAME after this
  IDLE_RETURN_MS: 30000,      // result / leaderboard screens return to attract after this

  // ---- Leaderboard ---------------------------------------------------------
  LEADERBOARD_SIZE: 10,
  EVENT_ID: "BAZAAR-2026",    // separates leaderboards per event/day. Change to start fresh.
  SHEETS_URL: "",             // Google Apps Script Web App URL ("/exec"). Empty = this tablet only.

  // ---- Admin ---------------------------------------------------------------
  ADMIN_PIN: "2525",

  // ---- Sound ---------------------------------------------------------------
  SOUND_ON: true
};

(function () {
  var KEY = "mcc.config.v1";

  function readOverrides() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }

  MCC.loadConfig = function () {
    var o = readOverrides();
    var c = {};
    Object.keys(MCC.DEFAULT_CONFIG).forEach(function (k) {
      c[k] = Object.prototype.hasOwnProperty.call(o, k) ? o[k] : MCC.DEFAULT_CONFIG[k];
    });
    // sanity clamps
    c.GAME_DURATION = Math.max(5, Number(c.GAME_DURATION) || 30);
    c.ICE_TAPS_REQUIRED = Math.max(1, Math.round(Number(c.ICE_TAPS_REQUIRED) || 100));
    c.LIME_INTERVAL = Math.max(1, Math.round(Number(c.LIME_INTERVAL) || 10));
    c.MAX_LIME_SLICES = Math.min(4, Math.max(0, Math.round(Number(c.MAX_LIME_SLICES))));
    if (isNaN(c.MAX_LIME_SLICES)) c.MAX_LIME_SLICES = 3;
    c.LIQUID_TAPS_REQUIRED = Math.max(1, Math.round(Number(c.LIQUID_TAPS_REQUIRED) || 100));
    if (["auto", "button", "touch", "both"].indexOf(c.INPUT_MODE) < 0) c.INPUT_MODE = "auto";
    MCC.config = c;
    return c;
  };

  MCC.saveConfigOverrides = function (patch) {
    var o = readOverrides();
    Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
    return MCC.loadConfig();
  };

  MCC.resetConfigOverrides = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    return MCC.loadConfig();
  };

  // Asset paths (the single-file build replaces these with embedded data)
  MCC.ASSETS = {
    cup: "assets/cup.webp",
    lime: "assets/lime.webp",
    monty: "assets/monty.webp",
    pile: "assets/pile.webp",
    iceTex: "assets/ice_tex.webp",
    iceAtlas: "assets/ice_atlas.webp",
    lemonCrush: "assets/lemoncrush.webp",
    logo: "assets/logo.webp"
  };

  // Sprite rectangles inside assets/ice_atlas.webp  [x, y, w, h]
  MCC.ICE_ATLAS = [[0,0,151,129],[155,0,118,117],[277,0,128,114],[409,0,101,109],[514,0,92,102],[610,0,128,98],[742,0,117,93],[863,0,73,84],[0,133,81,81],[85,133,83,80],[172,133,63,80],[239,133,82,74],[325,133,77,67],[406,133,59,65],[469,133,47,64],[520,133,83,62],[607,133,58,61],[669,133,51,61],[724,133,66,56],[794,133,62,56],[860,133,52,55],[916,133,53,54],[0,218,49,51],[53,218,42,51],[99,218,45,47],[148,218,42,46],[194,218,60,45],[258,218,35,43],[297,218,44,42],[345,218,37,41],[386,218,49,38],[439,218,43,34],[486,218,46,31]];

  MCC.loadConfig();
})();

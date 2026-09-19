/* ==========================================================================
   INPUT — Bluetooth HID button / keyboard.
   One physical press = one tap:
     • ignores OS key-repeat (event.repeat)
     • ignores repeated keydowns while the key is still held (no keyup yet)
     • ignores switch bounce faster than MIN_TAP_INTERVAL_MS
   ========================================================================== */
window.MCC = window.MCC || {};

MCC.Input = (function () {
  var handler = null;
  var learnCb = null;
  var held = {};          // key id -> time it went down
  var lastAccepted = 0;
  var HELD_FAILSAFE_MS = 1500; // some buttons lose a keyup; after this a new press is accepted

  function keyId(e) { return e.code || e.key; }

  function matches(e) {
    var k = MCC.config.BUTTON_KEY;
    if (k === " " || k === "Space" || k === "Spacebar") {
      return e.key === " " || e.code === "Space" || e.key === "Spacebar";
    }
    return e.key === k || e.code === k;
  }

  function isTyping(e) {
    var t = e.target;
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || t.isContentEditable;
  }

  function onKeyDown(e) {
    if (learnCb) {
      e.preventDefault();
      var cb = learnCb; learnCb = null;
      cb({ key: e.key, code: e.code });
      return;
    }
    if (!matches(e)) return;
    // Let people type spaces in the name box
    if (isTyping(e) && (e.key === " " || e.key.length === 1)) return;

    e.preventDefault(); // stop page scroll / button activation
    if (e.repeat) return;

    var now = performance.now();
    var id = keyId(e);
    if (held[id] && now - held[id] < HELD_FAILSAFE_MS) return;
    held[id] = now;

    if (now - lastAccepted < MCC.config.MIN_TAP_INTERVAL_MS) return;
    lastAccepted = now;
    if (handler) handler({ source: "button", time: now, typing: isTyping(e) });
  }

  function onKeyUp(e) {
    delete held[keyId(e)];
    if (matches(e) && !isTyping(e)) e.preventDefault();
  }

  function clearHeld() { held = {}; }

  return {
    init: function (onPress) {
      handler = onPress;
      window.addEventListener("keydown", onKeyDown, { capture: true });
      window.addEventListener("keyup", onKeyUp, { capture: true });
      window.addEventListener("blur", clearHeld);
      document.addEventListener("visibilitychange", clearHeld);
    },
    /* Admin "learn key": the next key pressed is reported instead of played */
    learnNextKey: function (cb) { learnCb = cb; },
    cancelLearn: function () { learnCb = null; },
    describeKey: function (k) {
      if (k === " " || k === "Space") return "SPACE";
      return String(k);
    }
  };
})();

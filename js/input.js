/* ==========================================================================
   INPUT — Bluetooth HID button / keyboard / screen taps.
   One physical press = one tap:
     • ignores OS key-repeat (event.repeat)
     • ignores repeated keydowns while the key is still held (no keyup yet)
     • ignores switch bounce / double touches faster than MIN_TAP_INTERVAL_MS
   BUTTON_KEY "ANY": every key counts. A combo like Ctrl+V (what many cheap
   Bluetooth buttons send for copy / paste / cut) is still ONE tap: only the
   first key of a press counts while the others are held with it.
   INPUT_MODE "auto": a touch device uses screen taps until a Bluetooth button
   is pressed once; from then on that device uses the button only (remembered).
   ========================================================================== */
window.MCC = window.MCC || {};

MCC.Input = (function () {
  var handler = null;
  var learnCb = null;
  var modeCb = null;
  var held = {};          // key id -> time it went down
  var lastAccepted = 0;
  var HELD_FAILSAFE_MS = 1500; // some buttons lose a keyup; after this a new press is accepted
  var SEEN_KEY = "mcc.buttonSeen";

  var lastKeyTime = 0;

  function keyId(e) { return e.code || e.key || "?"; }
  function anyKey() { return String(MCC.config.BUTTON_KEY).toUpperCase() === "ANY"; }
  function adminOpen() { return MCC.Admin && MCC.Admin.isOpen && MCC.Admin.isOpen(); }

  function matches(e) {
    var k = MCC.config.BUTTON_KEY;
    if (anyKey()) return true;
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

  function isTouchDevice() {
    return (navigator.maxTouchPoints || 0) > 0 ||
      (window.matchMedia && window.matchMedia("(any-pointer: coarse)").matches);
  }
  function buttonSeen() { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch (e) { return false; } }
  function markButtonSeen() {
    if (!isTouchDevice() || buttonSeen()) return;
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
    if (modeCb) modeCb();
  }

  function touchAllowed() {
    var m = MCC.config.INPUT_MODE;
    if (m === "touch" || m === "both") return true;
    if (m === "button") return false;
    return isTouchDevice() && !buttonSeen();
  }
  function buttonAllowed() { return MCC.config.INPUT_MODE !== "touch"; }

  function accept(now, source) {
    if (now - lastAccepted < MCC.config.MIN_TAP_INTERVAL_MS) return false;
    lastAccepted = now;
    if (handler) handler({ source: source, time: now });
    return true;
  }

  function onKeyDown(e) {
    if (learnCb) {
      e.preventDefault();
      var cb = learnCb; learnCb = null;
      markButtonSeen();
      cb({ key: e.key, code: e.code });
      return;
    }
    if (adminOpen()) return;
    if (!matches(e)) return;
    if (anyKey()) { if (isTyping(e)) return; }            // typing a name: keys type normally
    else if (isTyping(e) && (e.key === " " || e.key.length === 1)) return; // let people type spaces

    e.preventDefault(); // stop page scroll / copy / paste / button activation
    if (!buttonAllowed()) return;
    var now = performance.now();
    lastKeyTime = now;
    if (e.repeat) return;

    var id = keyId(e);
    Object.keys(held).forEach(function (k) { if (now - held[k] > HELD_FAILSAFE_MS) delete held[k]; });
    if (held[id]) return;
    var chord = Object.keys(held).length > 0;  // another key of the same press is still down
    held[id] = now;
    if (chord && anyKey()) return;

    markButtonSeen();
    accept(now, "button");
  }

  function onKeyUp(e) {
    delete held[keyId(e)];
    if (matches(e) && !isTyping(e)) e.preventDefault();
  }

  function clearHeld() { held = {}; }

  // Some buttons send a real Copy / Cut / Paste command with no key event.
  function onClipboard(e) {
    if (!anyKey() || adminOpen() || isTyping(e)) return;
    e.preventDefault();
    var now = performance.now();
    if (now - lastKeyTime < 250) return;   // already counted by its key event
    if (!buttonAllowed()) return;
    markButtonSeen();
    accept(now, "button");
  }

  return {
    init: function (onPress, onModeChange) {
      handler = onPress;
      modeCb = onModeChange || null;
      window.addEventListener("keydown", onKeyDown, { capture: true });
      window.addEventListener("keyup", onKeyUp, { capture: true });
      window.addEventListener("blur", clearHeld);
      document.addEventListener("visibilitychange", clearHeld);
      ["copy", "cut", "paste"].forEach(function (t) { document.addEventListener(t, onClipboard, true); });
    },
    /* a screen tap; returns true if it counted */
    touch: function (now) { return touchAllowed() ? accept(now || performance.now(), "touch") : false; },
    touchAllowed: touchAllowed,
    isTouchDevice: isTouchDevice,
    buttonSeen: buttonSeen,
    resetButtonSeen: function () { try { localStorage.removeItem(SEEN_KEY); } catch (e) {} if (modeCb) modeCb(); },
    /* Admin "learn key": the next key pressed is reported instead of played */
    learnNextKey: function (cb) { learnCb = cb; },
    cancelLearn: function () { learnCb = null; },
    describeKey: function (k) {
      if (k === " " || k === "Space") return "SPACE";
      if (String(k).toUpperCase() === "ANY") return "ANY KEY";
      return String(k);
    }
  };
})();

/* ==========================================================================
   CUP PROGRESSION LOGIC  (pure function — no drawing, no DOM)
   taps -> what the cup should contain.
   ========================================================================== */
window.MCC = window.MCC || {};

MCC.computeProgress = function (taps, c) {
  var iceReq = c.ICE_TAPS_REQUIRED;
  var interval = c.LIME_INTERVAL;
  var maxLime = c.MAX_LIME_SLICES;
  var liqReq = c.LIQUID_TAPS_REQUIRED;
  var limeTaps = interval * maxLime;
  var tapsToWin = iceReq + limeTaps + liqReq;

  var ice = Math.min(taps / iceReq, 1);
  var afterIce = Math.max(0, taps - iceReq);

  var limes = maxLime > 0 ? Math.min(Math.floor(afterIce / interval), maxLime) : 0;
  // progress toward the NEXT lime slice (0..1), used to lower the waiting slice
  var limePartial = (ice >= 1 && limes < maxLime) ? (afterIce % interval) / interval : 0;

  var afterLime = Math.max(0, afterIce - limeTaps);
  var liquid = (ice >= 1 && limes >= maxLime) ? Math.min(afterLime / liqReq, 1) : 0;

  var stage;
  if (ice < 1) stage = 1;
  else if (limes < maxLime) stage = 2;
  else stage = 3;

  return {
    taps: taps,
    stage: stage,
    ice: ice,
    limes: limes,
    maxLimes: maxLime,
    limePartial: limePartial,
    liquid: liquid,
    complete: liquid >= 1,
    tapsToWin: tapsToWin,
    overall: Math.min(taps / tapsToWin, 1),
    // per-stage completion for the HUD tracker
    stageFill: [
      ice,
      maxLime > 0 ? Math.min(afterIce / limeTaps, 1) : (ice >= 1 ? 1 : 0),
      liquid
    ]
  };
};

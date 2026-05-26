# Implementation Patches

Date: 2026-05-26

## Files Changed

- `src/utils/gestureDetector.ts`
- `src/utils/gestureStateMachine.ts`
- `src/utils/oneEuroFilter.ts`
- `src/utils/kalmanFilter.ts`
- `src/workers/handTracking.worker.ts`
- `src/hooks/useHandTracking.ts`
- `src/hooks/useObjectInteraction.ts`
- `src/utils/sabSchema.ts`
- `src/components/gestures/GestureHint.tsx`

## Gesture Detector Replacement

File: `src/utils/gestureDetector.ts`

Replaced:

- 2D extension ratio checks.
- Fixed-size thumb threshold.
- First-match `if` chain.
- Boolean-only open/fist/pinch/finger rules.

With:

- Palm-scale normalized distances.
- PIP/DIP angle scoring.
- Per-finger `extended` and `folded` confidence values.
- Thumb extension/fold scoring.
- Candidate scoring for `fist`, `pinch`, `thumbs-up`, `open-palm`, `one-finger`, `two-fingers`, and `three-fingers`.
- Gesture priority and dominance-gap rejection.

Important replacement behavior:

```ts
const candidates = buildCandidates(hand.landmarks)
  .filter((candidate) => candidate.score >= 0.35)
  .sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (Math.abs(scoreDelta) > 0.035) return scoreDelta;
    return b.priority - a.priority;
  });

if (runnerUp && runnerUp.score > 0.52 && dominanceGap < 0.075) {
  return { gesture: null, confidence: best.score * 0.72, primaryHand: hand };
}
```

This prevents a weakly separated pinch/open-palm/fist boundary from activating any gesture.

## Gesture State Machine Replacement

File: `src/utils/gestureStateMachine.ts`

Replaced:

- Single `MIN_CONFIDENCE`.
- Single `STABLE_FRAMES = 2`.
- Single `COOLDOWN_MS = 150`.
- Immediate active-state exit on any raw label change.

With:

- Per-gesture enter and exit thresholds.
- Hysteresis.
- 2-frame exit tolerance.
- Gesture-specific stable frame counts and cooldowns.
- `isActive()` helper for the worker combiner.

Key behavior:

```ts
if (rawGesture === this.candidate && confidence >= config.exit) {
  this.exitFrames = 0;
  return null;
}

this.exitFrames++;
if (this.exitFrames >= 2) {
  this.state = "cooldown";
  this.cooldownElapsed = 0;
}
```

## Smoothing Patches

File: `src/utils/oneEuroFilter.ts`

Changed filter construction:

```ts
x: new OneEuroFilter(30, 1.15, 0.18, 1.2),
y: new OneEuroFilter(30, 1.15, 0.18, 1.2),
z: new OneEuroFilter(30, 0.8, 0.08, 1.0),
```

Reason:

- Lower min cutoff gives stronger smoothing while still.
- Higher beta opens the filter during fast movement, reducing perceived lag.
- z receives heavier smoothing because MediaPipe z is noisy.

File: `src/utils/kalmanFilter.ts`

Changed:

```ts
Q = 0.018
R = 0.008
lookahead = 0.022
```

Reason:

- The old 40 ms lookahead was too aggressive and could overshoot.
- Slightly higher measurement noise reduces landmark chasing.

## Worker Pipeline Patch

File: `src/workers/handTracking.worker.ts`

Changed:

- Removed gesture detection from the 60 Hz prediction loop.
- Added cached `lastGestureDetections`.
- Updated gesture machines only after MediaPipe measurement and smoothing.
- Prediction loop now only publishes predicted landmarks and locked gesture state.
- Added `{ type: "frame-processed" }` worker message.

Critical change:

```ts
const detection = detectSingleHand(trackedHand);
const dtMs = lastGestureUpdate[slot] > 0
  ? Math.max(1, timestamp - lastGestureUpdate[slot])
  : 33;
lastGestureUpdate[slot] = timestamp;
lastGestureDetections[slot] = detection;
gestureMachines[slot].update(detection.gesture, detection.confidence, dtMs);
```

Reason:

- Rendering can use prediction.
- Gesture classification should not use prediction.

## Capture Backpressure Patch

File: `src/hooks/useHandTracking.ts`

Changed:

- Removed `frameInFlightRef.current = false` from SAB reader loop.
- Added frame release on worker `frame-processed`.
- Wrapped `worker.postMessage()` in try/catch and closes failed bitmaps.

Critical behavior:

```ts
if (message.type === "frame-processed") {
  frameInFlightRef.current = false;
}
```

Reason:

- The display reader publishes predicted frames at 60 Hz.
- MediaPipe processing completes at a different cadence.
- Using predicted frame reads as capture backpressure was causing avoidable bitmap churn.

## Object Follow Patch

File: `src/hooks/useObjectInteraction.ts`

Changed:

- Fixed `lerp(..., 0.15)` to adaptive smoothing.
- Velocity tracker now samples the hand target.

Replacement logic:

```ts
function followFactor(current: VectorTuple, target: VectorTuple) {
  const gap = distance(current, target);
  if (gap > 1.2) return 0.72;
  if (gap > 0.45) return 0.55;
  return 0.36;
}
```

Reason:

- Large movement should catch up fast.
- Small movement should remain smooth.
- Throw velocity should represent hand motion, not lagged object motion.

## Type Correctness Patches

Files:

- `src/utils/sabSchema.ts`
- `src/components/gestures/GestureHint.tsx`
- `src/workers/handTracking.worker.ts`

Changes:

- Treated `"none"` as ID `0` in shared buffer schema.
- Made gesture labels partial because `"none"` has no UI label.
- Annotated worker active gesture as `GestureType | null`.

## Verification

Command:

```bash
npm run typecheck
```

Result:

- Passes.

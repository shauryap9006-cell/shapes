# Gesture System Redesign

Date: 2026-05-26

## Goals

The redesigned system separates three jobs that were previously mixed:

1. Measurement smoothing for reliable landmark input.
2. Prediction for low-latency rendering.
3. Gesture recognition from measured pose state.

Prediction improves visuals, but it should not decide gestures.

## New Runtime Pipeline

```text
Camera frame
  -> createImageBitmap
  -> worker OffscreenCanvas
  -> MediaPipe HandLandmarker
  -> One Euro measured landmark filter
  -> deadzone stabilizer
  -> Kalman measurement update
  -> gesture classifier on measured landmarks
  -> gesture state machine update
  -> 60 Hz prediction loop publishes render landmarks + locked gesture
  -> main thread reads SharedArrayBuffer
  -> overlay / R3F / interaction consume latest state
```

## Gesture Recognition Architecture

### Stage 1: Feature Extraction

For each hand:

- Compute palm scale from wrist/middle-MCP and index-MCP/pinky-MCP distances.
- For each non-thumb finger:
  - PIP angle.
  - DIP angle.
  - fingertip reach from wrist.
  - fingertip distance to MCP.
- For thumb:
  - reach from wrist.
  - thumb IP angle.
  - distance to index/middle PIP area.
- For pinch:
  - normalized thumb-index tip distance.

### Stage 2: Candidate Scoring

Every gesture receives a score in `[0, 1]`.

- `fist`: all four non-thumb fingers folded and thumb folded/over fingers.
- `pinch`: thumb-index closure, index not fully extended, not open-palm, not full fist.
- `open-palm`: all four non-thumb fingers extended and pinch suppressed.
- `one-finger`: index extended and other fingers folded.
- `two-fingers`: index/middle extended and ring/pinky folded.
- `three-fingers`: index/middle/ring extended and pinky folded.
- `thumbs-up`: four fingers folded and thumb extended.

### Stage 3: Exclusive Selection

Rules:

- Low scores are ignored.
- Highest score wins.
- If runner-up is close, return no gesture for that frame.
- If scores are close, priority resolves only minor ties.

Priority order:

1. Fist
2. Pinch
3. Thumbs up
4. Open palm
5. Three fingers
6. Two fingers
7. One finger

## State Machine

Each hand owns a gesture state machine.

```text
idle
  -> entering when raw gesture confidence >= enter threshold
entering
  -> active after stable frame requirement
  -> idle/candidate swap if evidence changes
active
  -> stays locked while confidence >= lower exit threshold
  -> cooldown after 2 validated exit frames
cooldown
  -> idle after gesture-specific cooldown
```

This creates:

- Temporal validation.
- Hysteresis.
- Gesture locking.
- Controlled release.
- Reduced overlap during transitions.

## Multi-Hand Combination

Per-hand machines produce active locked gestures. The global combiner:

- Emits `both-fists` only when both hand machines are actively locked to `fist`.
- Otherwise emits the active hand gesture with the highest cached confidence.
- Emits `null` when no hand has a locked active gesture.

This guarantees only one dominant global gesture unless a deliberate two-hand gesture is recognized.

## Smoothing Architecture

### Current Implemented Stack

1. One Euro filter:
   - Strong smoothing while still.
   - Faster response during motion.
2. Deadzone:
   - Removes micro-jitter.
3. Kalman:
   - Predicts short lookahead for visual output only.

### Recommended Next Version

```text
Raw landmarks
  -> estimate palm frame
  -> smooth palm transform
  -> smooth finger curls in palm-local space
  -> reconstruct stable landmarks
  -> Kalman short prediction for render only
```

Reason:

- Palm-local smoothing keeps the hand rigid.
- Finger-angle smoothing is more stable for gestures than raw coordinate smoothing.

## Performance Architecture

### Current Implemented Improvements

- Worker owns MediaPipe, smoothing, Kalman, and gesture state.
- Main thread reads a `SharedArrayBuffer`.
- Capture backpressure waits for worker processing completion.
- Rendering consumes predicted landmarks without forcing MediaPipe to run at 60 Hz.

### Recommended Next Version

- Scene object physics should move out of Zustand RAF updates.
- Use R3F refs for per-frame object transforms.
- Use Zustand only for structural events:
  - object added
  - object removed
  - grabbed ID changed
  - gesture changed
- Reuse geometry/material instances by shape type.

## Event And Action Rules

Gesture action rules should stay edge-triggered:

- Spawn only when one/two/three-finger gesture enters active state.
- Grab only when fist/pinch enters active state.
- Release only when open-palm enters active state or grab gesture exits.
- Clear scene only when `both-fists` enters active state.

Continuous movement should not depend on repeated gesture events. It should use:

- locked grabbed object ID
- current smoothed hand position
- render-frame movement update

## Debug Instrumentation To Add

Add a developer overlay with:

- Worker inference ms.
- Publish FPS.
- Camera frame FPS.
- Render FPS.
- Dropped frame count.
- Current hand slot assignment.
- Current gesture state machine state.
- Top two gesture candidates and scores.
- Palm scale and pinch distance.

This is the fastest way to tune thresholds without guessing.

## Production Readiness Checklist

- Gesture classifier uses measured landmarks only.
- Prediction is render-only.
- Enter/exit thresholds are separate.
- Ambiguous frames return no gesture.
- One global gesture is emitted at a time.
- Both-fists requires two active fist locks.
- Capture loop has worker-based backpressure.
- Worker has GPU-to-CPU fallback.
- Worker has auto-restart.
- Missing hand slots persist briefly instead of resetting instantly.
- Object motion is imperative in R3F, not React state every frame.
- Typecheck passes.

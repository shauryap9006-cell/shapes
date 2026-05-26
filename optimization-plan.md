# Optimization Plan

Date: 2026-05-26

## Priority 0: Completed In This Pass

1. Replace boolean first-match gesture rules with scored exclusive classification.
2. Normalize gesture thresholds by palm scale.
3. Add finger angle analysis for extension and fold state.
4. Add dominance-gap rejection to prevent ambiguous overlap.
5. Add per-gesture hysteresis and state locking.
6. Run gesture classification on fresh measured landmarks, not predicted landmarks.
7. Fix frame backpressure so capture waits for worker processing completion.
8. Retune One Euro smoothing for less still-hand jitter and lower moving latency.
9. Reduce Kalman lookahead from 40 ms to 22 ms.
10. Reduce grabbed-object movement lag with adaptive follow smoothing.

## Priority 1: Accuracy

### Gesture Classification

Keep the current rule-based classifier, but add debug telemetry:

- Raw candidate scores per gesture.
- Winning gesture and runner-up score.
- Palm scale.
- Per-finger extended/folded scores.
- Pinch distance normalized by palm scale.

This makes threshold tuning objective instead of visual guessing.

### Gesture Boundaries

Recommended thresholds to tune from live data:

- Pinch enter: thumb-index distance below `0.24 * palmScale`.
- Pinch exit: thumb-index distance above `0.43 * palmScale`.
- Open palm requires all four non-thumb fingers extended and pinch closure suppressed.
- Fist requires all four non-thumb fingers folded plus thumb folded or over-fingers.
- One/two/three-finger gestures require non-participating fingers folded, not merely "not extended".

### Multi-Hand Stability

Replace handedness-only slotting with position continuity:

- Use previous wrist/palm-center position to assign current detections.
- Apply a max matching distance.
- Keep a missing slot alive for 2-3 detection frames before reset.
- Use handedness as a secondary hint, not the primary ID.

## Priority 2: Smoothness

### Landmark Smoothing

Current stack after this pass:

1. One Euro filter on measured landmarks.
2. Small deadzone.
3. Kalman prediction for render output.

Recommended next upgrade:

- Convert landmarks into a palm-local coordinate frame.
- Smooth the palm transform separately from finger articulation.
- Apply a rigid deadzone to the palm instead of independent per-landmark freezing.
- Smooth finger curls/angles instead of raw fingertip positions for gesture logic.

This prevents the skeleton from warping when individual landmarks cross deadzones.

### Prediction

Keep prediction for rendering only. Gesture recognition should stay on filtered measurements.

Recommended guardrails:

- Limit extrapolation to 16-24 ms.
- Disable extrapolation when measured velocity changes direction sharply.
- Clamp predicted landmarks to a max delta from last measured landmarks.

## Priority 3: Latency

### Capture Loop

Current fix prevents premature frame release. Next improvements:

- Use `requestVideoFrameCallback` metadata when available.
- Add adaptive detection frequency: skip inference if worker processing time exceeds frame budget.
- Prefer 640x480 at 30 fps for MediaPipe, while rendering at display refresh.
- Avoid `Date.now()` cache busting for the model in production.

### Interaction Loop

Remaining source of lag:

- Zustand scene updates happen every RAF.

Recommended redesign:

- Store object physics state in refs inside the R3F tree.
- Use Zustand for low-frequency structural changes only: add/remove/grab/release.
- Update mesh transforms imperatively in `useFrame()`.

## Priority 4: Rendering Performance

### Three.js

Recommended:

- Reuse geometries and materials by shape type.
- Avoid creating geometry JSX during frequent React renders.
- Keep `MAX_OBJECTS` at 15 unless switching to instancing.
- Use `frameloop="always"` only while camera/tracking is active.

### Canvas Overlay

Current overlay is acceptable, but can improve:

- Scale line widths by device pixel ratio.
- Skip redraw if SAB frame id has not changed.
- Draw from the shared buffer directly instead of Zustand state if overlay becomes expensive.

## Priority 5: Robustness

Add:

- GPU delegate fallback to CPU.
- Worker auto-restart with exponential backoff.
- Separate watchdogs for incoming frames and successful detections.
- Performance counters: inference ms, publish FPS, camera FPS, render FPS, dropped frames.

## Success Criteria

- Gesture false activation: under 2% during transitions.
- Gesture activation latency: 50-90 ms for held gestures.
- Render loop: stable 60 fps on desktop Chrome.
- Detection loop: stable 25-30 MediaPipe detections per second.
- Grab follow latency: visually under one frame for large movement, stable when still.
- No worker frame queue growth.

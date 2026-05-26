# Gesture System Audit Report

Date: 2026-05-26

## Executive Findings

The instability was not caused by one bad threshold. It came from several layers reinforcing each other:

- `src/utils/gestureDetector.ts` used first-match boolean rules. Once a rule matched, later competing gestures were never scored, so boundary cases became order-dependent.
- `src/workers/handTracking.worker.ts` classified gestures from Kalman-predicted landmarks inside the 60 Hz prediction loop. Prediction is useful for rendering, but it changes finger distances and can flip gesture thresholds.
- `src/utils/gestureStateMachine.ts` accepted gestures after only 2 frames and dropped the active gesture immediately when the raw label changed. That created flicker and gesture conflict during normal movement.
- `src/hooks/useHandTracking.ts` released frame backpressure when the UI reader saw any predicted frame, not when MediaPipe finished processing the camera frame. This could create excess `createImageBitmap()` churn and dropped worker frames.
- `src/hooks/useObjectInteraction.ts` used `lerp(..., 0.15)` for grabbed object movement, which adds visible follow latency. Throw velocity was measured from the smoothed object position, not the actual hand target.

## Gesture Conflict Sources

### `src/utils/gestureDetector.ts`

Problematic logic:

- `FOLDED = 1.10` made folded detection permissive enough that partially curled fingers could satisfy fist-like and pinch-like shapes.
- `extensionRatio()` used only 2D tip/PIP/MCP distances. This is unstable when the hand rotates, moves toward the camera, or folds out of image plane.
- `isThumbExtended()` used a fixed `+ 0.025` threshold. That is not normalized by hand size, so the same thumb pose behaves differently for near/far hands.
- Pinch required all finger tips to meet the thumb tip. That is closer to a "chef kiss" pose than the app's precise-grab pinch, and it overlaps heavily with curled/fist states.
- Open palm, one-finger, two-finger, and three-finger were hard boolean gates with no confidence competition.
- `detectGesture()` only sorted by confidence after each hand had already committed to one first-match result.

Fix implemented:

- Replaced first-match rules with a scored exclusive classifier.
- Normalized distances by palm scale.
- Added PIP/DIP angle analysis for finger extension/fold.
- Added gesture priority and dominance-gap rejection.
- Suppressed pinch/open-palm and pinch/fist overlap explicitly.

## State Machine Problems

### `src/utils/gestureStateMachine.ts`

Problematic logic:

- `STABLE_FRAMES = 2` was too aggressive for noisy landmarks.
- `MIN_CONFIDENCE = 0.60` was low for overlapping rule gestures.
- `COOLDOWN_MS = 150` was shorter than the app plan and too short for deliberate gestures.
- No hysteresis existed. A gesture entered and exited at the same threshold.
- Active state exited after one changed raw frame.

Fix implemented:

- Added per-gesture enter/exit thresholds.
- Added hysteresis: higher confidence required to enter than to stay active.
- Added 2-frame exit tolerance.
- Added gesture-specific stable-frame and cooldown windows.
- Kept a single locked active gesture until release/change is validated.

## Tracking And Jitter Sources

### `src/utils/oneEuroFilter.ts`

Problematic logic:

- `mincutoff = 3.0` on x/y trusted raw landmarks too much while still adding some phase delay.
- `beta = 0.05` did not adapt strongly enough to fast movement.
- z smoothing was weak relative to MediaPipe's noisy z output.

Fix implemented:

- x/y changed to `mincutoff = 1.15`, `beta = 0.18`, `dcutoff = 1.2`.
- z changed to `mincutoff = 0.8`, `beta = 0.08`.
- Result: stronger still-hand smoothing with faster release during movement.

### `src/utils/landmarkStabilizer.ts`

Remaining issue:

- The deadzone freezes landmarks independently. That reduces micro-jitter, but it can slightly deform the skeleton because one joint may freeze while its neighbor moves.

Recommended next step:

- Replace per-landmark deadzone with a palm-anchored rigid delta deadzone, then apply local finger smoothing around the palm frame.

### `src/utils/kalmanFilter.ts`

Problematic logic:

- `lookahead = 0.04` extrapolated 40 ms into the future, which can overshoot during fast finger movement.
- Low measurement noise made the filter chase MediaPipe jitter after prediction.

Fix implemented:

- Reduced lookahead to 22 ms.
- Slightly increased measurement noise from `0.005` to `0.008`.
- Kept enough process noise for responsive hand motion.

## Worker Pipeline Problems

### `src/workers/handTracking.worker.ts`

Problematic logic:

- Gestures were detected in `predictionLoop()` from predicted landmarks.
- Prediction loop ran at 60 Hz, but MediaPipe measurements arrive around camera cadence. The gesture machine was effectively validating synthetic frames.
- Slots reset immediately on a missed hand slot, which can punish fast motion/occlusion.
- Watchdog detects incoming frame starvation, not successful MediaPipe result starvation.
- GPU delegate has no CPU fallback.

Fix implemented:

- Gesture classification now runs only after fresh MediaPipe detection and smoothing in `processFrame()`.
- `predictionLoop()` only publishes predicted landmarks and the last locked gesture state.
- Per-hand gesture machines now use measured detection cadence.
- Last detection confidence is cached and combined into one global gesture.

Remaining recommendations:

- Add a 2-3 detection-frame grace period before resetting a missing hand slot.
- Add GPU-to-CPU fallback for `HandLandmarker.createFromOptions()`.
- Track `lastSuccessfulDetectionTs` separately from `lastMessageTs`.

## Latency And Performance Bottlenecks

### `src/hooks/useHandTracking.ts`

Problematic logic:

- `frameInFlightRef.current = false` happened in the SAB reader loop when any predicted frame was read.
- The worker publishes predicted frames every 16 ms even when MediaPipe has not finished a new camera frame.
- This let the main thread enqueue new `createImageBitmap(video)` work too early.

Fix implemented:

- Worker now posts `{ type: "frame-processed" }` after `detectForVideo()` completes or drops a frame.
- Main thread releases `frameInFlightRef` only on that worker acknowledgement.
- Removed reader-loop backpressure release.

### `src/hooks/useObjectInteraction.ts`

Problematic logic:

- Grabbed objects used `lerp(..., 0.15)`, creating a strong visual delay.
- Throw velocity was based on the lagged object position.

Fix implemented:

- Added adaptive follow factor: larger gaps use `0.72`, medium gaps use `0.55`, small gaps use `0.36`.
- Velocity tracker now samples the clamped hand target, not the lagged object.

## Rendering Findings

### `src/stores/sceneStore.ts` and `src/components/scene/Scene.tsx`

Remaining issue:

- `tickObjects()` updates Zustand every RAF and maps every object to a new object. `SceneContent` subscribes to `objects`, so React/R3F can re-render at 60 Hz.
- `SceneObject.tsx` creates geometry JSX inside render. With 15 objects this is tolerable, but it is not ideal for a performance-sensitive interaction loop.

Recommended next step:

- Move per-frame object position/velocity updates into R3F `useFrame()` refs or a small imperative object controller.
- Memoize shape geometry/materials or use shared geometry instances by shape type.

## Multi-Hand Findings

### `src/workers/handTracking.worker.ts` and `src/utils/sabSchema.ts`

Remaining issue:

- Slot assignment trusts MediaPipe handedness labels. When labels flip or duplicate, one slot is reset.
- `readHandFromBuffer()` returns `"Hand0"` and `"Hand1"` instead of the original handedness, so downstream code loses semantic handedness.

Recommended next step:

- Track hands by nearest wrist position across frames, using handedness only as a hint.
- Add handedness IDs to the shared buffer schema.

## Likely Regressions From Recent Edits

Git has no committed baseline for `OneDrive/dsa/camera`, so exact diffs are unavailable. Likely regressions visible in code comments and configuration:

- `FOLDED` was increased to `1.10`, making fist/fold states easier to trigger and increasing overlap.
- `STABLE_FRAMES` was reduced to `2`, allowing transient misclassifications through.
- `COOLDOWN_MS` was reduced to `150`, contrary to the original 600 ms anti-spam plan.
- Gesture confidence threshold was lowered to `0.60`, increasing false activations.
- Gesture detection moved onto the predicted landmark stream, causing synthetic threshold crossings.
- Grab smoothing used a fixed `0.15` lerp, causing the perceived lag the user reported.

## Verification

- `npm run typecheck` passes after the implemented changes.

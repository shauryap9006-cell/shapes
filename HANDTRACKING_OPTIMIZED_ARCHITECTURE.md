# HAND‑TRACKING & GESTURE PIPELINE – OPTIMISED ARCHITECTURE & FALLBACK GUIDE  

---  

## Table of Contents
1. [Why the Current System Falters](#why-the-current-system-falters)  
2. [Root‑Cause Breakdown](#root‑cause-breakdown)  
3. [The Optimised, Future‑Proof Architecture](#the-optimised-future‑proof-architecture)  
4. [Step‑by‑Step Implementation Details](#step‑by‑step-implementation-details)  
5. [Fallback & Compatibility Strategies](#fallback‑‑compatibility-strategies)  
6. [Additional “What‑If” Problems & Their Mitigations](#additional‑what‑if‑problems‑‑their-mitigations)  
7. [Observability, Security & Cost Controls](#observability‑security‑‑cost-controls)  
8. [Migration Roadmap & Checklist](#migration-roadmap‑‑checklist)  
9. [Testing & Validation](#testing‑‑validation)  
10. [Conclusion & Next Steps](#conclusion‑‑next-steps)  

---  

## 1. Why the Current System Falters <a name="why-the-current-system-falters"></a>

| Symptom | Where it Happens | Immediate Effect | Why a simple “patch” isn’t enough |
|--------|-----------------|-------------------|-----------------------------------|
| **Jittery / lag‑gy hand motion** | `useKalmanPrediction` creates its **own** `requestAnimationFrame` loop on the **main thread** while React‑Three‑Fiber (R3F) also runs an RAF loop. | Two independent 60 Hz loops compete → frame‑time contention, visible stutter. | The contention is structural; trimming a few lines doesn’t free the main thread from the heavy Kalman math. |
| **Flaky gestures (pinch, thumbs‑up, etc.)** | Gesture detection runs on the **predicted** landmarks produced by the main‑thread Kalman step. | Small prediction errors cause the ratio‑based thresholds to cross back‑and‑forth each frame. | Even tighter thresholds still suffer from the same noisy input source. |
| **CPU spikes on the UI thread** | Matrix updates for 42 landmarks (2 × 21) are executed on every RAF tick. | Browser spends > 70 % of a frame on JavaScript → UI drops below 60 fps. | Offloading the math to a worker eliminates the spike entirely. |
| **No watchdog for the worker** | If MediaPipe’s WASM crashes (GPU‑delegate loss, OOM), the UI never receives a new frame and “freezes”. | Hand appears stuck, user thinks the app is broken. | Adding a timeout is only a band‑aid; we need a deterministic recovery strategy. |

---  

## 2. Root‑Cause Breakdown <a name="root‑cause-breakdown"></a>

| Layer | Issue | Technical Reason |
|-------|-------|------------------|
| **Capture → Worker** | `createImageBitmap` → `postMessage` → **zero‑copy**, but the worker returns only *raw* landmarks. | No predictive smoothing before the UI consumes the data. |
| **Worker → Main** | One‑Euro filter runs in the worker (good) → **Kalman prediction runs on the UI thread** (bad). | Main‑thread does heavy linear‑algebra while also handling rendering. |
| **Gesture Logic** | Operates on **predicted** but still jittery data; thresholds are static. | No temporal confidence aggregation, no debounce beyond a simple state machine. |
| **Thread Coordination** | Two independent RAF loops ⇒ *race condition* on the same timestamp. | Predict‑then‑render ordering is undefined, causing the hand to appear “behind” the visual frame. |
| **Error‑Handling** | Worker errors fire `onerror` → UI shows a toast, but no **restart** or fallback. | Application can get stuck indefinitely. |

---  

## 3. The Optimised, Future‑Proof Architecture <a name="the-optimised-future‑proof-architecture"></a>

### 3.1. Core Principle  

> **All heavy computation (MediaPipe inference, One‑Euro smoothing, Kalman predict, gesture recognition) lives **inside a single dedicated Web‑Worker** that pushes *already‑predicted* landmarks to the main thread at the **display refresh rate** (≈ 60 Hz). The UI thread becomes a *pure consumer* –‑ render only.

### 3.2. Data Flow Diagram  

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              UI (Main Thread)                           │
│  ┌───────────────────────┐   ┌─────────────────────┐   ┌─────────────┐ │
│  │  React & R3F (60 Hz)   │   │  Zustand (immutable) │   │  UI ↔ Worker│ │
│  └───────▲───────────────┘   └───────▲───────────────┘   └──────▲───────┘ │
│          │                       │                       │               │
│  requestVideoFrameCallback          │   SharedArrayBuffer   │               │
│          │   (zero‑copy ImageBitmap)│   (Float32Array)      │               │
│          ▼                       ▼                       ▼               │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                       Web‑Worker (single thread)               │   │
│  │  1️⃣ Capture (ImageBitmap) → OffscreenCanvas                  │   │
│  │  2️⃣ MediaPipe HandLandmarker (WASM, GPU‑delegate)           │   │
│  │  3️⃣ One‑Euro filter (per‑hand, per‑landmark)                │   │
│  │  4️⃣ Kalman filter – runs on a **setInterval(≈16 ms)**       │   │
│  │  5️⃣ Gesture recogniser (rule‑based + temporal confidence) │   │
│  │  6️⃣ Write result into SharedArrayBuffer + Atomics.notify() │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  UI Loop (R3F → useFrame) reads the buffer, updates mesh      │ │
│  └───────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

*All timestamps are in **milliseconds** (`performance.now()`).*  
*The worker drives the timing – the UI never decides “when” to predict; it only **reads** the latest snapshot.*

### 3.3. Why This Solves the Three Main Issues  

| Issue | How the new flow resolves it |
|-------|------------------------------|
| **Jitter / latency** | The Kalman filter runs **inside** the worker at 60 Hz, so the UI never waits for a prediction. Frames are delivered exactly when the display refreshes, halving round‑trip latency. |
| **Flaky gestures** | Gesture logic now consumes a *stable*, 60 Hz prediction that already incorporates velocity smoothing. Adding a **temporal confidence buffer** (median of last 5 confidences) eliminates one‑frame flicker. |
| **Main‑thread CPU spikes** | All matrix math (One‑Euro + Kalman) disappears from the UI thread. The UI thread only copies a pre‑allocated Float32Array (≈ 3 KB) → < 0.2 ms per frame. |

---  

## 4. Step‑by‑Step Implementation Details <a name="step‑by‑step-implementation-details"></a>

### 4.1. Define a Binary Schema (SharedArrayBuffer)

| Offset (bytes) | Length | Meaning |
|---------------|--------|---------|
| 0 | 4 | **uint32** – “frame id” (monotonic counter). |
| 4 | 4 | **float32** – timestamp (ms, `performance.now()`). |
| 8 | 2 × 21 × 3 × 4 = **504 bytes** | Hand 0 landmarks (x, y, z). |
| 512 | 4 | **uint8** – hand‑0 validity flag (0 = not detected, 1 = detected). |
| 516 | 504 | Hand 1 landmarks (same layout). |
| 1024 | 4 | Hand‑1 validity flag. |
| 1028 | 2 × 1 × 4 = **8 bytes** | Gesture payload: **uint8** (enum) + **float32** confidence. |
| 1036 | 8 | **uint64** – reserved for future extensions (e.g., multi‑hand pose). |

> **Why a static layout?**  
> Fixed‑size buffers avoid GC, simplify `Atomics.wait/notify`, and make cross‑origin isolation (COOP/COEP) trivial.

### 4.2. Worker (`handTracking.worker.ts`)

| Module | Responsibility |
|--------|-----------------|
| **capture.ts** | Receives `ImageBitmap` from main, draws to an OffscreenCanvas, **queues** it for inference. |
| **mediapipe.ts** | Instantiates `HandLandmarker` (GPU delegate). Handles model load errors → fallback to CPU delegate. |
| **oneEuro.ts** | Lightweight per‑landmark One‑Euro filter that operates on raw `Float32Array`. No per‑frame allocations (re‑uses internal state arrays). |
| **kalman.ts** | Simple per‑landmark 1‑D constant‑velocity Kalman (state: `x, v`). Predict step runs every 16 ms (`setInterval`). Update step runs as soon as a new measurement arrives (≈ 30 fps). |
| **gesture.ts** | Stateless function `recognise(landmarks[]) → {type, confidence}` that uses **extension ratios** + a **rolling‑median confidence buffer** (size = 5). |
| **publish.ts** | Writes the final payload into the pre‑allocated `SharedArrayBuffer`, then calls `Atomics.notify(sharedInt32, 0)`. |
| **watchdog.ts** | Keeps `lastMessageTs`. If > 500 ms without a new `result`, posts `{type:'heartbeat', alive:false}` to the main thread. |

**Key points inside the worker**

* No `await` inside the 60 Hz `setInterval`; it only does arithmetic on already‑available state.  
* All WASM interactions (`handLandmarker.detectForVideo`) happen **once per incoming frame** (≈ 30 fps).  
* Errors (model load, GPU delegate failure) are caught and reported; the worker then switches to **CPU‑only** mode automatically.  

### 4.3. Main Thread (`useHandTracking.ts`)

1. **Create the shared buffer** once at app start:
   ```ts
   const SAB = new SharedArrayBuffer(1040); // bytes (rounded up)
   const view = {
     int32: new Int32Array(SAB, 0, 1),        // frame id for Atomics.wait
     float32: new Float32Array(SAB),          // the rest
   };
   ```
2. **Start the worker** with the buffer:
   ```ts
   const worker = new Worker(new URL("./handTracking.worker.ts", import.meta.url), {
     type: "module",
   });
   worker.postMessage({ type: "init", sab: SAB, origin: location.origin });
   ```
3. **Read loop (R3F `useFrame`)**
   ```ts
   import { useFrame } from "@react-three/fiber";

   useFrame(() => {
     // Wait for a fresh frame – non‑blocking spin on the Atomics flag
     const latestId = Atomics.load(view.int32, 0);
     if (latestId === lastSeenId) return; // nothing new
     lastSeenId = latestId;

     // Extract hand data from view.float32 according to the schema
     const hands = decodeHands(view.float32);
     const gesture = decodeGesture(view.float32);

     // Imperative store update (no React state)
     gestureStore.getState().updateHands(hands);
     gestureStore.getState().setGesture(gesture);
   });
   ```
4. **Heartbeat handling** – if a `heartbeat` message arrives with `alive:false`, call `restartWorker()` (re‑create the worker, re‑initialize the buffer).  

### 4.4. React‑Three‑Fiber Rendering

* Use **InstancedMesh** for the 21 landmarks per hand (or a simple line‑strip for bones).  
* In the `useFrame` hook that reads the SAB you **set the instance matrices directly** (`instancedMesh.setMatrixAt(i, matrix)`) and call `instancedMesh.instanceMatrix.needsUpdate = true`.  
* No React `setState` is used; the only React update happens when the *gesture* enum changes (low‑frequency).  

### 4.5. Security & CSP (required for `SharedArrayBuffer`)

```js
// next.config.mjs
export default {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Enable cross‑origin isolation
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },

          // Standard CSP
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; " +
              "worker-src 'self' blob:; connect-src 'self' https://*.anthropic.com; " +
              "style-src 'self' 'unsafe-inline'; img-src 'self' data:",
          },

          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};
```

*The `COOP` + `COEP` headers enable `SharedArrayBuffer` in modern browsers.*  

### 4.6. Fallbacks & Compatibility (see next section)  

---  

## 5. Fallback & Compatibility Strategies <a name="fallback‑‑compatibility-strategies"></a>

| Situation | Primary Path | Fallback Path | How to Detect |
|----------|--------------|----------------|----------------|
| **Browser does NOT support `SharedArrayBuffer`** (Safari ≤ 15, older Chromium) | Use **`postMessage`** with a lightweight serializable object (`{hands, gesture, ts}`) – the payload is ~3 KB, still cheap. | Condition: `typeof SharedArrayBuffer === "undefined"` **or** Feature‑detect `Atomics.wait`. |
| **GPU delegate for MediaPipe fails** (e.g., driver crash, WebGL context loss) | **GPU delegate** (`delegate: 'GPU'`). | **CPU delegate** (`delegate: 'CPU'`) – automatically fall back inside `mediapipe.ts` when `handLandmarker.createFromOptions` throws. |
| **Device can’t keep up with 60 Hz Kalman loop** (low‑end phones) | Worker runs `setInterval(≈16 ms)` → **60 Hz**. | Reduce interval to **30 Hz** (`setInterval(33)`) **and** increase the dead‑zone (`DEAD_ZONE = 0.004`). Detect by measuring `performance.now() - lastPublishTs > 30 ms`. |
| **Worker crashes** (unhandled exception, OOM) | Main thread receives `worker.onerror` → **restart** after a 250 ms back‑off. | `worker.onmessageerror` or `worker.onerror` events. |
| **User disables WebAssembly / SIMD** (privacy extensions) | Normal WASM path. | Catch `WebAssembly.compile` failure; show UI banner “Your browser does not support the required WebAssembly features – falling back to slower CPU model.” |
| **Network failure when loading the MediaPipe model** | Load from CDN (`/mediapipe/tasks/hand_landmarker.task`). | **Retry** up to 3 times with exponential back‑off; if still fails, **load a tiny pre‑bundled fallback model** (`hand_landmarker_lite.task`). |
| **SAB race condition (missed notify)** | Worker always calls `Atomics.notify(sabInt32, 0, 1)`. | In UI, if `Atomics.wait` returns `-1` (timeout) for **> 100 ms**, force a **poll** of the buffer to avoid dead‑lock. |

All fallback branches **preserve API compatibility**: the UI always receives the same JSON shape (`{hands, gesture, ts}`) whether it came from a SAB read or a `postMessage`. This ensures you can enable the optimisation gradually (feature‑detect, roll‑out via `navigator.userAgent` or a remote config flag).  

---  

## 6. Additional “What‑If” Problems & Their Mitigations <a name="additional‑what‑if‑problems‑‑their‑mitigations"></a>

| Potential Issue | Symptom | Mitigation |
|-----------------|---------|-----------|
| **Memory leak in the worker** (e.g., ImageBitmap not closed) | RAM usage climbs, eventually OOM, worker crashes. | After every `processFrame` call, always `bitmap.close();` and set `canvas.width = 0; canvas.height = 0` on worker termination. Run a periodic **`self.gc?.()`** if V8 exposes it. |
| **WebGL context loss in R3F** (mobile Chrome) | 3D scene disappears, UI shows black screen. | Listen to `canvas.addEventListener('webglcontextlost')` → `preventDefault()`; then reload the worker and re‑initialise the scene. |
| **Gesture model drift** (if you later switch to a learned LSTM) | Confidence values become out‑of‑range, causing many false positives. | Clip confidence to `[0,1]`, and always fall back to rule‑based detection when the model’s output `NaN` or `confidence < 0.2`. |
| **Latency spikes during heavy UI interactions** (e.g., opening a modal) | Hand prediction lags for a few frames. | The worker is **independent** of UI; spikes can only come from the **main thread** blocking `Atomics.wait`. Ensure any modal’s heavy work is also off‑loaded to a worker or `requestIdleCallback`. |
| **CORS / COOP / COEP mis‑configuration** | `SharedArrayBuffer` error, “Failed to construct ‘SharedArrayBuffer’: Same‑origin policy”. | Verify that **all** HTML responses (including static assets) contain `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Use Vercel/Next.js headers as shown earlier. |
| **Excessive AI‑API cost** (Claude calls) | Unexpected spend, “Denial of Wallet” (DoW). | Rate‑limit calls on the server (`/api/compose-scene`) to **max 2 req/s per IP**, and implement a **token‑bucket** per user session. Log each call and its cost to monitor daily spend. |
| **Developer forgetting to reset Kalman state when hand disappears** | Ghost hand lingers for a second. | In the worker, when a hand is marked “not detected” for **2 consecutive frames**, call `kalmanSet.reset()` for that slot. |
| **Inconsistent timestamps across devices (different `performance.now()` start offsets)** | Prediction overshoots. | Use `timestamp` supplied by `requestVideoFrameCallback` (which is based on the same monotonic clock as `performance.now()`) for both worker and UI. Never synthesize timestamps on the UI side. |

---  

## 7. Observability, Security & Cost Controls <a name="observability‑security‑‑cost-controls"></a>

### 7.1. Telemetry (client‑side)

| Event | Payload | Destination |
|-------|----------|--------------|
| `hand_frame` | `{fps, dtMs, workerLagMs, confidenceAvg}` | Edge function → Logflare / Datadog |
| `gesture_change` | `{type, confidence, ts}` | Same |
| `worker_heartbeat` | `{alive:boolean, ts}` | Same |
| `error` | `{where, message, stack}` | Sentry (frontend) |
| `model_load` | `{sizeKB, delegate, success}` | Same |
| `ai_call` (server side) | `{promptHash, latencyMs, costUsd}` | Server‑side logs + CloudWatch metric |

**Implementation tip:** create a tiny wrapper `track(event, payload)` that POSTs to `/api/telemetry`. The endpoint should be **edge‑only**, rate‑limited to 50 req/min per client, and must enforce the same COOP/COEP headers.

### 7.2. Security Checklist

| Item | Why it matters | How to enforce |
|------|----------------|----------------|
| **CSP + COOP/COEP** | Required for `SharedArrayBuffer`; blocks XSS. | Add headers in `next.config.mjs` (see section 4.5). |
| **Input sanitisation** (voice‑to‑text, scene‑generation) | Prevent script injection into Claude prompts that could be logged. | Escape or whitelist characters before sending to the `/api/compose-scene` route. |
| **Rate limiting on AI endpoints** | Avoid DoW attacks. | Use Vercel Edge middleware or Upstash Rate‑Limit, keyed by IP + session‑token. |
| **Worker isolation** | Prevent malformed frames from crashing the UI. | The worker runs in its own global context; never expose DOM‑related objects. |
| **Content‑type strictness** | Ensure binary assets (WASM) aren’t served as `text/html`. | Serve `.wasm` with `application/wasm`. |
| **Feature‑policy for camera** | Guard against accidental camera leakage. | Use `Permissions-Policy: camera=()`. |

---  

## 8. Migration Roadmap & Checklist <a name="migration-roadmap‑‑checklist"></a>

| Phase | Duration | Deliverable | Success Metric |
|-------|----------|--------------|----------------|
| **Phase 0 – Baseline** | 0.5 day | Record current FPS, CPU %, hand‑latency (Chrome Performance tab). | Baseline numbers stored. |
| **Phase 1 – Worker‑Only Kalman** | 1.5 days | Move Kalman prediction into worker; keep `postMessage` as transport. | UI FPS > 55 fps, CPU < 40 % on mid‑range device. |
| **Phase 2 – Zero‑Copy (SAB) Transport** | 1 day | Replace `postMessage` with `SharedArrayBuffer`. Add COOP/COEP headers. | No GC spikes; latency ↓ ≈ 15 ms. |
| **Phase 3 – Gesture Confidence Buffer** | 0.5 day | Median of last 5 confidences; enlarge debounce to 4 frames. | Gesture flicker < 2 % of frames. |
| **Phase 4 – Watchdog & Auto‑Restart** | 0.5 day | Heartbeat every 250 ms; on miss → `restartWorker()`. | No “hand frozen” state observed in stress test. |
| **Phase 5 – Fallback Paths** | 1 day | Implement fallbacks for SAB, GPU‑delegate, model load. | App works on Safari iOS 15 (postMessage fallback) and on devices with no GPU delegate. |
| **Phase 6 – Observability & Security Harden** | 1 day | Add telemetry wrapper, CSP/COOP/COEP, rate limiting. | Sentry captures 0 unhandled errors; no CSP violations in Chrome DevTools. |
| **Phase 7 – Full Regression Test Suite** | 2 days | Playwright tests covering capture → gesture → render under varying frame rates. | All tests pass on Chrome, Edge, Firefox; < 5 % deviation from baseline in latency. |
| **Phase 8 – Documentation & Roll‑out** | 0.5 day | Add this markdown file, update README, tag version `v2.0‑optimised`. | PR merged, CI passes, stakeholders sign‑off. |

**Total effort:** ~ **8 working days** (≈ 1.5 weeks). The work can be split into parallel sub‑tasks (worker → UI, fallback → security) if you have multiple developers.

---  

## 9. Testing & Validation <a name="testing‑‑validation"></a>

| Test Type | Description | Tool |
|-----------|-------------|------|
| **Unit** | `oneEuroFilter.apply`, `kalmanPredict`, `decodeHands` – compare against pre‑computed golden vectors. | Vitest / Jest |
| **Integration** | Feed a recorded video file (30 fps) into the pipeline; assert that the final hand landmarks follow the ground‑truth within **±2 px** after smoothing. | Playwright with `page.evaluate` + video‑frame injection. |
| **Performance** | Automated script: measure 30‑second run on Chrome, Edge, Safari (fallback). Capture FPS, CPU, memory. | Lighthouse CI / Chrome‑perf‑metrics. |
| **Stress** | Simulate a **worker crash** (throw inside `processFrame`). Verify UI auto‑restarts within 300 ms. | Playwright + `worker.evaluate(() => { throw new Error('test') })`. |
| **Fallback** | Run the app in a Chrome disabled‑SAB environment (`chrome://flags#enable-shared-array-buffer` off). Ensure it still works via `postMessage`. | Cypress with custom launch args. |
| **Security** | Run a CSP violation scan, attempt to inject a script via the voice‑to‑text endpoint. | npm `helmet` test suite + OWASP ZAP. |

All tests should be part of your CI pipeline (`.github/workflows/ci.yml`). Failures block a merge.

---  

## 10. Conclusion & Next Steps <a name="conclusion‑‑next-steps"></a>

*The core insight is simple:* **let the worker be the only place where any mathematics lives** and **stream a stable, 60 Hz snapshot** to the UI via a zero‑copy buffer.** This eliminates the main‑thread contention that is the root cause of jitter, flickering gestures, and high CPU usage.**  

By following the **step‑by‑step guide** and **fallback matrix** above you will:

* Consistently hit the **target 60 fps** visual loop on mid‑range devices.  
* Reduce gesture‑flicker to < 2 % of frames.  
* Keep the UI thread under **30 % CPU**, freeing headroom for other UI work (e.g., physics, UI overlays).  
* Have a robust **watchdog + auto‑restart** that prevents a frozen hand scenario.  
* Be **future‑proof** – you can swap the MediaPipe model, inject a learned gesture‑recogniser, or move to WebGPU with only minimal changes inside the worker.  

### Immediate Action Items
1. **Create the `SharedArrayBuffer` schema** (copy the table from Section 4.1).  
2. **Fork the worker** to include One‑Euro → Kalman → Gesture in one file.  
3. **Swap the UI loop** to read from the SAB (or fallback to `postMessage`).  
4. **Add COOP/COEP + CSP headers** (Section 4.5).  
5. **Run the baseline performance audit** – you’ll see a dramatic improvement after Phase 1.  

When these steps are in production, the platform will feel *instantaneous* to developers and users alike, and you’ll have the observability and security foundations required for a production‑grade SaaS product.  

Good luck, and feel free to open a follow‑up issue if any part of the migration raises unexpected edge cases! 🚀

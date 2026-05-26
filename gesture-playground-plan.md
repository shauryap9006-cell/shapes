# Gesture Playground

> A browser-based, realtime gesture-controlled 3D experience. No logins. No dashboards. The interaction IS the product.

---

## What We Are Building

Gesture Playground is a fullscreen browser experience where users control a 3D environment using only their hands through a webcam.

The user opens the site, enables their camera, and their hands become the controller. They can spawn 3D objects, grab them, throw them, and interact with the scene entirely through gestures — no mouse, no keyboard, no UI buttons.

The core focus is:

- **Hand tracking** via webcam in realtime
- **Gesture recognition** — detecting what the hand is doing
- **3D object interaction** — grabbing, moving, throwing objects
- **Immersive feel** — dark, minimal, futuristic environment

This is not a traditional website. There is no complex UI, no login, no dashboard. The only screens are a minimal entry screen and the experience itself.

---

## The Feel

- Futuristic and experimental
- Smooth and responsive
- Minimal UI — almost nothing on screen except the 3D scene and your hands
- The hand skeleton is visible as a subtle overlay so users can see they are being tracked

---

## What We Are NOT Building (Level 1)

- Complex landing pages
- Authentication or user accounts
- Heavy UI/UX flows
- AR overlays
- Multiplayer
- Shader-heavy effects
- Particle morphing or holographics

These belong to future scope only.

---

## Simple User Flow

```
1. User opens the site
       ↓
2. Minimal entry screen appears
   — Project name
   — "Enter Experience" button
       ↓
3. User clicks Enter — webcam permission is requested
       ↓
   [Permission denied?]
   → Show clear message + retry button. Stop here.
       ↓
4. Camera feed starts (hidden behind scene, used for tracking only)
       ↓
5. MediaPipe loads and begins detecting hands
       ↓
   [MediaPipe fails to load?]
   → Show error message. Stop here.
       ↓
6. Hand skeleton overlay appears — user sees their hands tracked
       ↓
7. Gesture hint panel fades in (semi-transparent, corner of screen)
   — Shows current detected gesture + what it does
       ↓
8. User makes gestures → objects spawn, move, get grabbed, get thrown
       ↓
9. User interacts freely with the 3D scene
```

---

## Gesture → Action Map

| Gesture | Action |
|---|---|
| ✌️ Two fingers (index + middle) | Spawn cube |
| ☝️ One finger (index only) | Spawn sphere |
| 🤟 Three fingers | Spawn torus |
| ✊ Fist | Grab nearest object |
| 🖐️ Open palm | Release held object |
| 🤏 Pinch | Precise grab (small objects) |
| ✊✊ Both fists simultaneously | Clear all objects (scene reset) |

> **Debounce rule:** Every gesture action has a 600ms cooldown. Gesture must be held stable for 200ms before triggering. This prevents accidental spam.

---

## Technical Flow

```
Webcam feed (browser MediaStream API)
       ↓
Web Worker (OffscreenCanvas)
       ↓
MediaPipe Hands — processes frames, outputs 21 landmarks per hand
       ↓
Gesture Recognition Layer
— Reads landmark positions
— Computes finger states (extended / folded)
— Applies debounce + stability threshold
— Outputs: gesture name + confidence score
       ↓
Coordinate Mapper
— Converts MediaPipe 2D normalized coords (0–1) → Three.js world coords
— Maps camera space to 3D scene space
       ↓
Interaction Engine
— Gesture → action mapping
— Object grab / release / throw logic
— Velocity tracking (last 8 frames) for throw force
       ↓
Three.js / React Three Fiber
— Renders 3D scene
— Updates object positions in realtime
— Manages object pool (max 15 objects)
       ↓
Rendered output in browser — 60fps target
```

---

## Coordinate Mapping (Critical Detail)

MediaPipe outputs landmarks as `{ x, y, z }` where x and y are normalized 0–1 (relative to video frame). Three.js uses world space with its own coordinate system. The mapper layer handles this:

```
mediapipe.x (0–1)  →  three_x = (x - 0.5) * sceneWidth
mediapipe.y (0–1)  →  three_y = -(y - 0.5) * sceneHeight   ← Y is flipped
mediapipe.z        →  used for depth / scale hints only
```

This utility lives in `src/utils/coordinateMapper.ts` and is used by the interaction engine only.

---

## Tech Stack

### Core Framework
| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Framework |
| React 18 | UI layer |
| TypeScript | Type safety throughout |

### 3D Engine
| Tool | Purpose |
|---|---|
| Three.js | Core 3D rendering |
| React Three Fiber | React bindings for Three.js |
| @react-three/drei | Helpers — lighting, camera, effects |

### Hand Tracking
| Tool | Purpose |
|---|---|
| MediaPipe Hands | Hand landmark detection (21 points per hand) |
| OffscreenCanvas + Web Worker | Run MediaPipe off main thread to avoid jank |

### Physics (Phase 7 only — not in MVP)
| Tool | Purpose |
|---|---|
| Rapier (@dimforge/rapier3d) | Collision, gravity, throw physics |

> Rapier is NOT used in MVP. Throwing in MVP uses velocity calculated from hand movement over the last 8 frames. Rapier is added in Phase 7 once core interaction is solid.

### State Management
| Tool | Purpose |
|---|---|
| Zustand | Global state — scene objects, gesture state, camera state |

### Animations
| Tool | Purpose |
|---|---|
| Framer Motion | Entry screen transitions only |

### Styling
| Tool | Purpose |
|---|---|
| Tailwind CSS | Minimal UI elements (entry screen, hint overlay) |

---

## Zustand Store Design

```ts
// Scene store
{
  objects: SceneObject[]         // all live objects in the scene
  addObject: (type) => void
  removeObject: (id) => void
  clearScene: () => void
  grabbedObjectId: string | null
  setGrabbed: (id | null) => void
}

// Gesture store
{
  currentGesture: GestureType | null
  confidence: number
  handPosition: Vector3 | null
  bothHandsVisible: boolean
}

// Camera store
{
  permitted: boolean
  active: boolean
  error: string | null
}
```

---

## Project Architecture

```
src/
│
├── app/
│   ├── page.tsx              ← Entry screen (minimal)
│   └── experience/
│       └── page.tsx          ← Main experience route
│
├── components/
│   ├── scene/
│   │   ├── Scene.tsx         ← R3F Canvas, lighting, environment
│   │   ├── SceneObject.tsx   ← Individual 3D object (cube/sphere/torus)
│   │   └── HandOverlay.tsx   ← Landmark skeleton rendered in scene
│   │
│   ├── gestures/
│   │   ├── GestureEngine.tsx ← Reads landmarks, outputs gesture state
│   │   └── GestureHint.tsx   ← Corner overlay showing current gesture
│   │
│   ├── webcam/
│   │   └── WebcamManager.tsx ← Camera permission, stream, error states
│   │
│   └── ui/
│       ├── EntryScreen.tsx   ← Landing (minimal — title + one button)
│       └── ErrorScreen.tsx   ← Camera/MediaPipe failure states
│
├── hooks/
│   ├── useHandTracking.ts    ← MediaPipe worker bridge
│   ├── useGesture.ts         ← Current gesture + cooldown logic
│   └── useObjectInteraction.ts ← Grab, move, throw logic
│
├── stores/
│   ├── sceneStore.ts
│   ├── gestureStore.ts
│   └── cameraStore.ts
│
├── utils/
│   ├── coordinateMapper.ts   ← MediaPipe 2D → Three.js 3D
│   ├── gestureDetector.ts    ← Landmark → gesture name logic
│   └── velocityTracker.ts    ← Last N frames → throw vector
│
├── workers/
│   └── handTracking.worker.ts ← MediaPipe runs here (off main thread)
│
└── types/
    ├── gesture.types.ts
    ├── scene.types.ts
    └── mediapipe.types.ts
```

---

## Assets Required

### Fonts
- **Space Grotesk** — primary UI font (entry screen, overlays)
- **Inter** — fallback / body text

Load via `next/font/google`. No downloads needed.

### Icons
- Camera permission icon — inline SVG (simple camera shape)
- Gesture hint icons — inline SVG per gesture (hand silhouettes)
- No icon library needed — keep it custom and minimal

### 3D Objects
All procedural — no downloaded models needed.

| Shape | Three.js Geometry |
|---|---|
| Cube | `BoxGeometry` |
| Sphere | `SphereGeometry` |
| Torus | `TorusGeometry` |
| Pyramid | `ConeGeometry` (4 segments) |

Materials use `MeshStandardMaterial` with slight emissive glow. Colors vary per shape type.

### Lighting
- Ambient light (low intensity, dark environment)
- Point light following grabbed object (glow effect on interaction)
- Optional: simple HDRI via `@react-three/drei` `<Environment>` — use `"night"` or `"studio"` preset. No file download.

### Environment
- Background: solid dark (`#0a0a0f`)
- Optional subtle grid on floor plane — `GridHelper` in Three.js
- No textures, no skybox needed at Level 1

### Audio (Optional — Level 1 bonus)
- Spawn sound — short synth pop (~0.3s)
- Grab sound — soft click
- Release / throw sound — whoosh

Use the Web Audio API directly to generate these procedurally. No audio files needed.

### No Heavy Assets
The project intentionally avoids:
- Downloaded 3D models
- Texture files
- Audio files
- External image assets

Everything is either procedural, generated at runtime, or loaded via CDN font.

---

## Development Roadmap

### Phase 1 — Project Setup
**Goal:** Render a 3D object in the browser.

- Init Next.js 14 with TypeScript and Tailwind
- Install and configure React Three Fiber
- Set up basic R3F `<Canvas>` with a cube
- Add ambient + point lighting
- Verify 60fps render loop

**Done when:** A spinning cube is visible in the browser.

---

### Phase 2 — Entry Screen + Camera Access
**Goal:** Working webcam feed with error handling.

- Build minimal entry screen (title + button, Framer Motion fade)
- Implement `WebcamManager` — request permission, handle denial
- Show clear error UI for: denied, HTTPS required, no camera found
- Camera feed runs but is hidden (only used for tracking)
- Set up `cameraStore` in Zustand

**Done when:** Camera stream is live and error states all work correctly.

---

### Phase 3 — Hand Tracking
**Goal:** Both hands tracked in realtime, landmarks visible.

- Set up Web Worker (`handTracking.worker.ts`)
- Load MediaPipe Hands inside the worker using `OffscreenCanvas`
- Bridge worker output to main thread via `postMessage`
- Implement `useHandTracking` hook
- Render hand skeleton overlay in scene (`HandOverlay.tsx`)
- Handle: MediaPipe load failure, hand not visible, single hand

**Done when:** Hand skeleton renders smoothly over the 3D scene with no jank.

---

### Phase 4 — Gesture Recognition
**Goal:** Stable, debounced gesture detection.

- Build `gestureDetector.ts` — landmark analysis for all 7 gestures
- Implement finger state logic (extended vs folded per finger)
- Add 200ms stability threshold (gesture must hold before firing)
- Add 600ms cooldown per action
- Show detected gesture name in `GestureHint` overlay
- Set up `gestureStore`

**Done when:** All 7 gestures detect correctly, no false triggers.

---

### Phase 5 — Coordinate Mapping + Object Spawning
**Goal:** Spawn objects at hand position using gestures.

- Build `coordinateMapper.ts` (MediaPipe → Three.js space)
- Implement object spawning logic in `sceneStore`
- Wire spawn gestures (1 finger → sphere, 2 fingers → cube, 3 fingers → torus)
- Add object pool limit (max 15 — remove oldest on overflow)
- Add spawn animation (scale from 0 → 1 over 200ms)
- Implement scene clear (both fists → remove all)

**Done when:** Different gestures spawn different shapes at the correct screen position.

---

### Phase 6 — Object Interaction (Grab / Move / Release / Throw)
**Goal:** Users can grab and manipulate objects with their hands.

- Implement proximity detection (fist near which object?)
- Build `useObjectInteraction` hook
- Grabbed object follows hand position in realtime
- Build `velocityTracker.ts` — track hand position over last 8 frames
- On release (open palm): apply stored velocity as throw vector
- Lerp object movement for smoothness (avoid snapping)

**Done when:** User can grab an object, move it, and throw it convincingly.

---

### Phase 7 — Physics (Rapier)
**Goal:** Natural collision and gravity.

- Install `@dimforge/rapier3d-compat`
- Add gravity to all objects (fall to floor plane)
- Add floor collider (invisible plane at y=0)
- Add rigid bodies to scene objects
- Integrate throw velocity with Rapier's impulse system
- Objects collide with each other and bounce

**Done when:** Objects fall, stack, bounce, and collide naturally.

---

### Phase 8 — Polish
**Goal:** Make the experience feel premium.

- Add `postprocessing` via `@react-three/postprocessing`
  - Bloom on emissive materials
  - Subtle vignette
- Smooth easing on all object movements
- Point light follows grabbed object (glow transfer effect)
- Gesture hint overlay fades after 10s, reappears on no-gesture-detected
- Performance check — maintain 60fps on mid-range hardware
- Desktop-only guard: show "best on desktop" message on mobile

**Done when:** The experience feels smooth, immersive, and polished.

---

## MVP Definition

Build only this to prove the core works:

| Feature | Status |
|---|---|
| Webcam access + error states | Required |
| MediaPipe hand tracking in Web Worker | Required |
| Hand skeleton overlay | Required |
| Fist gesture → grab | Required |
| Two fingers gesture → spawn cube | Required |
| Open palm → release / throw | Required |
| Coordinate mapping (2D → 3D) | Required |
| Gesture debounce + cooldown | Required |
| Basic dark scene (no effects) | Required |
| Physics | Phase 7 only |
| Bloom / postprocessing | Phase 8 only |
| Audio | Optional bonus |

**MVP is complete when:** A user can open the site, enable camera, spawn a cube with two fingers, grab it with a fist, and throw it with an open palm — all smoothly without lag.

---

## Known Risks + Mitigations

| Risk | Mitigation |
|---|---|
| MediaPipe + R3F jank on main thread | Run MediaPipe in Web Worker via OffscreenCanvas |
| Gesture fires 10× per second | 200ms hold threshold + 600ms cooldown |
| Webcam fails silently | Explicit permission flow + error UI for every failure case |
| MediaPipe WASM fails to load | Loading state + error screen + retry button |
| Coordinate space mismatch | Dedicated `coordinateMapper.ts` utility |
| Scene fills up with objects | Hard cap at 15 objects, auto-remove oldest |
| Mobile performance unusable | Desktop-only guard on entry screen |

---

## Future Scope (Not Level 1)

- Holographic particle effects on spawn
- Custom GLSL shaders per object type
- Gesture combos (sequence of gestures = special action)
- Rapier soft body / cloth simulation
- Particle morphing between shapes
- Multiplayer rooms (shared scene via WebRTC)
- AR mode (objects composited over real camera feed)
- Hand-drawn gesture recording (custom gesture training)

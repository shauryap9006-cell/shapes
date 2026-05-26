# Gesture Playground — Project Overview

> Control a 3D world with your bare hands. No mouse. No keyboard. Just your webcam and your gestures.

---

## The Idea

Gesture Playground is a browser-based 3D experience where your hands are the only controller.

You open the site. You enable your camera. Your hands appear as a glowing skeleton overlaid on a dark, minimal 3D scene. You raise two fingers — a cube materialises in the air where your hand is. You make a fist and the cube snaps to your grip. You fling your hand forward and it flies across the scene.

That's the whole thing. And that's enough.

This is not a website. It is an experience. There is no dashboard, no login screen, no feed. The only interface is the 3D scene and your hands moving through it.

---

## What We're Building

A realtime, fullscreen, gesture-controlled 3D sandbox running entirely in the browser.

**The core loop:**

```
Open site → Enable camera → See hands tracked → Make gestures → Interact with 3D objects
```

**What users can do:**

- Spawn 3D shapes (cube, sphere, torus, pyramid) using hand gestures
- Grab objects with a fist and move them through 3D space
- Throw objects by releasing with velocity
- Reset the scene with both fists
- Speak to the scene to build complex layouts via AI
- Teach the app new gestures using their own hands

**What it is NOT:**

- Not a traditional website with pages and navigation
- Not a dashboard or productivity tool
- Not mobile — desktop only, Level 1
- Not complex — the UI is almost invisible

---

## The Feel

Dark environment. Subtle glow. Your hands rendered as a delicate landmark skeleton. Objects that respond to you instantly. The scene feels like something that shouldn't be possible in a browser tab.

Keywords: **futuristic · experimental · tactile · immersive · minimal**

---

## Tech Stack

### Framework
| | Tool | Why |
|--|--|--|
| Framework | Next.js 14 (App Router) | Routing, API routes for AI, SSR |
| UI | React 18 + TypeScript | Component structure, type safety |
| Styling | Tailwind CSS | Minimal UI on entry screen and overlays |

### 3D Engine
| | Tool | Why |
|--|--|--|
| 3D | Three.js | Core rendering, geometry, lighting |
| React bindings | React Three Fiber | Declarative Three.js in React |
| Helpers | @react-three/drei | Camera, environment, postprocessing helpers |
| Post FX | @react-three/postprocessing | Bloom, vignette (Phase 8) |

### Hand Tracking
| | Tool | Why |
|--|--|--|
| Tracking | MediaPipe Hands | 21 landmarks per hand, realtime |
| Threading | Web Worker + OffscreenCanvas | Keeps MediaPipe off the main thread |

### State & Animation
| | Tool | Why |
|--|--|--|
| State | Zustand | Scene objects, gesture state, camera state, AI state |
| Animation | Framer Motion | Entry screen transitions only |

### AI Layer
| | Tool | Where it runs |
|--|--|--|
| Voice commands | Claude API + Web Speech API | Cloud (via Next.js API route) |
| Scene composer | Claude API | Cloud (via Next.js API route) |
| Custom gestures | TensorFlow.js | On-device, Web Worker |
| Mood engine | Custom heuristic | On-device, main thread |
| Object personality | Claude API | Cloud (via Next.js API route) |

### Physics (Phase 7 only)
| | Tool | Why |
|--|--|--|
| Physics | Rapier (@dimforge/rapier3d-compat) | Collision, gravity, throw impulse |

> Rapier is not installed in MVP. Throwing uses a velocity vector calculated from the last 8 frames of hand position.

---

## Project Architecture

```
src/
│
├── app/
│   ├── page.tsx                  ← Entry screen
│   ├── experience/
│   │   └── page.tsx              ← Main experience route
│   └── api/
│       ├── voice-command/        ← Claude API: voice → actions
│       ├── compose-scene/        ← Claude API: text → scene JSON
│       └── object-personality/   ← Claude API: behavior profiles
│
├── components/
│   ├── scene/
│   │   ├── Scene.tsx             ← R3F Canvas, lighting, floor
│   │   ├── SceneObject.tsx       ← Individual 3D shape
│   │   └── HandOverlay.tsx       ← Landmark skeleton renderer
│   │
│   ├── gestures/
│   │   ├── GestureEngine.tsx     ← Reads landmarks → gesture state
│   │   └── GestureHint.tsx       ← Corner overlay (current gesture)
│   │
│   ├── webcam/
│   │   └── WebcamManager.tsx     ← Permission flow, error states
│   │
│   └── ui/
│       ├── EntryScreen.tsx       ← Title + Enter button
│       ├── ErrorScreen.tsx       ← Camera / MediaPipe errors
│       ├── VoiceIndicator.tsx    ← Mic listening / processing state
│       └── SceneComposer.tsx     ← AI text input for scene building
│
├── hooks/
│   ├── useHandTracking.ts        ← Worker bridge, landmark stream
│   ├── useGesture.ts             ← Gesture + cooldown logic
│   └── useObjectInteraction.ts   ← Grab, move, throw
│
├── stores/
│   ├── sceneStore.ts
│   ├── gestureStore.ts
│   ├── cameraStore.ts
│   └── aiStore.ts
│
├── utils/
│   ├── coordinateMapper.ts       ← MediaPipe 2D → Three.js 3D
│   ├── gestureDetector.ts        ← Landmark analysis → gesture name
│   ├── velocityTracker.ts        ← Last N frames → throw vector
│   └── moodEngine.ts             ← Hand energy → scene mood
│
├── workers/
│   ├── handTracking.worker.ts    ← MediaPipe runs here
│   └── gestureTrainer.worker.ts  ← TF.js custom gesture training
│
└── types/
    ├── gesture.types.ts
    ├── scene.types.ts
    └── mediapipe.types.ts
```

---

## User Flow

```
1.  Open site
         ↓
2.  Entry screen — minimal (title + Enter button)
         ↓
3.  Click Enter → webcam permission request
         ↓
    [Denied?] → Error screen + retry button. Stop.
         ↓
4.  Camera stream starts (hidden — tracking only)
         ↓
5.  MediaPipe loads in Web Worker
         ↓
    [Load fail?] → Error screen + retry button. Stop.
         ↓
6.  Hand skeleton overlay appears
         ↓
7.  Gesture hint panel fades in (corner of screen)
         ↓
8.  User makes gestures → objects spawn, move, get thrown
         ↓
9.  [AI] Voice commands / scene composer available
         ↓
10. Free interaction — no time limit, no end state
```

---

## Gesture System

| Gesture | Detection | Action |
|---|---|---|
| ✌️ Two fingers | Index + middle extended | Spawn cube |
| ☝️ One finger | Index only extended | Spawn sphere |
| 🤟 Three fingers | Index + middle + ring | Spawn torus |
| ✊ Fist | All fingers folded | Grab nearest object |
| 🖐️ Open palm | All five extended | Release / throw |
| 🤏 Pinch | Thumb + index tip < threshold | Precise grab |
| ✊✊ Both fists | Fist on both hands | Clear all objects |

**Debounce rules:**
- Gesture must be held stable for **200ms** before firing
- **600ms cooldown** after any action fires
- Prevents spam, accidental triggers, and rapid re-fires

---

## AI Integrations

### 1. Voice Commands (Claude API)
User speaks → Web Speech API transcribes → sent to Claude via API route → Claude returns structured JSON action list → scene executes it.

Example: *"spawn five spheres in a circle"* → 5 spheres appear arranged in a ring.

### 2. Scene Composer (Claude API)
User types a scene description → Claude returns full scene config as JSON (object types, positions, scales, colors) → scene is rebuilt from that config.

Example: *"recreate the solar system"* → 8 spheres of varying sizes appear in orbital positions.

### 3. Custom Gesture Training (TensorFlow.js — on-device)
User holds a new pose 5 times → TF.js trains a classifier in the browser → custom gesture is added to the gesture map permanently. No data leaves the device.

### 4. Mood-Responsive Environment (on-device heuristic)
Hand velocity and movement variance over the last 30 frames determines a mood state (calm vs high-energy). Scene atmosphere — lighting temperature, object glow intensity, background depth — smoothly shifts to match.

### 5. AI Object Personality (Claude API)
Each spawned object gets a unique behavior profile from Claude: drift direction, rotation style, proximity reaction, glow pulse. Objects feel alive and distinct. API responses are cached per type + mood combination.

---

## Development Roadmap

| Phase | Focus | Done When |
|---|---|---|
| 1 — Setup | Next.js + R3F + basic scene | Spinning cube in browser |
| 2 — Webcam | Camera access + all error states | Stream live, errors handled |
| 3 — Hand tracking | MediaPipe in Web Worker + overlay | Skeleton renders at 30fps+ |
| 4 — Gestures | Recognition + debounce + hint UI | All 7 gestures stable |
| 5 — Spawning | Objects appear at hand position | Gestures spawn correct shapes |
| 6 — Interaction | Grab, move, release, throw | Full interaction loop works |
| 7 — Physics | Rapier gravity + collisions | Objects fall, bounce, collide |
| 8 — Polish | Bloom, easing, glow, performance | 60fps, feels premium |
| 9 — AI layer | Claude API + TF.js integrations | All 5 AI features working |

---

## MVP Definition

The minimum slice that proves the core concept:

| Feature | In MVP |
|---|---|
| Webcam access + all error states | Yes |
| MediaPipe hand tracking in Web Worker | Yes |
| Hand skeleton overlay | Yes |
| 7 gesture types with debounce | Yes |
| Spawn cube (two fingers) | Yes |
| Spawn sphere (one finger) | Yes |
| Grab object (fist) | Yes |
| Release / throw (open palm) | Yes |
| Coordinate mapper (2D → 3D) | Yes |
| Velocity-based throw | Yes |
| Basic dark scene (no bloom) | Yes |
| Scene clear (both fists) | Yes |
| Rapier physics | Phase 7 only |
| Bloom / postprocessing | Phase 8 only |
| AI integrations | Phase 9 only |
| Audio | Optional |

---

## Assets

### Fonts
- **Space Grotesk** — primary UI font (loaded via `next/font/google`)
- **Inter** — fallback body text

### Icons
- All inline SVG — camera icon, gesture hand silhouettes
- No icon library dependency

### 3D Objects
All procedural — zero downloaded models:

| Shape | Three.js Geometry |
|---|---|
| Cube | `BoxGeometry` |
| Sphere | `SphereGeometry` |
| Torus | `TorusGeometry` |
| Pyramid | `ConeGeometry` (4 segments) |

Materials: `MeshStandardMaterial` with emissive glow per shape type.

### Lighting
- Ambient light (low intensity, dark scene)
- Point light following grabbed object
- Optional HDRI via `@react-three/drei` `<Environment preset="night" />`

### Environment
- Background: `#0a0a0f`
- Optional floor grid: `Three.GridHelper`
- No textures, no skybox, no downloaded environment maps

### Audio (optional)
All generated via Web Audio API — no audio files required:
- Spawn sound — short synth pop (~0.3s)
- Grab sound — soft click
- Release — whoosh

---

## Key Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| MediaPipe threading | Web Worker + OffscreenCanvas | Prevents main thread jank |
| Physics in MVP | No — velocity math only | Rapier is too heavy for MVP scope |
| Gesture debounce | 200ms hold + 600ms cooldown | Eliminates false triggers reliably |
| Coordinate mapping | Dedicated utility only | Single source of truth for 2D→3D |
| Object cap | Hard limit at 15 | Maintains performance on mid-range hardware |
| API key exposure | Server-side only (API routes) | Never exposed to client |
| Custom gesture training | TF.js on-device | No data leaves browser, zero latency |

---

## Known Risks

| Risk | Mitigation |
|---|---|
| MediaPipe + R3F thread contention | MediaPipe runs in Web Worker |
| Gesture fires repeatedly | 200ms stability + 600ms cooldown |
| Webcam silent failure | Explicit error UI for every failure mode |
| MediaPipe WASM load failure | Loading state + error screen + retry |
| 2D→3D coordinate mismatch | Dedicated coordinateMapper.ts |
| Scene performance degrades | Hard 15-object cap, auto-remove oldest |
| Mobile unusable | Desktop-only guard on entry screen |
| API key exposed | All Claude calls proxied through API routes |

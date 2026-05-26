import type { GestureType } from "@/types/gesture.types";

type MachineState = "idle" | "entering" | "active" | "cooldown";

type GestureConfig = {
  enter: number;
  exit: number;
  stableFrames: number;
  cooldownMs: number;
};

const DEFAULT_CONFIG: GestureConfig = {
  enter: 0.68,
  exit: 0.48,
  stableFrames: 3,
  cooldownMs: 240,
};

const CONFIG_BY_GESTURE: Partial<Record<GestureType, GestureConfig>> = {
  fist: { enter: 0.66, exit: 0.46, stableFrames: 2, cooldownMs: 220 },
  pinch: { enter: 0.7, exit: 0.52, stableFrames: 3, cooldownMs: 260 },
  "open-palm": { enter: 0.7, exit: 0.5, stableFrames: 3, cooldownMs: 220 },
  "thumbs-up": { enter: 0.72, exit: 0.52, stableFrames: 4, cooldownMs: 320 },
  "one-finger": { enter: 0.68, exit: 0.48, stableFrames: 3, cooldownMs: 260 },
  "two-fingers": { enter: 0.68, exit: 0.48, stableFrames: 3, cooldownMs: 260 },
  "three-fingers": { enter: 0.7, exit: 0.5, stableFrames: 3, cooldownMs: 280 },
};

function configFor(gesture: GestureType | null): GestureConfig {
  if (!gesture || gesture === "none" || gesture === "both-fists") return DEFAULT_CONFIG;
  return CONFIG_BY_GESTURE[gesture] ?? DEFAULT_CONFIG;
}

export class GestureMachine {
  private state: MachineState = "idle";
  private candidate: GestureType | null = null;
  private stableFrames = 0;
  private exitFrames = 0;
  private cooldownElapsed = 0;

  update(rawGesture: GestureType | null, confidence: number, dtMs: number): GestureType | null {
    switch (this.state) {
      case "idle": {
        const config = configFor(rawGesture);
        if (rawGesture && confidence >= config.enter) {
          this.candidate = rawGesture;
          this.stableFrames = 1;
          this.exitFrames = 0;
          this.state = "entering";
        }
        return null;
      }

      case "entering": {
        const config = configFor(this.candidate);
        if (rawGesture === this.candidate && confidence >= config.enter) {
          this.stableFrames++;
          if (this.stableFrames >= config.stableFrames) {
            this.state = "active";
            this.exitFrames = 0;
            return this.candidate;
          }
          return null;
        }

        const nextConfig = configFor(rawGesture);
        if (rawGesture && confidence >= nextConfig.enter) {
          this.candidate = rawGesture;
          this.stableFrames = 1;
          this.exitFrames = 0;
          return null;
        }

        this.reset();
        return null;
      }

      case "active": {
        const config = configFor(this.candidate);
        if (rawGesture === this.candidate && confidence >= config.exit) {
          this.exitFrames = 0;
          return null;
        }

        this.exitFrames++;
        if (this.exitFrames >= 2) {
          this.state = "cooldown";
          this.cooldownElapsed = 0;
        }
        return null;
      }

      case "cooldown": {
        const config = configFor(this.candidate);
        this.cooldownElapsed += dtMs;
        if (this.cooldownElapsed >= config.cooldownMs) {
          this.state = "idle";
          this.candidate = null;
          this.stableFrames = 0;
          this.exitFrames = 0;
        }
        return null;
      }
    }
  }

  getCandidate(): GestureType | null {
    return this.candidate;
  }

  getState(): MachineState {
    return this.state;
  }

  isActive() {
    return this.state === "active";
  }

  reset() {
    this.state = "idle";
    this.candidate = null;
    this.stableFrames = 0;
    this.exitFrames = 0;
    this.cooldownElapsed = 0;
  }
}

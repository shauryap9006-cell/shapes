import type { TrackedHand } from "./mediapipe.types";

export type GestureType =
  | "one-finger"
  | "two-fingers"
  | "three-fingers"
  | "fist"
  | "open-palm"
  | "pinch"
  | "thumbs-up"
  | "both-fists"
  | "none";

export type GestureDetection = {
  gesture: GestureType | null;
  confidence: number;
  primaryHand: TrackedHand | null;
};

export type GestureAction = {
  gesture: GestureType;
  timestamp: number;
};

export type DebugGestureScore = {
  gesture: string;
  score: number;
};

export type HandDebugMetrics = {
  slot: number;
  state: string;
  gesture: GestureType | null;
  confidence: number;
  palmScale: number;
  pinchNorm: number;
  scores: DebugGestureScore[];
};

export type TrackingDebugMetrics = {
  publishFps: number;
  inferenceFps: number;
  inferenceMs: number;
  droppedFrames: number;
  activeHands: number;
  gesture: GestureType | null;
  confidence: number;
  hands: HandDebugMetrics[];
  tuning: {
    pinchCloseStart: number;
    pinchCloseEnd: number;
    fistFoldMultiplier: number;
  };
};

export type CalibrationPhase = "idle" | "open-palm" | "fist" | "pinch" | "done";

export type CalibrationStatus = {
  active: boolean;
  phase: CalibrationPhase;
  progress: number;
  message: string;
};

import { create } from "zustand";
import type { CalibrationStatus, GestureType, TrackingDebugMetrics } from "@/types/gesture.types";
import type { TrackedHand } from "@/types/mediapipe.types";
import type { VectorTuple } from "@/types/scene.types";

type GestureState = {
  currentGesture: GestureType | null;
  confidence: number;
  handPosition: VectorTuple | null;
  bothHandsVisible: boolean;
  hands: TrackedHand[];
  lastActionAt: number;
  debugMetrics: TrackingDebugMetrics | null;
  calibration: CalibrationStatus;
  // Gesture info (updated at ~30fps when worker result arrives)
  setGesture: (
    gesture: GestureType | null,
    confidence: number,
    position: VectorTuple | null,
  ) => void;
  // Hand positions (updated at 60fps by Kalman prediction loop)
  // Deliberately separate from setGesture so the 60fps update doesn't
  // trigger gesture-detection re-runs.
  updateHands: (hands: TrackedHand[]) => void;
  setDebugMetrics: (metrics: TrackingDebugMetrics) => void;
  setCalibrationStatus: (status: CalibrationStatus) => void;
  startCalibration: () => void;
  resetCalibration: () => void;
  setCalibrationHandlers: (handlers: {
    startCalibration: () => void;
    resetCalibration: () => void;
  } | null) => void;
  markAction: () => void;
};

let calibrationHandlers: {
  startCalibration: () => void;
  resetCalibration: () => void;
} | null = null;

export const useGestureStore = create<GestureState>((set) => ({
  currentGesture: null,
  confidence: 0,
  handPosition: null,
  bothHandsVisible: false,
  hands: [],
  lastActionAt: 0,
  debugMetrics: null,
  calibration: {
    active: false,
    phase: "idle",
    progress: 0,
    message: "Calibration idle.",
  },

  setGesture: (currentGesture, confidence, handPosition) =>
    set({ currentGesture, confidence, handPosition }),

  updateHands: (hands) =>
    set({ hands, bothHandsVisible: hands.length >= 2 }),

  setDebugMetrics: (debugMetrics) => set({ debugMetrics }),

  setCalibrationStatus: (calibration) => set({ calibration }),

  startCalibration: () => calibrationHandlers?.startCalibration(),

  resetCalibration: () => calibrationHandlers?.resetCalibration(),

  setCalibrationHandlers: (handlers) => {
    calibrationHandlers = handlers;
  },

  markAction: () => set({ lastActionAt: performance.now() }),
}));

import type { TrackedHand } from "@/types/mediapipe.types";
import type { GestureType } from "@/types/gesture.types";

// Sizes and offsets (in 32-bit units / floats)
export const SAB_BUFFER_SIZE_BYTES = 1040;

export const SAB_INDEX_FRAME_ID = 0; // Int32
export const SAB_INDEX_TIMESTAMP = 1; // Float32

export const SAB_INDEX_HAND0_START = 2;
export const SAB_INDEX_HAND0_VALID = 65; // 2 + 21 * 3 = 65

export const SAB_INDEX_HAND1_START = 66;
export const SAB_INDEX_HAND1_VALID = 129; // 66 + 21 * 3 = 129

export const SAB_INDEX_GESTURE_TYPE = 130;
export const SAB_INDEX_GESTURE_CONF = 131;

const GESTURE_TO_ID: Record<Exclude<GestureType, "none">, number> = {
  "one-finger": 1,
  "two-fingers": 2,
  "three-fingers": 3,
  "fist": 4,
  "open-palm": 5,
  "pinch": 6,
  "thumbs-up": 7,
  "both-fists": 8,
};

const ID_TO_GESTURE: Record<number, GestureType> = {
  1: "one-finger",
  2: "two-fingers",
  3: "three-fingers",
  4: "fist",
  5: "open-palm",
  6: "pinch",
  7: "thumbs-up",
  8: "both-fists",
};

export function gestureToId(gesture: GestureType | null): number {
  if (!gesture || gesture === "none") return 0;
  return GESTURE_TO_ID[gesture] ?? 0;
}

export function idToGesture(id: number): GestureType | null {
  if (id === 0) return null;
  return ID_TO_GESTURE[id] ?? null;
}

export function writeHandToBuffer(f32: Float32Array, hand: TrackedHand | null, startIndex: number, validIndex: number) {
  if (!hand) {
    f32[validIndex] = 0;
    return;
  }

  f32[validIndex] = 1; // Mark valid
  // Optional: write handedness id if needed, but app only uses "hands" array.
  // We'll write the landmarks
  let offset = startIndex;
  for (let i = 0; i < 21; i++) {
    const lm = hand.landmarks[i];
    if (lm) {
      f32[offset++] = lm.x;
      f32[offset++] = lm.y;
      f32[offset++] = lm.z;
    } else {
      f32[offset++] = 0;
      f32[offset++] = 0;
      f32[offset++] = 0;
    }
  }
}

export function readHandFromBuffer(f32: Float32Array, startIndex: number, validIndex: number, handednessLabel: string): TrackedHand | null {
  if (f32[validIndex] === 0) return null;

  const landmarks = new Array(21);
  let offset = startIndex;
  for (let i = 0; i < 21; i++) {
    landmarks[i] = {
      x: f32[offset++],
      y: f32[offset++],
      z: f32[offset++],
    };
  }

  return {
    id: handednessLabel,
    handedness: handednessLabel as any,
    landmarks,
  };
}

export function readHands(f32: Float32Array): TrackedHand[] {
  const hands: TrackedHand[] = [];
  const h0 = readHandFromBuffer(f32, SAB_INDEX_HAND0_START, SAB_INDEX_HAND0_VALID, "Hand0");
  if (h0) hands.push(h0);
  const h1 = readHandFromBuffer(f32, SAB_INDEX_HAND1_START, SAB_INDEX_HAND1_VALID, "Hand1");
  if (h1) hands.push(h1);
  return hands;
}

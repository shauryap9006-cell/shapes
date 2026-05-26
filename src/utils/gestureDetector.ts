import type { GestureDetection } from "@/types/gesture.types";
import type { HandLandmark, TrackedHand } from "@/types/mediapipe.types";

const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 } as const;
const MCP = { index: 5, middle: 9, ring: 13, pinky: 17 } as const;
const PIP = { index: 6, middle: 10, ring: 14, pinky: 18 } as const;
const DIP = { index: 7, middle: 11, ring: 15, pinky: 19 } as const;

function dist3d(a: HandLandmark, b: HandLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function angleDeg(a: HandLandmark, b: HandLandmark, c: HandLandmark) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const abLen = Math.hypot(ab.x, ab.y, ab.z);
  const cbLen = Math.hypot(cb.x, cb.y, cb.z);
  if (abLen < 0.0001 || cbLen < 0.0001) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (abLen * cbLen)))) * 180 / Math.PI;
}

function palmScale(lm: HandLandmark[]) {
  return Math.max(
    dist3d(lm[0], lm[MCP.middle]),
    dist3d(lm[MCP.index], lm[MCP.pinky]),
    dist3d(lm[MCP.index], lm[MCP.middle]),
    0.06,
  );
}

function fingerPose(lm: HandLandmark[], finger: keyof typeof MCP, scale: number) {
  const pipAngle = angleDeg(lm[MCP[finger]], lm[PIP[finger]], lm[DIP[finger]]);
  const dipAngle = angleDeg(lm[PIP[finger]], lm[DIP[finger]], lm[TIP[finger]]);
  const reach = dist3d(lm[TIP[finger]], lm[0]) / (dist3d(lm[MCP[finger]], lm[0]) + 0.001);
  const tipToMcp = dist3d(lm[TIP[finger]], lm[MCP[finger]]) / scale;

  const angleExtended = 0.72 * smoothstep(145, 172, pipAngle) + 0.28 * smoothstep(145, 170, dipAngle);
  const reachExtended = smoothstep(1.08, 1.42, reach);
  const foldedByAngle = 1 - smoothstep(112, 148, pipAngle);
  const foldedByClose = 1 - smoothstep(0.62, 1.15, tipToMcp);

  return {
    extended: clamp01(0.68 * angleExtended + 0.32 * reachExtended),
    folded: clamp01(0.72 * foldedByAngle + 0.28 * foldedByClose),
  };
}

function thumbPose(lm: HandLandmark[], scale: number) {
  const reach = dist3d(lm[TIP.thumb], lm[0]) / scale;
  const thumbAngle = angleDeg(lm[2], lm[3], lm[4]);
  const thumbToPalm = Math.min(
    dist3d(lm[TIP.thumb], lm[PIP.index]),
    dist3d(lm[TIP.thumb], lm[PIP.middle]),
  ) / scale;

  return {
    extended: clamp01(0.55 * smoothstep(0.72, 1.16, reach) + 0.45 * smoothstep(145, 172, thumbAngle)),
    folded: clamp01(1 - smoothstep(0.38, 0.72, thumbToPalm)),
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function product(values: number[]) {
  return values.reduce((score, value) => score * clamp01(value), 1);
}

const PRIORITY = {
  fist: 95,
  pinch: 85,
  "thumbs-up": 75,
  "open-palm": 65,
  "three-fingers": 55,
  "two-fingers": 45,
  "one-finger": 35,
} as const;

type SingleHandGesture = keyof typeof PRIORITY;

export type GestureCandidate = {
  gesture: SingleHandGesture;
  score: number;
  priority: number;
};

export type GestureTuning = {
  pinchCloseStart: number;
  pinchCloseEnd: number;
  fistPinchSuppressStart: number;
  fistPinchSuppressEnd: number;
  fistFoldMultiplier: number;
};

export type GestureFeatures = {
  palmScale: number;
  pinchNorm: number;
  pinchClosure: number;
  allFourExtended: number;
  allFourFolded: number;
  thumbOverFingers: number;
};

export type GestureAnalysis = {
  detection: GestureDetection;
  candidates: GestureCandidate[];
  features: GestureFeatures | null;
};

export const DEFAULT_GESTURE_TUNING: GestureTuning = {
  pinchCloseStart: 0.24,
  pinchCloseEnd: 0.43,
  fistPinchSuppressStart: 0.55,
  fistPinchSuppressEnd: 0.85,
  fistFoldMultiplier: 1,
};

function buildCandidates(lm: HandLandmark[], tuning: GestureTuning): { candidates: GestureCandidate[]; features: GestureFeatures } {
  const scale = palmScale(lm);
  const fingers = {
    index: fingerPose(lm, "index", scale),
    middle: fingerPose(lm, "middle", scale),
    ring: fingerPose(lm, "ring", scale),
    pinky: fingerPose(lm, "pinky", scale),
  };
  const thumb = thumbPose(lm, scale);

  const extended = [fingers.index.extended, fingers.middle.extended, fingers.ring.extended, fingers.pinky.extended];
  const folded = [fingers.index.folded, fingers.middle.folded, fingers.ring.folded, fingers.pinky.folded];
  const pinchNorm = dist3d(lm[TIP.thumb], lm[TIP.index]) / scale;
  const pinchClosure = 1 - smoothstep(tuning.pinchCloseStart, tuning.pinchCloseEnd, pinchNorm);
  const thumbOverFingers = 1 - smoothstep(
    0.38,
    0.72,
    Math.min(dist3d(lm[TIP.thumb], lm[PIP.index]), dist3d(lm[TIP.thumb], lm[PIP.middle])) / scale,
  );
  const nonPinchFingerOpen = average([fingers.middle.extended, fingers.ring.extended, fingers.pinky.extended]);
  const allFourExtended = Math.min(...extended);
  const allFourFolded = clamp01(Math.min(...folded) * tuning.fistFoldMultiplier);
  const features: GestureFeatures = {
    palmScale: scale,
    pinchNorm,
    pinchClosure,
    allFourExtended,
    allFourFolded,
    thumbOverFingers,
  };

  const scores: Record<SingleHandGesture, number> = {
    fist: product([
      allFourFolded,
      Math.max(thumb.folded, thumbOverFingers),
      1 - smoothstep(tuning.fistPinchSuppressStart, tuning.fistPinchSuppressEnd, pinchClosure),
    ]),
    pinch: product([
      pinchClosure,
      Math.max(fingers.index.folded, 1 - fingers.index.extended),
      1 - smoothstep(0.78, 0.94, allFourExtended),
      1 - smoothstep(0.76, 0.94, allFourFolded),
    ]),
    "thumbs-up": product([
      allFourFolded,
      thumb.extended,
      1 - thumbOverFingers * 0.75,
    ]),
    "open-palm": product([
      allFourExtended,
      Math.max(0.45, thumb.extended),
      1 - pinchClosure * 0.85,
    ]),
    "one-finger": product([
      fingers.index.extended,
      fingers.middle.folded,
      fingers.ring.folded,
      fingers.pinky.folded,
      1 - pinchClosure * 0.75,
    ]),
    "two-fingers": product([
      fingers.index.extended,
      fingers.middle.extended,
      fingers.ring.folded,
      fingers.pinky.folded,
      1 - pinchClosure * 0.65,
    ]),
    "three-fingers": product([
      fingers.index.extended,
      fingers.middle.extended,
      fingers.ring.extended,
      fingers.pinky.folded,
      1 - pinchClosure * 0.55,
      1 - smoothstep(0.86, 0.98, nonPinchFingerOpen),
    ]),
  };

  return {
    candidates: (Object.keys(scores) as SingleHandGesture[]).map((gesture) => ({
      gesture,
      score: clamp01(scores[gesture]),
      priority: PRIORITY[gesture],
    })),
    features,
  };
}

export function analyzeSingleHand(
  hand: TrackedHand,
  tuning: GestureTuning = DEFAULT_GESTURE_TUNING,
): GestureAnalysis {
  if (hand.landmarks.length < 21) {
    return {
      detection: { gesture: null, confidence: 0, primaryHand: hand },
      candidates: [],
      features: null,
    };
  }

  const { candidates: allCandidates, features } = buildCandidates(hand.landmarks, tuning);
  const candidates = allCandidates
    .filter((candidate) => candidate.score >= 0.35)
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (Math.abs(scoreDelta) > 0.035) return scoreDelta;
      return b.priority - a.priority;
    });

  const best = candidates[0];
  if (!best || best.score < 0.62) {
    return {
      detection: { gesture: null, confidence: best?.score ?? 0, primaryHand: hand },
      candidates: allCandidates.sort((a, b) => b.score - a.score).slice(0, 2),
      features,
    };
  }

  const runnerUp = candidates[1];
  const dominanceGap = best.score - (runnerUp?.score ?? 0);
  if (runnerUp && runnerUp.score > 0.52 && dominanceGap < 0.075) {
    return {
      detection: { gesture: null, confidence: best.score * 0.72, primaryHand: hand },
      candidates: allCandidates.sort((a, b) => b.score - a.score).slice(0, 2),
      features,
    };
  }

  return {
    detection: {
      gesture: best.gesture,
      confidence: clamp01(best.score * (0.9 + Math.min(0.12, dominanceGap))),
      primaryHand: hand,
    },
    candidates: allCandidates.sort((a, b) => b.score - a.score).slice(0, 2),
    features,
  };
}

export function detectSingleHand(hand: TrackedHand, tuning: GestureTuning = DEFAULT_GESTURE_TUNING): GestureDetection {
  return analyzeSingleHand(hand, tuning).detection;
}

export function detectGesture(hands: TrackedHand[]): GestureDetection {
  if (hands.length === 0) return { gesture: null, confidence: 0, primaryHand: null };

  const detections = hands.map((hand) => detectSingleHand(hand));

  const fists = detections.filter((d) => d.gesture === "fist");
  if (fists.length >= 2) {
    return {
      gesture: "both-fists",
      confidence: Math.min(...fists.map((d) => d.confidence)),
      primaryHand: fists[0].primaryHand,
    };
  }

  return detections.sort((a, b) => b.confidence - a.confidence)[0];
}

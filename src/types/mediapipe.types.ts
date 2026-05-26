export type Handedness = "Left" | "Right" | "Unknown";

export type HandLandmark = {
  x: number;
  y: number;
  z: number;
};

export type TrackedHand = {
  id: string;
  handedness: Handedness;
  landmarks: HandLandmark[];
};

export type HandTrackingResult = {
  hands: TrackedHand[];
  timestamp: number;
};

export type HandTrackingWorkerRequest =
  | { type: "init" }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number }
  | { type: "stop" };

export type HandTrackingWorkerResponse =
  | { type: "ready" }
  | { type: "result"; payload: HandTrackingResult }
  | { type: "error"; message: string };

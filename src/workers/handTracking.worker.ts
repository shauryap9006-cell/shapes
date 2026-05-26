import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createHandFilters, applyOneEuroFilter } from '../utils/oneEuroFilter';
import { applyDeadZone } from '../utils/landmarkStabilizer';
import { HandKalmanSet } from '../utils/kalmanFilter';
import {
  DEFAULT_GESTURE_TUNING,
  analyzeSingleHand,
  type GestureAnalysis,
  type GestureTuning
} from '../utils/gestureDetector';
import { GestureMachine } from '../utils/gestureStateMachine';
import {
  SAB_INDEX_FRAME_ID,
  SAB_INDEX_TIMESTAMP,
  SAB_INDEX_HAND0_START,
  SAB_INDEX_HAND0_VALID,
  SAB_INDEX_HAND1_START,
  SAB_INDEX_HAND1_VALID,
  SAB_INDEX_GESTURE_TYPE,
  SAB_INDEX_GESTURE_CONF,
  gestureToId,
  writeHandToBuffer
} from '../utils/sabSchema';
import type { TrackedHand } from '../types/mediapipe.types';
import type { CalibrationPhase, GestureDetection, GestureType, TrackingDebugMetrics } from '../types/gesture.types';

let handLandmarker: HandLandmarker | null = null;
let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let processing = false;

let sabView: { int32: Int32Array; float32: Float32Array } | null = null;
let kalmanSets = [new HandKalmanSet(), new HandKalmanSet()];
let lastZ: number[][] = [[], []];
let gestureMachines = [new GestureMachine(), new GestureMachine()];
let lastGestureDetections: GestureDetection[] = [
  { gesture: null, confidence: 0, primaryHand: null },
  { gesture: null, confidence: 0, primaryHand: null },
];
let lastGestureUpdate = [0, 0];
let lastAnalyses: (GestureAnalysis | null)[] = [null, null];
let missedFrames = [0, 0];
let lastWrist: ({ x: number; y: number; z: number } | null)[] = [null, null];
let gestureTuning: GestureTuning = { ...DEFAULT_GESTURE_TUNING };
let loopInterval: number | null = null;
let lastLoopTime = performance.now();
let frameCount = 0;
let lastMessageTs = performance.now();
let watchdogInterval: number | null = null;
let droppedFrames = 0;
let inferenceFrames = 0;
let publishFrames = 0;
let inferenceMsAvg = 0;
let lastMetricsTs = performance.now();
let lastMetricsInferenceFrames = 0;
let lastMetricsPublishFrames = 0;
let lastPublishGesture: GestureType | null = null;
let lastPublishConfidence = 0;

type CalibrationCollectPhase = 'open-palm' | 'fist' | 'pinch';
const CALIBRATION_PHASES: CalibrationCollectPhase[] = ['open-palm', 'fist', 'pinch'];
const CALIBRATION_SAMPLES_PER_PHASE = 36;
const calibrationSamples: Record<CalibrationCollectPhase, number[]> = {
  'open-palm': [],
  fist: [],
  pinch: [],
};
let calibrationPhaseIndex = -1;

const filterSlots = [createHandFilters(), createHandFilters()];
const previousLandmarks: (Array<{ x: number; y: number; z: number }> | null)[] = [null, null];
const slotHandedness: (string | null)[] = [null, null];

function wristDistance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.5);
}

function getSlotForHand(label: string, landmarks: Array<{ x: number; y: number; z: number }>, activeSlots: Set<number>): number {
  const wrist = landmarks[0];
  let preferred = label === 'Left' ? 0 : label === 'Right' ? 1 : -1;

  if (preferred >= 0 && !activeSlots.has(preferred)) {
    const other = preferred === 0 ? 1 : 0;
    const preferredWrist = lastWrist[preferred];
    const otherWrist = lastWrist[other];
    if (!preferredWrist || !otherWrist || wristDistance(wrist, preferredWrist) <= wristDistance(wrist, otherWrist) + 0.08) {
      return preferred;
    }
  }

  let bestSlot = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 2; i++) {
    const previousWrist = lastWrist[i];
    if (activeSlots.has(i) || !previousWrist) continue;
    const distance = wristDistance(wrist, previousWrist);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlot = i;
    }
  }

  if (bestSlot >= 0 && bestDistance < 0.22) return bestSlot;
  if (preferred >= 0 && !activeSlots.has(preferred)) return preferred;
  return activeSlots.has(0) ? 1 : 0;
}

function resetSlot(slotIndex: number) {
  filterSlots[slotIndex]       = createHandFilters();
  previousLandmarks[slotIndex] = null;
  slotHandedness[slotIndex]    = null;
  kalmanSets[slotIndex].reset();
  lastZ[slotIndex]             = [];
  gestureMachines[slotIndex].reset();
  lastGestureDetections[slotIndex] = { gesture: null, confidence: 0, primaryHand: null };
  lastGestureUpdate[slotIndex] = 0;
  lastAnalyses[slotIndex] = null;
  missedFrames[slotIndex] = 0;
  lastWrist[slotIndex] = null;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function calibrationStatus(message?: string) {
  const phase = calibrationPhaseIndex >= 0 && calibrationPhaseIndex < CALIBRATION_PHASES.length
    ? CALIBRATION_PHASES[calibrationPhaseIndex]
    : calibrationPhaseIndex >= CALIBRATION_PHASES.length ? 'done' : 'idle';
  const sampleCount = phase === 'open-palm' || phase === 'fist' || phase === 'pinch'
    ? calibrationSamples[phase].length
    : 0;

  self.postMessage({
    type: 'calibration-status',
    payload: {
      active: calibrationPhaseIndex >= 0 && calibrationPhaseIndex < CALIBRATION_PHASES.length,
      phase,
      progress: phase === 'done' ? 1 : Math.min(1, sampleCount / CALIBRATION_SAMPLES_PER_PHASE),
      message: message ?? (
        phase === 'open-palm' ? 'Hold an open palm steady.'
        : phase === 'fist' ? 'Hold a closed fist steady.'
        : phase === 'pinch' ? 'Hold a pinch steady.'
        : phase === 'done' ? 'Calibration applied.'
        : 'Calibration idle.'
      ),
    },
  });
}

function startCalibration() {
  calibrationSamples['open-palm'] = [];
  calibrationSamples.fist = [];
  calibrationSamples.pinch = [];
  calibrationPhaseIndex = 0;
  gestureTuning = { ...DEFAULT_GESTURE_TUNING };
  calibrationStatus();
}

function finishCalibration() {
  const openPinchNorm = median(calibrationSamples['open-palm']);
  const fistFold = median(calibrationSamples.fist);
  const pinchNorm = median(calibrationSamples.pinch);
  const pinchCloseStart = clamp(pinchNorm * 1.25, 0.14, 0.32);
  const pinchCloseEnd = clamp(
    Math.max(pinchCloseStart + 0.1, Math.min(openPinchNorm * 0.65, pinchNorm * 2.35)),
    pinchCloseStart + 0.08,
    0.55
  );

  gestureTuning = {
    ...DEFAULT_GESTURE_TUNING,
    pinchCloseStart,
    pinchCloseEnd,
    fistFoldMultiplier: clamp(0.78 / Math.max(0.48, fistFold), 0.88, 1.22),
  };

  calibrationPhaseIndex = CALIBRATION_PHASES.length;
  calibrationStatus();
}

function collectCalibrationSample(analysis: GestureAnalysis) {
  if (calibrationPhaseIndex < 0 || calibrationPhaseIndex >= CALIBRATION_PHASES.length || !analysis.features) return;

  const phase = CALIBRATION_PHASES[calibrationPhaseIndex];
  const { detection, features } = analysis;
  if (phase === 'open-palm' && (detection.gesture === 'open-palm' || features.allFourExtended > 0.68)) {
    calibrationSamples[phase].push(features.pinchNorm);
  }
  if (phase === 'fist' && (detection.gesture === 'fist' || features.allFourFolded > 0.58)) {
    calibrationSamples[phase].push(features.allFourFolded);
  }
  if (phase === 'pinch' && (detection.gesture === 'pinch' || features.pinchClosure > 0.58)) {
    calibrationSamples[phase].push(features.pinchNorm);
  }

  if (calibrationSamples[phase].length >= CALIBRATION_SAMPLES_PER_PHASE) {
    calibrationPhaseIndex++;
    if (calibrationPhaseIndex >= CALIBRATION_PHASES.length) finishCalibration();
    else calibrationStatus();
  } else if (calibrationSamples[phase].length % 6 === 0) {
    calibrationStatus();
  }
}

function publishMetrics(force = false) {
  const now = performance.now();
  const elapsed = now - lastMetricsTs;
  if (!force && elapsed < 250) return;

  const seconds = Math.max(0.001, elapsed / 1000);
  const metrics: TrackingDebugMetrics = {
    publishFps: (publishFrames - lastMetricsPublishFrames) / seconds,
    inferenceFps: (inferenceFrames - lastMetricsInferenceFrames) / seconds,
    inferenceMs: inferenceMsAvg,
    droppedFrames,
    activeHands: slotHandedness.filter(Boolean).length,
    gesture: lastPublishGesture,
    confidence: lastPublishConfidence,
    hands: lastAnalyses.map((analysis, slot) => ({
      slot,
      state: gestureMachines[slot].getState(),
      gesture: gestureMachines[slot].getCandidate(),
      confidence: lastGestureDetections[slot].confidence,
      palmScale: analysis?.features?.palmScale ?? 0,
      pinchNorm: analysis?.features?.pinchNorm ?? 0,
      scores: (analysis?.candidates ?? []).map((candidate) => ({
        gesture: candidate.gesture,
        score: candidate.score,
      })),
    })),
    tuning: {
      pinchCloseStart: gestureTuning.pinchCloseStart,
      pinchCloseEnd: gestureTuning.pinchCloseEnd,
      fistFoldMultiplier: gestureTuning.fistFoldMultiplier,
    },
  };

  lastMetricsTs = now;
  lastMetricsPublishFrames = publishFrames;
  lastMetricsInferenceFrames = inferenceFrames;
  self.postMessage({ type: 'debug-metrics', payload: metrics });
}

function applyFiltersToHand(
  landmarks: Array<{ x: number; y: number; z: number }>,
  slotIndex: number,
  timestamp: number,
) {
  const ts       = timestamp / 1000;
  const filtered   = applyOneEuroFilter(landmarks, filterSlots[slotIndex], ts);
  const stabilised = applyDeadZone(filtered, previousLandmarks[slotIndex] ?? undefined);
  previousLandmarks[slotIndex] = stabilised;
  return stabilised;
}

function predictionLoop() {
  if (!sabView) return;
  const now = performance.now();
  const dt = Math.min((now - lastLoopTime) / 1000, 0.05); // cap at 50ms
  lastLoopTime = now;
  
  const predictedHands: TrackedHand[] = [];
  
  for (let i = 0; i < 2; i++) {
    const ks = kalmanSets[i];
    const label = slotHandedness[i];
    if (ks.isReady() && label) {
       const predicted = ks.predict(dt, lastZ[i]);
       predictedHands.push({
         id: label,
         handedness: label as any,
         landmarks: predicted
       });
    }
  }

  const perHandGestures = [];
  for (let i = 0; i < 2; i++) {
     const label = slotHandedness[i];
     const hand = predictedHands.find(h => h.id === label);
     if (hand && gestureMachines[i].isActive()) {
        const det = lastGestureDetections[i];
        perHandGestures.push({
          gesture: gestureMachines[i].getCandidate(),
          confidence: det.confidence,
          hand,
        });
     } else {
        if (!hand) gestureMachines[i].reset();
     }
  }

  let activeGesture: GestureType | null = null;
  let activeConfidence = 0;

  if (perHandGestures.length === 2 && perHandGestures[0].gesture === 'fist' && perHandGestures[1].gesture === 'fist') {
     activeGesture = 'both-fists';
     activeConfidence = Math.min(perHandGestures[0].confidence, perHandGestures[1].confidence);
  } else if (perHandGestures.length > 0) {
     perHandGestures.sort((a, b) => b.confidence - a.confidence);
     activeGesture = perHandGestures[0].gesture;
     activeConfidence = perHandGestures[0].confidence;
  }

  // Write to SAB
  sabView.float32[SAB_INDEX_TIMESTAMP] = now;
  writeHandToBuffer(sabView.float32, predictedHands[0] ?? null, SAB_INDEX_HAND0_START, SAB_INDEX_HAND0_VALID);
  writeHandToBuffer(sabView.float32, predictedHands[1] ?? null, SAB_INDEX_HAND1_START, SAB_INDEX_HAND1_VALID);
  
  sabView.float32[SAB_INDEX_GESTURE_TYPE] = gestureToId(activeGesture);
  sabView.float32[SAB_INDEX_GESTURE_CONF] = activeConfidence;

  frameCount++;
  publishFrames++;
  lastPublishGesture = activeGesture;
  lastPublishConfidence = activeConfidence;
  Atomics.store(sabView.int32, SAB_INDEX_FRAME_ID, frameCount);
  Atomics.notify(sabView.int32, SAB_INDEX_FRAME_ID, 1);
  publishMetrics();
}

async function init(origin: string, sab: SharedArrayBuffer) {
  if (handLandmarker) { self.postMessage({ type: 'ready' }); return; }
  try {
    sabView = {
      int32: new Int32Array(sab),
      float32: new Float32Array(sab)
    };

    const assetRoot = `${origin}/mediapipe/tasks`;
    const vision = await FilesetResolver.forVisionTasks(`${assetRoot}/wasm`);
    
    const modelResponse = await fetch(`${assetRoot}/hand_landmarker.task?v=${Date.now()}`);
    if (!modelResponse.ok) {
      throw new Error(`Failed to download model: ${modelResponse.status} ${modelResponse.statusText}`);
    }
    const modelBuffer = await modelResponse.arrayBuffer();

    const createLandmarker = (delegate: 'GPU' | 'CPU') => HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetBuffer: new Uint8Array(modelBuffer),
        delegate,
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    try {
      handLandmarker = await createLandmarker('GPU');
    } catch {
      handLandmarker = await createLandmarker('CPU');
    }
    
    // Start 60Hz loop
    loopInterval = self.setInterval(predictionLoop, 16);
    
    // Start Watchdog
    watchdogInterval = self.setInterval(() => {
      if (performance.now() - lastMessageTs > 1000) {
         self.postMessage({ type: 'heartbeat', alive: false });
      }
    }, 500);

    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to init MediaPipe',
    });
  }
}

async function processFrame(bitmap: ImageBitmap, timestamp: number) {
  lastMessageTs = performance.now();
  if (!handLandmarker || processing) {
    droppedFrames++;
    bitmap.close();
    self.postMessage({ type: 'frame-processed' });
    return;
  }
  processing = true;
  try {
    if (!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas  = new OffscreenCanvas(bitmap.width, bitmap.height);
      context = canvas.getContext('2d');
    }
    if (!context) {
      bitmap.close();
      throw new Error('OffscreenCanvas context unavailable.');
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const inferenceStart = performance.now();
    const results      = handLandmarker.detectForVideo(canvas, timestamp);
    const inferenceMs = performance.now() - inferenceStart;
    inferenceMsAvg = inferenceMsAvg === 0 ? inferenceMs : inferenceMsAvg * 0.85 + inferenceMs * 0.15;
    inferenceFrames++;
    const landmarks    = results.landmarks    || [];
    const handednesses = results.handednesses || [];
    const activeSlots  = new Set<number>();

    landmarks.forEach((hand, index) => {
      const label = handednesses[index]?.[0]?.categoryName ?? 'Unknown';
      let slot  = getSlotForHand(label, hand, activeSlots);

      // Handle collision if MediaPipe incorrectly identifies two 'Left' or two 'Right' hands
      if (activeSlots.has(slot)) {
        slot = slot === 0 ? 1 : 0;
      }

      if (slotHandedness[slot] !== null && slotHandedness[slot] !== label && missedFrames[slot] > 2) {
        resetSlot(slot);
      }
      slotHandedness[slot] = label;
      missedFrames[slot] = 0;
      lastWrist[slot] = hand[0];
      activeSlots.add(slot);

      const stabilised = applyFiltersToHand(hand, slot, timestamp);
      kalmanSets[slot].update(stabilised);
      lastZ[slot] = stabilised.map(lm => lm.z);

      const trackedHand: TrackedHand = {
        id: label,
        handedness: label as any,
        landmarks: stabilised,
      };
      const analysis = analyzeSingleHand(trackedHand, gestureTuning);
      const detection = analysis.detection;
      const dtMs = lastGestureUpdate[slot] > 0
        ? Math.max(1, timestamp - lastGestureUpdate[slot])
        : 33;
      lastGestureUpdate[slot] = timestamp;
      lastGestureDetections[slot] = detection;
      lastAnalyses[slot] = analysis;
      gestureMachines[slot].update(detection.gesture, detection.confidence, dtMs);
      collectCalibrationSample(analysis);
    });

    for (let i = 0; i < 2; i++) {
      if (!activeSlots.has(i) && slotHandedness[i] !== null) {
        missedFrames[i]++;
        if (missedFrames[i] > 3) resetSlot(i);
      }
    }

  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Hand tracking failed',
    });
  } finally {
    processing = false;
    self.postMessage({ type: 'frame-processed' });
    publishMetrics();
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, bitmap, timestamp, origin, sab } = event.data;
  if (type === 'init')  await init(origin, sab);
  if (type === 'frame') await processFrame(bitmap, timestamp);
  if (type === 'start-calibration') startCalibration();
  if (type === 'reset-calibration') {
    calibrationPhaseIndex = -1;
    gestureTuning = { ...DEFAULT_GESTURE_TUNING };
    calibrationStatus('Calibration reset.');
  }
  if (type === 'stop')  {
    handLandmarker?.close();
    handLandmarker = null;
    if (loopInterval) self.clearInterval(loopInterval);
    if (watchdogInterval) self.clearInterval(watchdogInterval);
    resetSlot(0);
    resetSlot(1);
  }
};

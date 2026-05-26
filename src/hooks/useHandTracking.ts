"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGestureStore } from "@/stores/gestureStore";
import {
  SAB_BUFFER_SIZE_BYTES,
  readHands,
  idToGesture,
  SAB_INDEX_GESTURE_TYPE,
  SAB_INDEX_GESTURE_CONF,
  SAB_INDEX_FRAME_ID
} from "@/utils/sabSchema";
import { mapLandmarkToWorld } from "@/utils/coordinateMapper";

type UseHandTrackingOptions = {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
};

declare global {
  interface HTMLVideoElement {
    requestVideoFrameCallback(callback: (now: DOMHighResTimeStamp, metadata: Record<string, unknown>) => void): number;
    cancelVideoFrameCallback(handle: number): void;
  }
}

const supportsRVFC = typeof HTMLVideoElement !== "undefined"
  && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

export function useHandTracking({ enabled, videoRef }: UseHandTrackingOptions) {
  const workerRef = useRef<Worker | null>(null);
  const frameHandleRef = useRef<number | null>(null); 
  const readerHandleRef = useRef<number | null>(null); 
  const frameInFlightRef = useRef(false);
  const fatalErrorRef = useRef(false);
  
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sabRef = useRef<SharedArrayBuffer | null>(null);
  if (!sabRef.current && typeof SharedArrayBuffer !== "undefined") {
    sabRef.current = new SharedArrayBuffer(SAB_BUFFER_SIZE_BYTES);
  }

  useEffect(() => {
    if (enabled && !sabRef.current) {
      setError("SharedArrayBuffer is unavailable. Enable cross-origin isolation or use a supported browser.");
    }
  }, [enabled]);

  const stopCaptureLoop = useCallback(() => {
    if (frameHandleRef.current === null) return;
    const video = videoRef.current;
    if (supportsRVFC && video) {
      video.cancelVideoFrameCallback(frameHandleRef.current);
    } else {
      cancelAnimationFrame(frameHandleRef.current);
    }
    frameHandleRef.current = null;
  }, [videoRef]);

  const scheduleNext = useCallback((video: HTMLVideoElement, onFrame: FrameRequestCallback) => {
    if (supportsRVFC) {
      frameHandleRef.current = video.requestVideoFrameCallback((now) => onFrame(now));
    } else {
      frameHandleRef.current = requestAnimationFrame(onFrame);
    }
  }, []);

  const queueFrame = useCallback((now?: DOMHighResTimeStamp) => {
    const worker = workerRef.current;
    const video = videoRef.current;

    if (!enabled || !ready || fatalErrorRef.current) return;
    if (!worker || !video || video.readyState < 2) {
      frameHandleRef.current = requestAnimationFrame(queueFrame);
      return;
    }

    if (!frameInFlightRef.current) {
      frameInFlightRef.current = true;
      createImageBitmap(video)
        .then((bitmap) => {
          try {
            worker.postMessage(
              { type: "frame", bitmap, timestamp: now ?? performance.now() },
              [bitmap]
            );
          } catch (err) {
            bitmap.close();
            frameInFlightRef.current = false;
            setError(err instanceof Error ? err.message : "Could not send a camera frame to the worker.");
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Could not capture a camera frame.");
          frameInFlightRef.current = false;
        });
    }

    scheduleNext(video, queueFrame);
  }, [enabled, ready, scheduleNext, videoRef]);

  // Worker init & event handling
  useEffect(() => {
    if (!enabled || !sabRef.current) return undefined;

    fatalErrorRef.current = false;

    const worker = new Worker(new URL('../workers/handTracking.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === "ready") {
        fatalErrorRef.current = false;
        setReady(true);
        setError(null);
      }

      if (message.type === "result") {
         // Not used with SAB
      }

      if (message.type === "frame-processed") {
        frameInFlightRef.current = false;
      }

      if (message.type === "debug-metrics") {
        useGestureStore.getState().setDebugMetrics(message.payload);
      }

      if (message.type === "calibration-status") {
        useGestureStore.getState().setCalibrationStatus(message.payload);
      }

      if (message.type === "error") {
        fatalErrorRef.current = true;
        frameInFlightRef.current = false;
        stopCaptureLoop();
        setError(message.message);
      }

      // Heartbeat watchdog handling
      if (message.type === "heartbeat" && message.alive === false) {
        // We could implement an auto-restart here
        setError("Worker watchdog timeout.");
        fatalErrorRef.current = true;
      }
    };

    worker.onerror = (event) => {
      fatalErrorRef.current = true;
      frameInFlightRef.current = false;
      stopCaptureLoop();
      setError(event.message || "Hand tracking worker crashed.");
    };

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    worker.postMessage({ type: "init", origin: window.location.origin + basePath, sab: sabRef.current });
    useGestureStore.getState().setCalibrationHandlers({
      startCalibration: () => worker.postMessage({ type: "start-calibration" }),
      resetCalibration: () => worker.postMessage({ type: "reset-calibration" }),
    });

    return () => {
      stopCaptureLoop();
      useGestureStore.getState().setCalibrationHandlers(null);
      worker.postMessage({ type: "stop" });
      worker.terminate();
      workerRef.current = null;
      fatalErrorRef.current = false;
      setReady(false);
    };
  }, [enabled, stopCaptureLoop]);

  // Start Capture loop
  useEffect(() => {
    if (!enabled || !ready) {
      stopCaptureLoop();
      return;
    }

    const video = videoRef.current;
    if (video) {
      scheduleNext(video, queueFrame);
    } else {
      frameHandleRef.current = requestAnimationFrame(queueFrame);
    }

    return stopCaptureLoop;
  }, [enabled, queueFrame, ready, scheduleNext, stopCaptureLoop, videoRef]);

  // Reader loop for SAB (60Hz Display Refresh)
  useEffect(() => {
    if (!enabled || !ready || !sabRef.current) return;

    const view = {
      int32: new Int32Array(sabRef.current),
      float32: new Float32Array(sabRef.current),
    };

    let lastSeenId = 0;

    function readerLoop() {
      if (!ready || !enabled) return;
      const latestId = Atomics.load(view.int32, SAB_INDEX_FRAME_ID);
      
      if (latestId !== lastSeenId) {
        lastSeenId = latestId;
        
        const hands = readHands(view.float32);
        const gestureId = view.float32[SAB_INDEX_GESTURE_TYPE];
        const conf = view.float32[SAB_INDEX_GESTURE_CONF];
        const gesture = idToGesture(gestureId);
        
        const store = useGestureStore.getState();
        store.updateHands(hands);
        
        // Calculate interaction position if hand 0 is present
        const position = hands[0]?.landmarks[8] ? mapLandmarkToWorld(hands[0].landmarks[8]) : null;
        store.setGesture(gesture, conf, position);
      }
      
      readerHandleRef.current = requestAnimationFrame(readerLoop);
    }
    
    readerHandleRef.current = requestAnimationFrame(readerLoop);
    
    return () => {
      if (readerHandleRef.current !== null) {
        cancelAnimationFrame(readerHandleRef.current);
      }
    };
  }, [enabled, ready]);

  return { ready, error };
}

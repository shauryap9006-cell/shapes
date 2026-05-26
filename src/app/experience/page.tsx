"use client";

import { useRef, useState, useEffect } from "react";
import { GestureEngine } from "@/components/gestures/GestureEngine";
import { GestureHint } from "@/components/gestures/GestureHint";
import { DebugOverlay } from "@/components/gestures/DebugOverlay";
import { HandOverlay } from "@/components/scene/HandOverlay";
import { Scene } from "@/components/scene/Scene";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { WebcamManager } from "@/components/webcam/WebcamManager";
import { useCameraStore } from "@/stores/cameraStore";

export default function ExperiencePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [retryKey, setRetryKey] = useState(0);
  // Track the live video element as state so Scene re-renders when it becomes available.
  // videoRef.current is null on first render and only populates after mount — a ref
  // change alone won't trigger a re-render, so we bridge it via state here.
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const error = useCameraStore((state) => state.error);
  const loading = useCameraStore((state) => state.loading);
  const isActive = useCameraStore((state) => state.active);
  const resetCamera = useCameraStore((state) => state.reset);

  // Once the camera becomes active the video element is playing — expose it to Scene
  useEffect(() => {
    if (isActive && videoRef.current) {
      setVideoElement(videoRef.current);
    } else if (!isActive) {
      setVideoElement(null);
    }
  }, [isActive]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {/* WebcamManager mounts the hidden <video> element and starts the stream */}
      <WebcamManager videoRef={videoRef} retryKey={retryKey} />
      {/* Scene renders the Three.js canvas with AR camera background */}
      <Scene videoElement={videoElement} />
      {/* HandOverlay is a 2D canvas overlay — renders the holographic skeleton at 60fps */}
      <HandOverlay />
      <GestureEngine videoRef={videoRef} />
      <GestureHint />
      <DebugOverlay />
      {loading && (
        <div className="absolute left-5 top-5 z-20 border border-white/12 bg-black/36 px-4 py-3 font-display text-xs uppercase tracking-[0.24em] text-white/70 backdrop-blur-md">
          Initialising tracking
        </div>
      )}
      {error && (
        <ErrorScreen
          message={error}
          onRetry={() => {
            resetCamera();
            setRetryKey((value) => value + 1);
          }}
        />
      )}
    </main>
  );
}

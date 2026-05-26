"use client";

import { useEffect } from "react";
import { useCameraStore } from "@/stores/cameraStore";

type WebcamManagerProps = {
  videoRef: React.RefObject<HTMLVideoElement>;
  retryKey: number;
};

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission was denied. Allow camera access and retry.";
    }

    if (error.name === "NotFoundError") {
      return "No camera was found on this device.";
    }

    if (error.name === "NotReadableError") {
      return "The camera is already in use by another app.";
    }
  }

  return error instanceof Error ? error.message : "Unable to start the camera.";
}

export function WebcamManager({ videoRef, retryKey }: WebcamManagerProps) {
  const setPermitted = useCameraStore((state) => state.setPermitted);
  const setActive = useCameraStore((state) => state.setActive);
  const setError = useCameraStore((state) => state.setError);
  const setLoading = useCameraStore((state) => state.setLoading);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError(null);

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser does not expose webcam access.");
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 60 }
          },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) {
          throw new Error("Camera video element is unavailable.");
        }

        video.srcObject = stream;
        await video.play();
        setPermitted(true);
        setActive(true);
      } catch (error) {
        setPermitted(false);
        setActive(false);
        setError(cameraErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      setActive(false);
    };
  }, [retryKey, setActive, setError, setLoading, setPermitted, videoRef]);

  // The video element must remain mounted so MediaPipe can read frames via createImageBitmap().
  // We hide it from view — the live feed is now rendered as the Three.js scene background.
  return (
    <video
      ref={videoRef}
      className="pointer-events-none invisible absolute"
      autoPlay
      muted
      playsInline
      aria-hidden="true"
    />
  );
}

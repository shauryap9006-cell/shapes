"use client";

import { useEffect } from "react";
import { useCameraStore } from "@/stores/cameraStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useGesture } from "@/hooks/useGesture";
import { useHandTracking } from "@/hooks/useHandTracking";
import { useObjectInteraction } from "@/hooks/useObjectInteraction";

type GestureEngineProps = {
  videoRef: React.RefObject<HTMLVideoElement>;
};

export function GestureEngine({ videoRef }: GestureEngineProps) {
  const active = useCameraStore((state) => state.active);
  const setError = useCameraStore((state) => state.setError);
  const setLoading = useCameraStore((state) => state.setLoading);
  const { handleAction, moveGrabbedObject } = useObjectInteraction();
  const { ready, error } = useHandTracking({ enabled: active, videoRef });

  useGesture({ onAction: handleAction });

  useEffect(() => {
    setLoading(active && !ready && !error);
  }, [active, error, ready, setLoading]);

  useEffect(() => {
    if (error) {
      setError(error);
    }
  }, [error, setError]);

  useEffect(() => {
    let frame = 0;

    function loop() {
      useSceneStore.getState().tickObjects();
      moveGrabbedObject();
      frame = requestAnimationFrame(loop);
    }

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [moveGrabbedObject]);

  return null;
}

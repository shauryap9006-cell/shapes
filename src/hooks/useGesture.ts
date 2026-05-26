"use client";

import { useEffect, useRef } from "react";
import { useGestureStore } from "@/stores/gestureStore";
import type { GestureAction } from "@/types/gesture.types";

type UseGestureOptions = {
  onAction: (action: GestureAction) => void;
};

export function useGesture({ onAction }: UseGestureOptions) {
  const currentGesture = useGestureStore((state) => state.currentGesture);
  const markAction = useGestureStore((state) => state.markAction);
  const prevGestureRef = useRef(currentGesture);

  useEffect(() => {
    if (currentGesture !== prevGestureRef.current) {
      markAction();
      onAction({ gesture: currentGesture ?? "none", timestamp: performance.now() });
      prevGestureRef.current = currentGesture;
    }
  }, [currentGesture, markAction, onAction]);
}

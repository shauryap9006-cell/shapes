"use client";

import { useEffect, useState } from "react";
import { useGestureStore } from "@/stores/gestureStore";
import type { GestureType } from "@/types/gesture.types";

const labels: Partial<Record<GestureType, { name: string; action: string; icon: string }>> = {
  "one-finger": { name: "One finger", action: "Spawn sphere", icon: "01" },
  "two-fingers": { name: "Two fingers", action: "Spawn cube", icon: "02" },
  "three-fingers": { name: "Three fingers", action: "Spawn torus", icon: "03" },
  fist: { name: "Fist", action: "Grab / move / throw", icon: "GR" },
  "open-palm": { name: "Open palm", action: "Release / throw", icon: "RL" },
  pinch: { name: "Pinch", action: "Drag edge to resize", icon: "++" },
  "thumbs-up": { name: "Thumbs Up", action: "Good Job!", icon: "OK" },
  "both-fists": { name: "Both Fists", action: "Reset Scene", icon: "RS" }
};

export function GestureHint() {
  const currentGesture = useGestureStore((state) => state.currentGesture);
  const confidence = useGestureStore((state) => state.confidence);
  const bothHandsVisible = useGestureStore((state) => state.bothHandsVisible);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), currentGesture ? 10000 : 3000);
    return () => window.clearTimeout(timeout);
  }, [currentGesture]);

  const content = currentGesture ? labels[currentGesture] : null;

  return (
    <aside
      className={`absolute right-5 top-5 z-20 w-72 border border-white/12 bg-black/34 p-4 text-white backdrop-blur-md transition duration-500 ${visible ? "opacity-100" : "opacity-0"
        }`}
    >
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center border border-cyanGlow/40 bg-cyanGlow/10 font-display text-xs text-cyanGlow">
          {content?.icon ?? "--"}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold">
            {content?.name ?? "No gesture"}
          </p>
          <p className="truncate text-xs text-white/50">{content?.action ?? "Show your hand"}</p>
        </div>
      </div>
      <div className="mt-4 h-1 bg-white/10">
        <div
          className="h-full bg-cyanGlow transition-all"
          style={{ width: `${Math.round(confidence * 100)}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-white/42">
        {bothHandsVisible ? "Two hands visible" : "Single hand tracking"}
      </p>
    </aside>
  );
}

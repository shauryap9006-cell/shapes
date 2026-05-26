"use client";

import { useState } from "react";
import { useGestureStore } from "@/stores/gestureStore";

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function num(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.0";
}

export function DebugOverlay() {
  const [expanded, setExpanded] = useState(true);
  const metrics = useGestureStore((state) => state.debugMetrics);
  const calibration = useGestureStore((state) => state.calibration);
  const startCalibration = useGestureStore((state) => state.startCalibration);
  const resetCalibration = useGestureStore((state) => state.resetCalibration);

  const topHand = metrics?.hands.find((hand) => hand.scores.length > 0);
  const topScores = topHand?.scores ?? [];

  return (
    <section className="absolute bottom-6 left-6 z-20 w-[240px] border border-white/12 bg-black/42 p-2.5 text-[10.5px] text-white backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="font-display text-[9.5px] uppercase tracking-[0.22em] text-cyanGlow"
        >
          Debug
        </button>
        <div className="text-white/48 text-[9.5px]">
          {metrics ? `${num(metrics.publishFps, 0)} fps / ${num(metrics.inferenceMs)} ms` : "waiting"}
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-white/68">
            <span>Render stream</span>
            <span className="text-right text-white">{metrics ? num(metrics.publishFps, 0) : "--"} fps</span>
            <span>Inference</span>
            <span className="text-right text-white">
              {metrics ? `${num(metrics.inferenceFps, 0)} fps / ${num(metrics.inferenceMs)} ms` : "--"}
            </span>
            <span>Dropped</span>
            <span className="text-right text-white">{metrics?.droppedFrames ?? 0}</span>
            <span>Gesture</span>
            <span className="truncate text-right text-white">
              {metrics?.gesture ?? "none"} {metrics ? pct(metrics.confidence) : ""}
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="flex justify-between text-white/48 text-[9.5px] mb-0.5">
              <span>Top scores</span>
              <span>{topHand ? `hand ${topHand.slot}` : "--"}</span>
            </div>
            {topScores.length === 0 ? (
              <div className="text-white/36 italic">No hand score yet</div>
            ) : (
              topScores.map((score) => (
                <div key={score.gesture} className="flex items-center gap-1.5">
                  <span className="w-16 truncate text-white/68">{score.gesture}</span>
                  <div className="h-0.5 flex-1 bg-white/10">
                    <div className="h-full bg-cyanGlow" style={{ width: pct(score.score) }} />
                  </div>
                  <span className="w-8 text-right text-white/68">{pct(score.score)}</span>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5 border-t border-white/10 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-white/68 truncate max-w-[170px]">{calibration.message}</span>
              <span className="text-white/48">{pct(calibration.progress)}</span>
            </div>
            <div className="h-0.5 bg-white/10">
              <div className="h-full bg-lime-300" style={{ width: pct(calibration.progress) }} />
            </div>
            <div className="flex gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={startCalibration}
                className="flex-1 border border-cyanGlow/40 bg-cyanGlow/10 px-1.5 py-0.5 text-cyanGlow"
              >
                Calibrate
              </button>
              <button
                type="button"
                onClick={resetCalibration}
                className="border border-white/12 px-1.5 py-0.5 text-white/68"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useGestureStore } from "@/stores/gestureStore";

// Hand topology — landmark index pairs to draw as bones
const CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [0, 17],
];

export function HandOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;
    let rafId: number;

    function toCanvas(lmX: number, lmY: number) {
      return {
        x: (1 - lmX) * canvas!.width,
        y:      lmY  * canvas!.height,
      };
    }

    function draw() {
      const { hands } = useGestureStore.getState();
      const w = canvas!.width;
      const h = canvas!.height;

      ctx.clearRect(0, 0, w, h);

      hands.forEach((hand) => {
        const pts = hand.landmarks.map((lm) => toCanvas(lm.x, lm.y));

        ctx.save();
        ctx.lineCap  = "round";
        ctx.lineJoin = "round";

        // Draw simple bones
        ctx.strokeStyle = "rgba(0, 255, 200, 0.8)";
        ctx.lineWidth = 3;
        CONNECTIONS.forEach(([a, b]) => {
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        });

        // Draw simple joints
        pts.forEach((pt, i) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = i % 4 === 0 && i > 0 ? "#ffffff" : "rgba(0, 255, 200, 1)"; // white tips, cyan joints
          ctx.fill();
        });

        ctx.restore();
      });

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

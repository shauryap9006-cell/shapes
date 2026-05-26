"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

function CameraIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2.2l1.2-1.6h4.2L15.3 6h2.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function EntryScreen() {
  const router = useRouter();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-void px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(72,245,255,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_42%)]" />
      <motion.section
        className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <p className="mb-5 font-display text-sm uppercase tracking-[0.32em] text-cyanGlow/80">
          Realtime hand control
        </p>
        <h1 className="font-display text-5xl font-semibold leading-none text-white sm:text-7xl">
          Gesture Playground
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-white/68 sm:text-lg">
          Spawn, grab, move, and throw procedural 3D objects with your hands.
        </p>
        <button
          className="mt-10 inline-flex h-12 items-center gap-3 rounded border border-cyanGlow/60 bg-cyanGlow/12 px-5 text-sm font-semibold text-cyanGlow shadow-[0_0_34px_rgba(72,245,255,0.18)] outline-none transition hover:bg-cyanGlow/18 focus-visible:ring-2 focus-visible:ring-cyanGlow"
          onClick={() => router.push("/experience")}
          type="button"
        >
          <CameraIcon />
          Enter Experience
        </button>
        <p className="mt-6 max-w-md text-xs leading-5 text-white/42">
          Desktop Chrome or Edge recommended. Webcam frames stay in the browser.
        </p>
      </motion.section>
      <div className="pointer-events-none absolute bottom-0 h-28 w-full border-t border-white/8 bg-gradient-to-t from-black/50 to-transparent" />
    </main>
  );
}

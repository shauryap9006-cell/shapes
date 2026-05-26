"use client";

type ErrorScreenProps = {
  message: string;
  onRetry: () => void;
};

export function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-void/92 px-6 text-white backdrop-blur">
      <section className="w-full max-w-md border border-red-300/30 bg-red-950/16 p-6">
        <p className="font-display text-sm uppercase tracking-[0.28em] text-red-200/80">
          Tracking stopped
        </p>
        <h2 className="mt-4 font-display text-2xl font-semibold">Camera or hand tracking failed</h2>
        <p className="mt-4 text-sm leading-6 text-white/68">{message}</p>
        <p className="mt-3 text-xs leading-5 text-white/45">
          Use a desktop browser and allow camera access. Camera permissions require HTTPS in
          production, or localhost during development.
        </p>
        <button
          className="mt-6 h-10 border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      </section>
    </div>
  );
}

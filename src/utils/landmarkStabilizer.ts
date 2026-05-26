// =============================================================================
// Dead zone stabiliser — prevents micro-jitter from moving scene objects when
// the hand is held still. Applied AFTER One Euro Filter.
// Threshold is in normalised [0,1] MediaPipe coordinate space.
// =============================================================================
const DEAD_ZONE = 0.003;

export function applyDeadZone(
  current: Array<{ x: number; y: number; z: number }>,
  previous?: Array<{ x: number; y: number; z: number }>
) {
  if (!previous) return current;
  return current.map((lm, i) => {
    const prev = previous[i];
    if (!prev) return lm;
    const dx = Math.abs(lm.x - prev.x);
    const dy = Math.abs(lm.y - prev.y);
    // z is inherently noisy from MediaPipe — apply tighter dead zone on it
    const dz = Math.abs(lm.z - prev.z);
    return (dx < DEAD_ZONE && dy < DEAD_ZONE && dz < DEAD_ZONE * 3) ? prev : lm;
  });
}

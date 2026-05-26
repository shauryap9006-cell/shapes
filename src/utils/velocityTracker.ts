import type { VectorTuple } from "@/types/scene.types";

export class VelocityTracker {
  private samples: Array<{ position: VectorTuple; time: number }> = [];

  constructor(private readonly maxSamples = 8) {}

  add(position: VectorTuple, time = performance.now()) {
    this.samples.push({ position, time });

    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  clear() {
    this.samples = [];
  }

  velocity(maxSpeed = 0.28): VectorTuple {
    if (this.samples.length < 2) {
      return [0, 0, 0];
    }

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const delta = Math.max(16, last.time - first.time);
    const multiplier = 16 / delta;

    const raw: VectorTuple = [
      (last.position[0] - first.position[0]) * multiplier,
      (last.position[1] - first.position[1]) * multiplier,
      (last.position[2] - first.position[2]) * multiplier
    ];

    const magnitude = Math.hypot(raw[0], raw[1], raw[2]);
    if (magnitude <= maxSpeed) {
      return raw;
    }

    const scale = maxSpeed / magnitude;
    return [raw[0] * scale, raw[1] * scale, raw[2] * scale];
  }
}

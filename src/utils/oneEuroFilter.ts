// =============================================================================
// One Euro Filter — industry standard for interactive pointer/landmark smoothing.
// Reduces jitter when movement is slow, stays fully responsive when moving fast.
// Reference: Casiez et al., CHI 2012. https://gery.casiez.net/1euro/
// =============================================================================

export class LowPassFilter {
  private _a: number;
  private _y: number | null;

  constructor(alpha: number) {
    this._a = alpha;
    this._y = null;
  }
  lastValue() { return this._y; }
  filter(value: number, alpha?: number) {
    if (alpha !== undefined) this._a = alpha;
    this._y = this._y === null ? value : this._a * value + (1 - this._a) * this._y;
    return this._y;
  }
}

export class OneEuroFilter {
  private _freq: number;
  private _mincutoff: number;
  private _beta: number;
  private _dcutoff: number;
  private _x: LowPassFilter;
  private _dx: LowPassFilter;
  private _lastTime: number | null;

  constructor(freq = 30, mincutoff = 1.2, beta = 0.008, dcutoff = 1.0) {
    this._freq = freq;
    this._mincutoff = mincutoff;
    this._beta = beta;
    this._dcutoff = dcutoff;
    this._x = new LowPassFilter(this._alpha(mincutoff));
    this._dx = new LowPassFilter(this._alpha(dcutoff));
    this._lastTime = null;
  }

  private _alpha(cutoff: number) {
    const te = 1.0 / this._freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(value: number, timestamp?: number) {
    if (this._lastTime !== null && timestamp !== undefined) {
      const dt = timestamp - this._lastTime;
      if (dt > 0) this._freq = 1.0 / dt;
    }
    this._lastTime = timestamp ?? Date.now() / 1000;

    const prevX = this._x.lastValue();
    const dvalue = prevX === null ? 0 : (value - prevX) * this._freq;
    const edvalue = this._dx.filter(dvalue, this._alpha(this._dcutoff));
    const cutoff = this._mincutoff + this._beta * Math.abs(edvalue);
    return this._x.filter(value, this._alpha(cutoff));
  }
}

export type HandFilters = Array<{ x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter }>;

// 21 landmarks × 3 axes per hand slot
export function createHandFilters(): HandFilters {
  return Array.from({ length: 21 }, () => ({
    x: new OneEuroFilter(30, 1.15, 0.18, 1.2),
    y: new OneEuroFilter(30, 1.15, 0.18, 1.2),
    z: new OneEuroFilter(30, 0.8, 0.08, 1.0),
  }));
}

export function applyOneEuroFilter(
  landmarks: Array<{ x: number; y: number; z: number }>,
  filters: HandFilters,
  timestampSeconds: number
) {
  return landmarks.map((lm, i) => ({
    x: filters[i].x.filter(lm.x, timestampSeconds),
    y: filters[i].y.filter(lm.y, timestampSeconds),
    z: filters[i].z.filter(lm.z, timestampSeconds)
  }));
}

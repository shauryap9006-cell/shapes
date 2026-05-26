// Kalman filter — constant velocity model (CWNA)
// Two states per axis: [position, velocity]
// Q = process noise (trust velocity model less if high)
// R = measurement noise (trust MediaPipe less if high)

class KalmanAxis {
  private pos:  number;
  private vel  = 0;
  private Pp   = 1;   // position variance
  private Ppv  = 0;   // pos-vel covariance
  private Pv   = 1;   // velocity variance

  constructor(
    initial: number,
    private readonly Q = 0.018,
    private readonly R = 0.008,
  ) {
    this.pos = initial;
  }

  predict(dt: number, lookahead = 0.022): number {
    this.pos += this.vel * dt;
    // Standard CWNA covariance propagation
    this.Pp  += dt * (2 * this.Ppv + dt * this.Pv) + this.Q * dt;
    this.Ppv += dt * this.Pv;     // CWNA: no Q term in cross-covariance
    this.Pv  += this.Q * dt;
    
    // Return a visually extrapolated position to counter inference lag
    return this.pos + this.vel * lookahead;
  }

  update(measured: number) {
    const S          = this.Pp + this.R;
    const Kp         = this.Pp  / S;
    const Kv         = this.Ppv / S;
    const innovation = measured - this.pos;

    this.pos += Kp * innovation;
    this.vel += Kv * innovation;

    // Snapshot Ppv BEFORE any covariance mutation.
    // Bug was here: Pv previously read this.Ppv after it was already changed.
    const Ppv_prior = this.Ppv;
    this.Pp  -= Kp * this.Pp;
    this.Ppv -= Kp * this.Ppv;
    this.Pv  -= Kv * Ppv_prior;  // correct: uses pre-update cross-term
  }

  reset(value: number) {
    this.pos = value; this.vel = 0;
    this.Pp  = 1;     this.Ppv = 0; this.Pv = 1;
  }
}

export class HandKalmanSet {
  private xFilters: KalmanAxis[] = [];
  private yFilters: KalmanAxis[] = [];
  private ready = false;

  update(landmarks: ReadonlyArray<{ x: number; y: number; z: number }>) {
    if (!this.ready) {
      this.xFilters = landmarks.map((lm) => new KalmanAxis(lm.x));
      this.yFilters = landmarks.map((lm) => new KalmanAxis(lm.y));
      this.ready    = true;
      return;
    }
    landmarks.forEach((lm, i) => {
      this.xFilters[i].update(lm.x);
      this.yFilters[i].update(lm.y);
    });
  }

  predict(dt: number, lastZ: ReadonlyArray<number>): Array<{ x: number; y: number; z: number }> {
    return this.xFilters.map((xf, i) => ({
      x: xf.predict(dt),
      y: this.yFilters[i].predict(dt),
      z: lastZ[i] ?? 0,
    }));
  }

  reset()   { this.xFilters = []; this.yFilters = []; this.ready = false; }
  isReady() { return this.ready; }
}

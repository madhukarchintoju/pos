export class ExponentialBackoff {
  constructor({ baseMs = 500, maxMs = 15000, factor = 2, jitter = 0.25 } = {}) {
    this.baseMs = baseMs;
    this.maxMs = maxMs;
    this.factor = factor;
    this.jitter = jitter;
    this.attempt = 0;
  }

  nextDelayMs() {
    const exp = Math.min(this.maxMs, this.baseMs * Math.pow(this.factor, this.attempt++));
    const rand = (Math.random() * 2 - 1) * this.jitter; // -jitter..+jitter
    return Math.max(0, Math.round(exp * (1 + rand)));
  }

  reset() {
    this.attempt = 0;
  }
}



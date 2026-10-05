/**
 * Zero-asset sound: every effect is synthesized with the Web Audio API, so the
 * game ships without a single audio file.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = true;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.enabled = false;
      return;
    }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Reusable white-noise buffer for percussive hits.
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.enabled = !muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  tone({ freq = 440, type = 'square', dur = 0.12, gain = 0.2, sweep = 0, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise({ dur = 0.15, gain = 0.25, filter = 900, q = 1, type = 'lowpass', delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = type;
    bp.frequency.value = filter;
    bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* ---------------- game events ---------------- */

  /**
   * A released bowstring: a sharp twang plus the whip of the arrow leaving.
   * @param {boolean} heavy use the deeper ballista voicing
   */
  bowRelease(heavy = false) {
    const root = heavy ? 420 : 760;

    // String twang: fast downward sweep, very short.
    this.tone({
      freq: root,
      type: 'triangle',
      dur: heavy ? 0.16 : 0.11,
      gain: heavy ? 0.18 : 0.13,
      sweep: -root * 0.72,
    });
    this.tone({
      freq: root * 1.9,
      type: 'sine',
      dur: 0.06,
      gain: 0.06,
      sweep: -root,
    });

    // Air over the fletching.
    this.noise({
      dur: heavy ? 0.22 : 0.15,
      gain: heavy ? 0.2 : 0.13,
      filter: heavy ? 1200 : 2100,
      q: 0.8,
      type: 'bandpass',
    });

    // Ballista frames thump with the release.
    if (heavy) {
      this.tone({ freq: 110, type: 'sawtooth', dur: 0.16, gain: 0.14, sweep: -50 });
    }
  }

  /** A tower coming apart: timber splintering, then a heavy collapse. */
  towerDestroyed() {
    this.noise({ dur: 0.34, gain: 0.3, filter: 1600, q: 0.6 });
    this.tone({ freq: 150, type: 'sawtooth', dur: 0.34, gain: 0.16, sweep: -90 });
    this.noise({ dur: 0.55, gain: 0.3, filter: 340, delay: 0.22 });
    this.tone({ freq: 62, type: 'square', dur: 0.5, gain: 0.2, sweep: -26, delay: 0.28 });
  }

  /** Arrow finding its mark: a flat, woody thud rather than a metallic ping. */
  hit() {
    this.noise({ dur: 0.07, gain: 0.16, filter: 900, q: 0.7 });
    this.tone({ freq: 170, type: 'triangle', dur: 0.06, gain: 0.08, sweep: -55 });
  }

  /** A bombard loosing a shell: a deep powder thump with a puff of escaping air. */
  mortarLaunch() {
    this.tone({ freq: 120, type: 'sawtooth', dur: 0.3, gain: 0.2, sweep: -70 });
    this.tone({ freq: 62, type: 'square', dur: 0.34, gain: 0.16, sweep: -26 });
    this.noise({ dur: 0.26, gain: 0.22, filter: 900, q: 0.7, delay: 0.02 });
    this.noise({ dur: 0.2, gain: 0.12, filter: 2600, type: 'highpass', delay: 0.04 });
  }

  /** A shell bursting: a bright crack over a low, rattling boom. */
  explosion() {
    this.noise({ dur: 0.42, gain: 0.34, filter: 1500, q: 0.5 });
    this.tone({ freq: 88, type: 'square', dur: 0.42, gain: 0.22, sweep: -44 });
    this.noise({ dur: 0.6, gain: 0.24, filter: 360, delay: 0.06 });
    this.tone({ freq: 52, type: 'triangle', dur: 0.5, gain: 0.18, sweep: -20, delay: 0.08 });
  }

  /** A catapult loosing: timber creaks, then the arm slams forward. */
  catapultLaunch() {
    // Torsion bundle releasing — a rising creak that snaps off.
    this.tone({ freq: 150, type: 'sawtooth', dur: 0.22, gain: 0.14, sweep: 90 });
    this.noise({ dur: 0.3, gain: 0.2, filter: 700, q: 0.8 });
    // The arm thumping into its stop.
    this.tone({ freq: 96, type: 'square', dur: 0.2, gain: 0.16, sweep: -40, delay: 0.06 });
  }

  /** A boulder smashing down: a heavy ground thud with a gritty crunch. */
  boulderCrash() {
    this.noise({ dur: 0.4, gain: 0.3, filter: 800, q: 0.6 });
    this.tone({ freq: 74, type: 'square', dur: 0.4, gain: 0.2, sweep: -34 });
    this.noise({ dur: 0.5, gain: 0.2, filter: 420, delay: 0.05 });
    this.tone({ freq: 140, type: 'triangle', dur: 0.14, gain: 0.1, sweep: -70, delay: 0.04 });
  }

  coin(streak = 0) {
    const base = 880 + Math.min(8, streak) * 70;
    this.tone({ freq: base, type: 'triangle', dur: 0.09, gain: 0.14 });
    this.tone({ freq: base * 1.5, type: 'triangle', dur: 0.07, gain: 0.07, delay: 0.04 });
  }

  /** A quarry yielding stone: a short chisel clink against rock. */
  stone() {
    this.tone({ freq: 300, type: 'triangle', dur: 0.09, gain: 0.1, sweep: -90 });
    this.tone({ freq: 470, type: 'sine', dur: 0.05, gain: 0.05, delay: 0.03 });
    this.noise({ dur: 0.08, gain: 0.12, filter: 1800, q: 0.7 });
  }

  coinBounce() {
    this.tone({ freq: 1400, type: 'sine', dur: 0.04, gain: 0.05 });
  }

  build() {
    [392, 523, 659, 784].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.14, delay: i * 0.07 })
    );
    this.noise({ dur: 0.2, gain: 0.12, filter: 700 });
  }

  enemyDie() {
    this.noise({ dur: 0.28, gain: 0.2, filter: 500 });
    this.tone({ freq: 220, type: 'sawtooth', dur: 0.22, gain: 0.1, sweep: -140 });
  }

  /** Axe into trunk: a dull thwack with a woody body. */
  chop() {
    this.noise({ dur: 0.09, gain: 0.24, filter: 1400, q: 0.7 });
    this.tone({ freq: 190, type: 'triangle', dur: 0.12, gain: 0.13, sweep: -70 });
  }

  /** The whole tree going over: a long creak then a heavy crash. */
  treeFall() {
    this.tone({ freq: 130, type: 'sawtooth', dur: 0.5, gain: 0.1, sweep: -60 });
    this.noise({ dur: 0.5, gain: 0.26, filter: 420, delay: 0.32 });
    this.tone({ freq: 70, type: 'square', dur: 0.4, gain: 0.16, sweep: -30, delay: 0.4 });
  }

  /** Repair: a warm, rising, obviously-good chord. */
  repair() {
    [349, 440, 523, 698].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.34, gain: 0.13, delay: i * 0.055 })
    );
    this.noise({ dur: 0.25, gain: 0.07, filter: 2600, type: 'highpass' });
  }

  /** "You can't do that" — short, flat, low. */
  denied() {
    this.tone({ freq: 165, type: 'square', dur: 0.09, gain: 0.09 });
    this.tone({ freq: 120, type: 'square', dur: 0.12, gain: 0.09, delay: 0.08 });
  }

  keepHit() {
    this.noise({ dur: 0.35, gain: 0.3, filter: 320 });
    this.tone({ freq: 90, type: 'square', dur: 0.3, gain: 0.16, sweep: -40 });
  }

  /** An axe biting into a tower's timber — lighter and woodier than the keep. */
  towerHit() {
    this.noise({ dur: 0.12, gain: 0.2, filter: 1500, q: 0.6 });
    this.tone({ freq: 150, type: 'triangle', dur: 0.12, gain: 0.12, sweep: -50 });
  }

  heroHurt() {
    this.tone({ freq: 420, type: 'sawtooth', dur: 0.16, gain: 0.14, sweep: -220 });
  }

  waveStart(n) {
    const root = 196 * Math.pow(2, (n % 4) / 12);
    [0, 4, 7].forEach((semi, i) =>
      this.tone({
        freq: root * Math.pow(2, semi / 12),
        type: 'square',
        dur: 0.26,
        gain: 0.13,
        delay: i * 0.12,
      })
    );
  }

  waveClear() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.24, gain: 0.14, delay: i * 0.09 })
    );
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, type: 'sawtooth', dur: 0.5, gain: 0.16, delay: i * 0.2 })
    );
  }
}

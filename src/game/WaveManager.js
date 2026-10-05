import { ENEMY_TYPES, SPAWN, WAVES, generateWave } from './config.js';

/**
 * Drives the wave cycle:
 *   prep (countdown)  ->  spawning (one enemy at a time)  ->  clearing  ->  prep
 *
 * The manager never touches the scene; it just asks the game to spawn a type
 * at a gate and reports progress back for the HUD.
 */
export class WaveManager {
  constructor({
    onSpawn,
    onWaveStart,
    onWaveCleared,
    onCountdown,
    gateCount = 4,
  } = {}) {
    this.onSpawn = onSpawn;
    this.onWaveStart = onWaveStart;
    this.onWaveCleared = onWaveCleared;
    this.onCountdown = onCountdown;
    this.gateCount = gateCount;

    this.waveNumber = 0;
    this.state = 'idle'; // idle | prep | spawning | clearing | finished
    this.prepTimer = 0;
    this.spawnTimer = 0;
    this.queue = [];
    this.spawned = 0;
    this.spawnedTotal = 0;
    this.healthScale = 1;
    this.speedScale = 1;
    this.lastCountdownSecond = -1;
    this.running = false;
  }

  get pending() {
    return this.queue.length;
  }

  /**
   * Total enemies still to deal with: queued plus alive. The game passes in
   * the live count because it owns the enemy array.
   */
  remaining(aliveCount) {
    return this.queue.length + aliveCount;
  }

  start(prepOverride) {
    this.running = true;
    this.waveNumber = 1;
    this.state = 'prep';
    this.prepTimer = prepOverride ?? this._configFor(1).prepTime;
    this.lastCountdownSecond = -1;
  }

  stop() {
    this.running = false;
    this.state = 'idle';
    this.queue.length = 0;
  }

  _configFor(waveNumber) {
    return waveNumber <= WAVES.length
      ? WAVES[waveNumber - 1]
      : generateWave(waveNumber);
  }

  /** Spends a threat budget to assemble the roster for a wave. */
  _buildQueue(waveNumber) {
    const cfg = this._configFor(waveNumber);
    this.healthScale = cfg.healthScale ?? 1;
    this.speedScale = cfg.speedScale ?? 1;

    const pool = cfg.pool.map((id) => ENEMY_TYPES[id]).filter(Boolean);
    const queue = [];
    let budget = cfg.budget;

    while (budget > 0) {
      const affordable = pool.filter((t) => t.threat <= budget);
      if (!affordable.length) break;

      // Bias toward the heaviest affordable unit roughly half the time, so
      // late waves feel mixed rather than spammy.
      let type;
      if (Math.random() < SPAWN.heavyBias) {
        type = affordable.reduce((a, b) => (b.threat > a.threat ? b : a));
      } else {
        type = affordable[Math.floor(Math.random() * affordable.length)];
      }
      queue.push(type);
      budget -= type.threat;
    }

    if (!queue.length) queue.push(ENEMY_TYPES.grunt);

    // Shuffle so tough units aren't all bunched at the front.
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  }

  _beginWave() {
    const cfg = this._configFor(this.waveNumber);
    this.queue = this._buildQueue(this.waveNumber);
    this.spawnGap = cfg.spawnGap ?? SPAWN.defaultGap;
    this.spawned = 0;
    this.spawnedTotal = this.queue.length;
    this.spawnTimer = SPAWN.initialDelay;
    this.state = 'spawning';
    this.onWaveStart?.(this.waveNumber, this.spawnedTotal, cfg);
  }

  /**
   * @param {number} dt
   * @param {number} aliveCount
   */
  update(dt, aliveCount) {
    if (!this.running) return;

    switch (this.state) {
      case 'prep': {
        this.prepTimer -= dt;
        const whole = Math.ceil(this.prepTimer);
        if (whole !== this.lastCountdownSecond) {
          this.lastCountdownSecond = whole;
          this.onCountdown?.(Math.max(0, whole));
        }
        if (this.prepTimer <= 0) this._beginWave();
        break;
      }

      case 'spawning': {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.queue.length) {
          const type = this.queue.shift();
          const gate = this._pickGate();
          this.onSpawn?.(type, gate, {
            healthScale: this.healthScale,
            speedScale: this.speedScale,
          });
          this.spawned += 1;
          this.spawnTimer = this.spawnGap;
        }
        if (!this.queue.length) this.state = 'clearing';
        break;
      }

      case 'clearing': {
        if (aliveCount === 0) {
          this.onWaveCleared?.(this.waveNumber, this.spawnedTotal);
          this.waveNumber += 1;
          this.state = 'prep';
          this.prepTimer = this._configFor(this.waveNumber).prepTime;
          this.lastCountdownSecond = -1;
        }
        break;
      }

      default:
        break;
    }
  }

  /** Mostly random, but avoids sending the whole wave down one lane. */
  _pickGate() {
    if (this._lastGate === undefined) {
      this._lastGate = Math.floor(Math.random() * this.gateCount);
      return this._lastGate;
    }
    let gate = Math.floor(Math.random() * (this.gateCount - 1));
    if (gate >= this._lastGate) gate += 1;
    // Occasionally double up on the same lane for a "focused push".
    if (Math.random() < SPAWN.gateDoubleUp) gate = this._lastGate;
    this._lastGate = gate;
    return gate;
  }

  get progressLabel() {
    if (this.state === 'prep') return 'Prep';
    if (this.state === 'spawning') return 'Incoming';
    if (this.state === 'clearing') return 'Mop up';
    return '';
  }
}

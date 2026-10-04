import * as THREE from 'three';
import { clamp } from './utils.js';

/**
 * All DOM/HUD presentation lives here so gameplay code stays free of
 * document lookups.
 */
export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);

    this.el = {
      hud: $('hud'),
      keepFill: $('keep-fill'),
      keepText: $('keep-text'),
      heroFill: $('hero-fill'),
      coinCount: $('coin-count'),
      woodChip: $('wood-chip'),
      woodCount: $('wood-count'),
      waveLabel: $('wave-label'),
      waveEnemies: $('wave-enemies'),
      callout: $('callout'),
      floaters: $('floaters'),
      prompt: $('prompt'),
      promptTitle: $('prompt-title'),
      promptSub: $('prompt-sub'),
      promptCost: $('prompt-cost'),
      promptBtn: $('prompt-btn'),
      overlay: $('overlay'),
      gameover: $('gameover'),
      goTitle: $('go-title'),
      goStats: $('go-stats'),
      startBtn: $('start-btn'),
      againBtn: $('again-btn'),
    };

    this.floaters = [];
    this._v = new THREE.Vector3();
    this._coinShown = 0;
    this._calloutTimer = 0;
    this._promptAction = null;
    this._promptSignature = '';

    this.el.promptBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._promptAction?.();
    });
  }

  onStart(cb) {
    this.el.startBtn?.addEventListener('click', cb);
    return this;
  }

  onRestart(cb) {
    this.el.againBtn?.addEventListener('click', cb);
    return this;
  }

  onPromptClick(cb) {
    this._promptAction = cb;
  }

  showOverlay(show) {
    this.el.overlay?.classList.toggle('hidden', !show);
  }

  showGameOver(show) {
    this.el.gameover?.classList.toggle('hidden', !show);
  }

  setKeep(ratio, hp, max) {
    const pct = clamp(ratio, 0, 1) * 100;
    if (this.el.keepFill) {
      this.el.keepFill.style.width = `${pct}%`;
      this.el.keepFill.style.background =
        pct > 55 ? 'linear-gradient(180deg,#7ee06a,#3fa83a)'
        : pct > 25 ? 'linear-gradient(180deg,#ffd85e,#e5a013)'
        : 'linear-gradient(180deg,#ff7b62,#c62f1c)';
    }
    if (this.el.keepText) this.el.keepText.textContent = `${Math.ceil(hp)} / ${max}`;

    // Nudge the player toward the wood chip once the keep is actually damaged.
    this.el.woodChip?.classList.toggle('urgent', pct < 99.5 && pct > 0);
  }

  setHero(ratio) {
    const pct = clamp(ratio, 0, 1) * 100;
    if (this.el.heroFill) this.el.heroFill.style.width = `${pct}%`;
  }

  setCoins(total) {
    if (!this.el.coinCount) return;
    const next = Math.round(total);
    this.el.coinCount.textContent = String(next);
    if (next !== this._coinShown) {
      this._coinShown = next;
      this.el.coinCount.classList.remove('pop');
      // Force reflow so the animation can retrigger.
      void this.el.coinCount.offsetWidth;
      this.el.coinCount.classList.add('pop');
    }
  }

  setWood(total) {
    if (!this.el.woodCount) return;
    const next = Math.round(total);
    this.el.woodCount.textContent = String(next);
    if (this._woodShown !== next) {
      this._woodShown = next;
      this.el.woodCount.classList.remove('pop');
      void this.el.woodCount.offsetWidth;
      this.el.woodCount.classList.add('pop');
    }
  }

  setWave(n, remaining) {
    if (this.el.waveLabel) this.el.waveLabel.textContent = `Wave ${n}`;
    if (this.el.waveEnemies) {
      this.el.waveEnemies.textContent =
        remaining > 0 ? `${remaining} incoming` : 'clear';
    }
  }

  /** Big centered banner, e.g. "WAVE 3" / "WAVE CLEARED". */
  callout(title, sub = '', duration = 2.2, tone = '') {
    const el = this.el.callout;
    if (!el) return;
    el.innerHTML = `<div class="callout-title ${tone}">${title}</div>${
      sub ? `<div class="callout-sub">${sub}</div>` : ''
    }`;
    el.classList.add('show');
    this._calloutTimer = duration;
  }

  update(dt, camera, size) {
    if (this._calloutTimer > 0) {
      this._calloutTimer -= dt;
      if (this._calloutTimer <= 0) this.el.callout?.classList.remove('show');
    }
    this._updateFloaters(dt, camera, size);
  }

  /** Spawn a world-anchored floating number/word. */
  floater(worldPos, text, tone = '') {
    if (!this.el.floaters) return;
    const el = document.createElement('div');
    el.className = `floater ${tone}`;
    el.textContent = text;
    this.el.floaters.appendChild(el);
    this.floaters.push({
      el,
      pos: worldPos.clone(),
      life: 0.85,
      maxLife: 0.85,
      jitter: (Math.random() - 0.5) * 22,
    });
    if (this.floaters.length > 40) {
      const old = this.floaters.shift();
      old.el.remove();
    }
  }

  _updateFloaters(dt, camera, size) {
    if (!this.floaters.length) return;
    const v = this._v;

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;

      if (f.life <= 0) {
        f.el.remove();
        this.floaters.splice(i, 1);
        continue;
      }

      const t = 1 - f.life / f.maxLife;
      v.copy(f.pos);
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width + f.jitter;
      const y = (-v.y * 0.5 + 0.5) * size.height - t * 52;
      f.el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y}px) scale(${
        1 + (1 - t) * 0.25
      })`;
      f.el.style.opacity = String(Math.min(1, f.life * 4));
    }
  }

  /**
   * Show or update the contextual build prompt.
   * @param {null|{title:string,sub:string,cost:string,enabled:boolean,label:string}} info
   */
  setPrompt(info) {
    const el = this.el.prompt;
    if (!el) return;

    if (!info) {
      if (this._promptSignature !== '') {
        this._promptSignature = '';
        el.classList.add('hidden');
      }
      return;
    }

    const signature = `${info.title}|${info.sub}|${info.cost}|${info.enabled}|${info.label}`;
    if (signature === this._promptSignature) return;
    this._promptSignature = signature;

    el.classList.remove('hidden');
    if (this.el.promptTitle) this.el.promptTitle.textContent = info.title;
    if (this.el.promptSub) this.el.promptSub.innerHTML = info.sub;
    el.classList.toggle('locked', !info.enabled);
    if (this.el.promptBtn) {
      this.el.promptBtn.textContent = info.label;
      this.el.promptBtn.disabled = !info.enabled;
    }
  }

  clearFloaters() {
    for (const f of this.floaters) f.el.remove();
    this.floaters.length = 0;
  }

  reset() {
    this.clearFloaters();
    this.setPrompt(null);
    this.el.callout?.classList.remove('show');
    this.showGameOver(false);
    this.showOverlay(false);
  }
}

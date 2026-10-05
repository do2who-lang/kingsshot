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
      stoneChip: $('stone-chip'),
      stoneCount: $('stone-count'),
      waveLabel: $('wave-label'),
      waveEnemies: $('wave-enemies'),
      callout: $('callout'),
      floaters: $('floaters'),
      prompt: $('prompt'),
      promptTitle: $('prompt-title'),
      promptSub: $('prompt-sub'),
      promptCost: $('prompt-cost'),
      promptBtn: $('prompt-btn'),
      promptCycle: $('prompt-cycle'),
      buildMenu: $('build-menu'),
      buildList: $('build-list'),
      buildCards: $('build-cards'),
      buildCollapse: $('build-collapse'),
      buildExpand: $('build-expand'),
      buildCancel: $('build-cancel'),
      buildRailIcons: $('build-rail-icons'),
      buildRailCancel: $('build-rail-cancel'),
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

  /**
   * Render the build list from the building catalogue.
   *
   * `onPick(id)` fires when a card is chosen, `onToggle()` when the collapse
   * handle or the edge tab is used, and `onCancel()` when the placement cancel
   * button is tapped.
   */
  buildBuildMenu(defs, { onPick, onToggle, onCancel } = {}) {
    this._buildDefs = defs;
    this._buildPick = onPick;
    this._buildCards = {};
    this._buildRailIcons = {};

    if (this.el.buildCards) {
      this.el.buildCards.innerHTML = '';
      for (const def of defs) {
        const card = document.createElement('button');
        card.className = 'build-card';
        card.dataset.id = def.id;
        card.innerHTML =
          `<span class="bc-glyph">${def.glyph}</span>` +
          `<span class="bc-text">` +
          `<span class="bc-name">${def.name}</span>` +
          `<span class="bc-blurb">${def.blurb}</span>` +
          `<span class="bc-cost" data-cost></span>` +
          `</span>`;
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          this._buildPick?.(def.id);
        });
        this.el.buildCards.appendChild(card);
        this._buildCards[def.id] = card;
      }
    }

    // Collapsed rail: one icon-only button per building.
    if (this.el.buildRailIcons) {
      this.el.buildRailIcons.innerHTML = '';
      for (const def of defs) {
        const btn = document.createElement('button');
        btn.className = 'btn build-rail-btn';
        btn.dataset.id = def.id;
        btn.textContent = def.glyph;
        btn.title = def.name;
        btn.setAttribute('aria-label', def.name);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._buildPick?.(def.id);
        });
        this.el.buildRailIcons.appendChild(btn);
        this._buildRailIcons[def.id] = btn;
      }
    }

    // Collapse via the header handle, expand via the rail chevron.
    this.el.buildCollapse?.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggle?.();
    });
    this.el.buildExpand?.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggle?.();
    });

    this.el.buildCancel?.addEventListener('click', (e) => {
      e.stopPropagation();
      onCancel?.();
    });
    this.el.buildRailCancel?.addEventListener('click', (e) => {
      e.stopPropagation();
      onCancel?.();
    });
  }

  /** Show the full panel, or collapse it to the icon rail. */
  setBuildMenuOpen(open) {
    this.el.buildMenu?.classList.toggle('collapsed', !open);
  }

  /**
   * Reveal the cancel buttons while the player is siting a structure — the
   * touch-friendly way out of placement (both the panel and the rail show one).
   */
  setPlacing(active) {
    this.el.buildCancel?.classList.toggle('hidden', !active);
    this.el.buildRailCancel?.classList.toggle('hidden', !active);
  }

  /** Refresh each card's price, affordability and selected highlight. */
  updateBuildCards({ coins = 0, stone = 0, counts = {}, selected = null } = {}) {
    if (!this._buildDefs) return;

    // Called every frame; skip the DOM work unless something actually changed.
    const sig = `${coins}|${stone}|${counts.tower ?? 0}|${counts.quarry ?? 0}|${counts.wall ?? 0}|${selected}`;
    if (sig === this._buildSig) return;
    this._buildSig = sig;

    for (const def of this._buildDefs) {
      const price = def.cost(counts[def.id] ?? 0);
      const affordable = coins >= price.coins && stone >= price.stone;
      const isSelected = selected === def.id;

      const card = this._buildCards[def.id];
      if (card) {
        const costEl = card.querySelector('[data-cost]');
        if (costEl) {
          costEl.innerHTML =
            `<span class="cost">${price.coins}</span>c` +
            (price.stone > 0 ? ` + <span class="stone">${price.stone}</span>s` : '');
        }
        card.classList.toggle('unaffordable', !affordable);
        card.classList.toggle('selected', isSelected);
      }

      // The collapsed rail shows the same state on its icon buttons.
      const rail = this._buildRailIcons[def.id];
      if (rail) {
        rail.classList.toggle('unaffordable', !affordable);
        rail.classList.toggle('selected', isSelected);
      }
    }
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

  setStone(total) {
    if (!this.el.stoneCount) return;
    const next = Math.round(total);
    this.el.stoneCount.textContent = String(next);
    if (this._stoneShown !== next) {
      this._stoneShown = next;
      this.el.stoneCount.classList.remove('pop');
      void this.el.stoneCount.offsetWidth;
      this.el.stoneCount.classList.add('pop');
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

    const signature = `${info.title}|${info.sub}|${info.enabled}|${info.label}`;
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
    this.setBuildMenuOpen(false);
    this.el.callout?.classList.remove('show');
    this.showGameOver(false);
    this.showOverlay(false);
  }
}

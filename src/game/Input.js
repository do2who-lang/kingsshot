/**
 * Unified input: WASD / arrow keys, plus a drag-anywhere virtual joystick
 * (which is also how mouse users steer).
 *
 * The camera never yaws, so screen axes map 1:1 onto world axes — no
 * camera-relative math needed.
 */
import { INPUT } from './config.js';

export class Input {
  constructor(canvas, dom = {}) {
    this.canvas = canvas;
    this.move = { x: 0, z: 0 };
    this.enabled = false;
    this.onAction = null;
    /** Toggles the build list open/closed. */
    this.onBuildMenu = null;
    /** Cancels placement / closes the build list. */
    this.onCancel = null;
    /**
     * Fired on any real input event while enabled.
     *
     * The opening cinematic uses this to skip, rather than sampling held state:
     * the click on the START button leaves a pointer registered, so polling
     * `pointerId` made the intro skip itself on its very first frame.
     */
    this.onAnyInput = null;

    this.keys = new Set();
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };
    this.current = { x: 0, y: 0 };
    this.maxRadius = INPUT.maxRadius;

    this.stickZone = dom.stickZone ?? document.getElementById('stick-zone');
    this.stickBase = dom.stickBase ?? document.getElementById('stick-base');
    this.stickKnob = dom.stickKnob ?? document.getElementById('stick-knob');

    this._bind();
  }

  _isUiTarget(target) {
    return !!target?.closest?.(
      'button, .panel, .prompt, .overlay, .build-menu, input, a'
    );
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        e.preventDefault();
      }
      if (!this.enabled) return;
      this.keys.add(k);
      this.onAnyInput?.();

      if (k === 'e' || k === ' ' || k === 'enter') this.onAction?.();
      // B opens the build list; Q / X / Escape cancel placement.
      if (k === 'b') this.onBuildMenu?.();
      if (k === 'q' || k === 'x' || k === 'escape') this.onCancel?.();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this._endDrag();
    });

    // --- Virtual joystick ---
    const target = this.canvas;
    target.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.pointerId !== null) return;
      if (this._isUiTarget(e.target)) return;
      e.preventDefault();

      this.onAnyInput?.();

      this.pointerId = e.pointerId;
      this.origin.x = e.clientX;
      this.origin.y = e.clientY;
      this.current.x = e.clientX;
      this.current.y = e.clientY;
      this._showStick(true);
      target.setPointerCapture?.(e.pointerId);
    });

    target.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.current.x = e.clientX;
      this.current.y = e.clientY;
    });

    const end = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this._endDrag();
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('pointerleave', end);

    // Kill the browser's long-press / text-selection hijinks on mobile.
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _endDrag() {
    this.pointerId = null;
    this._showStick(false);
  }

  _showStick(visible) {
    if (!this.stickBase) return;
    this.stickBase.classList.toggle('visible', visible);
    if (visible) {
      this.stickBase.style.left = `${this.origin.x}px`;
      this.stickBase.style.top = `${this.origin.y}px`;
    }
  }

  /** Reads the current movement intent, normalized to a max magnitude of 1. */
  sample() {
    let kx = 0;
    let kz = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) kx -= 1;
    if (k.has('d') || k.has('arrowright')) kx += 1;
    if (k.has('s') || k.has('arrowdown')) kz += 1;
    if (k.has('w') || k.has('arrowup')) kz -= 1;

    let dx = 0;
    let dz = 0;
    if (this.pointerId !== null) {
      dx = (this.current.x - this.origin.x) / this.maxRadius;
      dz = (this.current.y - this.origin.y) / this.maxRadius;
    }

    let x = kx + dx;
    let z = kz + dz;
    const mag = Math.hypot(x, z);
    if (mag > 1) {
      x /= mag;
      z /= mag;
    }

    // Update the knob visual.
    if (this.stickKnob) {
      const knobX = Math.max(-1, Math.min(1, x)) * INPUT.knobTravel;
      const knobY = Math.max(-1, Math.min(1, z)) * INPUT.knobTravel;
      this.stickKnob.style.transform = `translate(-50%, -50%) translate(${knobX}px, ${knobY}px)`;
    }

    this.move.x = x;
    this.move.z = z;
    return this.move;
  }

  release() {
    this.enabled = false;
    this.keys.clear();
    this._endDrag();
  }
}

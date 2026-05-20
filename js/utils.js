import { CONFIG } from './config.js';

let nextId = 1;
export function uid(prefix = 'id') {
  return `${prefix}_${nextId++}`;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 画布坐标 → 逻辑坐标 */
export function getCanvasPoint(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CONFIG.canvas.width / rect.width;
  const scaleY = CONFIG.canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export function scaleGameContainer() {
  const container = document.getElementById('gameContainer');
  if (!container) return;
  const scale = Math.min(window.innerWidth / 540, window.innerHeight / 960);
  container.style.setProperty('--game-scale', String(scale));
  container.style.transform = `translate(-50%, -50%) scale(${scale})`;
  container.style.position = 'absolute';
  container.style.top = '50%';
  container.style.left = '50%';
}

export class ObjectPool {
  constructor(factory, initial = 8) {
    this._factory = factory;
    this._pool = [];
    for (let i = 0; i < initial; i++) this._pool.push(factory());
  }

  acquire() {
    return this._pool.length ? this._pool.pop() : this._factory();
  }

  release(obj) {
    this._pool.push(obj);
  }
}

export class FloatTextManager {
  constructor(layerEl) {
    this.layer = layerEl;
  }

  spawn(x, y, text, className = '') {
    if (!this.layer) return;
    const el = document.createElement('div');
    el.className = `float-text ${className}`.trim();
    el.textContent = text;
    el.style.left = `${(x / CONFIG.canvas.width) * 100}%`;
    el.style.top = `${(y / CONFIG.canvas.height) * 100}%`;
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 500);
  }
}

export function vibrate(ms = 30) {
  const toggle = document.getElementById('vibrationToggle');
  if (toggle && !toggle.checked) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}

let _toastTimer = null;
let _toastLastAt = 0;

/** 屏幕中央短暂提示（如金币不足） */
export function showToast(message, durationMs = 1400) {
  const el = document.getElementById('gameToast');
  if (!el) return;
  const now = performance.now();
  if (now - _toastLastAt < 500 && el.textContent === message) return;
  _toastLastAt = now;

  if (_toastTimer) clearTimeout(_toastTimer);
  el.textContent = message;
  el.hidden = false;
  el.classList.remove('game-toast-hide');
  void el.offsetWidth;
  el.classList.add('game-toast-show');

  _toastTimer = setTimeout(() => {
    el.classList.remove('game-toast-show');
    el.classList.add('game-toast-hide');
    _toastTimer = setTimeout(() => {
      el.hidden = true;
      el.classList.remove('game-toast-hide');
    }, 280);
  }, durationMs);
}

export function showOverlay(type, durationMs = 100) {
  const el = document.getElementById('fxOverlay');
  if (!el) return;
  el.hidden = false;
  el.className = `fx-overlay ${type}`;
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      el.hidden = true;
      el.className = 'fx-overlay';
    }, durationMs);
  }, durationMs);
}

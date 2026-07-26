/* ==========================================================================
   SILK · 丝 — 行为层(零依赖 ES module)
   自定义元素:silk-slider / silk-switch / silk-tabs / silk-modal /
   silk-dropdown;函数:toast() / setTheme() / getTheme()。
   可访问性内建:Modal 焦点保存→inert 背景→还原,滚动锁定在根元素
   (body overflow 不会穿透 html 的 overflow 设置),Esc 全覆盖。
   ========================================================================== */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 主题 ---------- */

export function setTheme(theme, { persistKey = 'silk-theme' } = {}) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(persistKey, theme); } catch (_) { /* 隐私模式 */ }
}
export function getTheme({ persistKey = 'silk-theme' } = {}) {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  try { const s = localStorage.getItem(persistKey); if (s) return s; } catch (_) { /* */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function toggleTheme(opts) {
  const next = getTheme(opts) === 'dark' ? 'light' : 'dark';
  setTheme(next, opts);
  return next;
}

/* ---------- Toast ---------- */

let toastBox = null;
const MAX_TOASTS = 3;

export function toast(text, { actionLabel, onAction, duration } = {}) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'silk-toasts';
    toastBox.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastBox);
  }
  while (toastBox.children.length >= MAX_TOASTS) toastBox.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'silk-toast';
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
  const life = duration || (actionLabel ? 6000 : 3200);
  let done = false;
  const leave = () => {
    if (done) return;
    done = true;
    el.classList.add('silk-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400); // 兜底
  };
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => { if (onAction) onAction(); leave(); });
    el.appendChild(btn);
  }
  toastBox.appendChild(el);
  setTimeout(leave, life);
  return { dismiss: leave };
}

/* ---------- Slider ---------- */

class SilkSlider extends HTMLElement {
  static observedAttributes = ['value', 'min', 'max', 'disabled'];

  connectedCallback() {
    if (!this._built) {
      this._built = true;
      this.innerHTML = '<div class="silk-track"><div class="silk-fill"></div></div><div class="silk-thumb"></div>';
      this.setAttribute('role', 'slider');
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      this.addEventListener('pointerdown', this._down.bind(this));
      this.addEventListener('keydown', this._key.bind(this));
    }
    this._render();
  }

  attributeChangedCallback() { if (this._built) this._render(); }

  get min() { return Number(this.getAttribute('min') || 0); }
  get max() { return Number(this.getAttribute('max') || 100); }
  get step() { return Number(this.getAttribute('step') || 1); }
  get value() { return clamp(Number(this.getAttribute('value') || 0), this.min, this.max); }
  set value(v) {
    const nv = clamp(Math.round(v / this.step) * this.step, this.min, this.max);
    if (nv !== Number(this.getAttribute('value'))) this.setAttribute('value', String(nv));
  }

  _render() {
    const pct = this.max === this.min ? 0 : ((this.value - this.min) / (this.max - this.min)) * 100;
    this.style.setProperty('--silk-value', pct + '%');
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    this.setAttribute('aria-valuenow', String(this.value));
    this.setAttribute('aria-disabled', String(this.hasAttribute('disabled')));
  }

  _emit(type) { this.dispatchEvent(new CustomEvent(type, { detail: { value: this.value }, bubbles: true })); }

  _apply(clientX) {
    const r = this.getBoundingClientRect();
    const ratio = clamp((clientX - r.left) / r.width, 0, 1);
    this.value = this.min + ratio * (this.max - this.min);
    this._emit('input');
  }

  _down(e) {
    if (this.hasAttribute('disabled')) return;
    this.setAttribute('data-dragging', '');
    this.classList.remove('silk-thumb-release');
    try { this.setPointerCapture(e.pointerId); } catch (_) { /* */ }
    this._apply(e.clientX);
    const move = (ev) => this._apply(ev.clientX);
    const up = () => {
      this.removeEventListener('pointermove', move);
      this.removeEventListener('pointerup', up);
      this.removeEventListener('pointercancel', up);
      this.removeAttribute('data-dragging');
      this.classList.add('silk-thumb-release'); // 松手:弹簧归位
      this._emit('change');
    };
    this.addEventListener('pointermove', move);
    this.addEventListener('pointerup', up);
    this.addEventListener('pointercancel', up);
  }

  _key(e) {
    if (this.hasAttribute('disabled')) return;
    const big = (this.max - this.min) / 10;
    const delta = { ArrowRight: this.step, ArrowUp: this.step,
                    ArrowLeft: -this.step, ArrowDown: -this.step,
                    PageUp: big, PageDown: -big }[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      this.value = this.value + delta;
      this._emit('input'); this._emit('change');
    } else if (e.key === 'Home') { e.preventDefault(); this.value = this.min; this._emit('change'); }
    else if (e.key === 'End') { e.preventDefault(); this.value = this.max; this._emit('change'); }
  }
}

/* ---------- Switch ---------- */

class SilkSwitch extends HTMLElement {
  static observedAttributes = ['checked'];

  connectedCallback() {
    if (!this._built) {
      this._built = true;
      this.setAttribute('role', 'switch');
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      this.addEventListener('click', () => this.toggle());
      this.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.toggle(); }
      });
    }
    this._render();
  }
  attributeChangedCallback() { this._render(); }
  get checked() { return this.hasAttribute('checked'); }
  set checked(v) { this.toggleAttribute('checked', !!v); }
  toggle() {
    if (this.hasAttribute('disabled')) return;
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent('change', { detail: { checked: this.checked }, bubbles: true }));
  }
  _render() { this.setAttribute('aria-checked', String(this.checked)); }
}

/* ---------- Tabs ---------- */

class SilkTabs extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this._tabs = [...this.querySelectorAll(':scope > silk-tab')];
    const list = document.createElement('div');
    list.className = 'silk-tablist';
    list.setAttribute('role', 'tablist');
    this._btns = this._tabs.map((tab, i) => {
      const b = document.createElement('button');
      b.className = 'silk-tab-btn';
      b.textContent = tab.getAttribute('label') || `Tab ${i + 1}`;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => this.select(i));
      b.addEventListener('keydown', (e) => {
        const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (dir) {
          e.preventDefault();
          const n = (i + dir + this._btns.length) % this._btns.length;
          this.select(n);
          this._btns[n].focus();
        }
      });
      list.appendChild(b);
      return b;
    });
    this._ind = document.createElement('div');
    this._ind.className = 'silk-indicator';
    list.appendChild(this._ind);
    this.prepend(list);
    this.select(Number(this.getAttribute('selected') || 0), { silent: true });
    // 字体/布局就绪后校准指示器
    requestAnimationFrame(() => this._moveIndicator());
    window.addEventListener('resize', () => this._moveIndicator());
  }

  select(i, { silent = false } = {}) {
    this._i = clamp(i, 0, this._tabs.length - 1);
    this._btns.forEach((b, j) => {
      b.setAttribute('aria-selected', String(j === this._i));
      b.tabIndex = j === this._i ? 0 : -1;
    });
    this._tabs.forEach((t, j) => { t.hidden = j !== this._i; });
    this._moveIndicator();
    if (!silent) this.dispatchEvent(new CustomEvent('change', { detail: { index: this._i }, bubbles: true }));
  }

  _moveIndicator() {
    const b = this._btns[this._i];
    if (!b) return;
    // transform-only:translate + scaleX(基准宽 40px)
    this._ind.style.transform =
      `translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth / 40})`;
  }
}

/* ---------- Modal ---------- */

class SilkModal extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    const title = this.getAttribute('title') || '';
    const scrim = document.createElement('div');
    scrim.className = 'silk-scrim';
    scrim.addEventListener('click', () => this.close('scrim'));
    const panel = document.createElement('div');
    panel.className = 'silk-panel';
    panel.tabIndex = -1;
    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-modal', 'true');
    if (title) {
      const h = document.createElement('h3');
      h.textContent = title;
      h.id = 'silk-mt-' + Math.random().toString(36).slice(2, 7);
      this.setAttribute('aria-labelledby', h.id);
      panel.appendChild(h);
    }
    while (this.firstChild) panel.appendChild(this.firstChild);
    this.append(scrim, panel);
    this._panel = panel;
    this._esc = (e) => { if (e.key === 'Escape' && this.hasAttribute('open')) this.close('esc'); };
  }

  show() {
    this._lastFocus = document.activeElement;
    this.removeAttribute('data-closing');
    this.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden'; // 锁根元素,不锁 body
    [...document.body.children].forEach((el) => {
      if (el !== this && !el.classList.contains('silk-toasts')) el.inert = true;
    });
    document.addEventListener('keydown', this._esc);
    this._panel.focus({ preventScroll: true });
  }

  close(reason = 'api') {
    if (!this.hasAttribute('open') || this.hasAttribute('data-closing')) return;
    [...document.body.children].forEach((el) => { el.inert = false; });
    document.removeEventListener('keydown', this._esc);
    const finish = () => {
      this.removeAttribute('open');
      this.removeAttribute('data-closing');
      document.documentElement.style.overflow = '';
      if (this._lastFocus && this._lastFocus.isConnected) {
        this._lastFocus.focus({ preventScroll: true });
      }
      this.dispatchEvent(new CustomEvent('close', { detail: { reason }, bubbles: true }));
    };
    if (REDUCED) { finish(); return; }
    this.setAttribute('data-closing', '');
    this._panel.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 400); // 兜底
  }
}

/* ---------- Dropdown ---------- */

class SilkDropdown extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this._trigger = this.querySelector(':scope > :not(.silk-menu)');
    this._menu = this.querySelector(':scope > .silk-menu');
    if (!this._trigger || !this._menu) return;
    this._trigger.setAttribute('aria-haspopup', 'true');
    this._trigger.setAttribute('aria-expanded', 'false');
    this._trigger.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    this._menu.addEventListener('click', (e) => {
      const item = e.target.closest('button');
      if (!item) return;
      this.dispatchEvent(new CustomEvent('select', {
        detail: { value: item.dataset.value ?? item.textContent.trim() }, bubbles: true }));
      this.close();
    });
    this._outside = (e) => { if (!this.contains(e.target)) this.close(); };
    this._keys = (e) => {
      if (e.key === 'Escape') { this.close(); this._trigger.focus(); return; }
      const items = [...this._menu.querySelectorAll('button')];
      const idx = items.indexOf(document.activeElement);
      const dir = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (dir) {
        e.preventDefault();
        items[(idx + dir + items.length) % items.length].focus();
      } else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    };
  }

  toggle() { this.hasAttribute('open') ? this.close() : this.open(); }

  open() {
    this.setAttribute('open', '');
    this._trigger.setAttribute('aria-expanded', 'true');
    // 底部空间不足则向上翻
    const r = this._trigger.getBoundingClientRect();
    this.toggleAttribute('data-up', r.bottom + this._menu.offsetHeight + 16 > innerHeight);
    document.addEventListener('click', this._outside);
    this.addEventListener('keydown', this._keys);
    const first = this._menu.querySelector('button');
    if (first) first.focus();
  }

  close() {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this._trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', this._outside);
    this.removeEventListener('keydown', this._keys);
  }
}

/* ---------- 注册 ---------- */

customElements.define('silk-slider', SilkSlider);
customElements.define('silk-switch', SilkSwitch);
customElements.define('silk-tabs', SilkTabs);
customElements.define('silk-modal', SilkModal);
customElements.define('silk-dropdown', SilkDropdown);

export const silk = { toast, setTheme, getTheme, toggleTheme };
export default silk;

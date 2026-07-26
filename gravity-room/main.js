/* ==========================================================================
   GRAVITY ROOM — 重力房间
   One shared rAF loop. One verlet helper. One pointer. Zero dependencies.
   ========================================================================== */
'use strict';

(() => {

  /* ---------- Helpers ---------- */

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(pointer: fine)').matches;
  const html = document.documentElement;

  const BONE = '#F2EFE6';
  const LIME = '#D7FF3E';
  const DISPLAY_STACK = '-apple-system, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const d = dprNow();
    canvas.width = Math.max(1, Math.round(rect.width * d));
    canvas.height = Math.max(1, Math.round(rect.height * d));
    return d;
  }

  function onVisible(el, cb) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => cb(en.isIntersecting)),
      { rootMargin: '80px' }
    );
    io.observe(el);
  }

  // Shared verlet distance constraint: moves b (and optionally a) so that
  // |ab| approaches rest. `give` is how much of the correction b absorbs.
  function constrain(a, b, rest, give) {
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const diff = (d - rest) / d;
    const ga = 1 - give;
    a.x += dx * diff * ga; a.y += dy * diff * ga;
    b.x -= dx * diff * give; b.y -= dy * diff * give;
  }

  /* ---------- Scheduler: one rAF loop for everything ---------- */

  const scheduler = {
    tickers: new Set(),
    last: 0,
    dtEma: 16.7,
    // Native rAF cadence baseline (min dt over the first frames) so a 30Hz
    // low-power display is not mistaken for jank.
    dtBase: 50,
    frames: 0,
    fps: 60,
    rafId: 0,
    running: false,
    add(fn) { this.tickers.add(fn); },
    loop(now) {
      if (!this.running) return;
      const dt = Math.min(64, now - this.last || 16.7);
      this.last = now;
      if (this.frames < 60) { this.dtBase = Math.min(this.dtBase, dt); this.frames++; }
      this.dtEma = this.dtEma * 0.95 + dt * 0.05;
      this.fps = 1000 / this.dtEma;
      const f = clamp(dt / 16.667, 0.25, 2.5);
      for (const fn of this.tickers) fn(dt, f, now);
      this.rafId = requestAnimationFrame(this.bound);
    },
    start() {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      this.rafId = requestAnimationFrame(this.bound);
    },
    stop() {
      this.running = false;
      cancelAnimationFrame(this.rafId);
    },
  };
  scheduler.bound = scheduler.loop.bind(scheduler);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scheduler.stop(); else scheduler.start();
  });
  scheduler.start();

  /* ---------- Pointer singleton ---------- */

  const pointer = { x: -1000, y: -1000, active: false };
  const trackPointer = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  };
  window.addEventListener('pointermove', trackPointer, { passive: true });
  window.addEventListener('pointerdown', trackPointer, { passive: true });
  window.addEventListener('blur', () => { pointer.active = false; });
  html.addEventListener('mouseleave', () => { pointer.active = false; });
  // Touch/pen have no hover: lifting the finger must end the force field,
  // or the last touch point keeps repelling particles forever.
  const releasePointer = (e) => {
    if (e.pointerType !== 'mouse') {
      pointer.active = false;
      pointer.x = -1000;
      pointer.y = -1000;
    }
  };
  window.addEventListener('pointerup', releasePointer, { passive: true });
  window.addEventListener('pointercancel', releasePointer, { passive: true });

  /* ---------- Boot curtain ---------- */

  (() => {
    if (REDUCED) { html.classList.add('booted'); return; }
    const counter = document.getElementById('bootCounter');
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 480);
      counter.textContent = String(Math.round(t * 100)).padStart(3, '0');
      if (t < 1) requestAnimationFrame(step);
      else html.classList.add('booted');
    };
    requestAnimationFrame(step);
  })();

  /* ---------- Hero particle engine ---------- */

  const heroEngine = (() => {
    const canvas = document.getElementById('heroCanvas');
    const ctx = canvas.getContext('2d');
    const WORD = 'GRAVITY';

    let W = 0, H = 0, dpr = 1, size = 4;
    let pageLeft = 0, pageTop = 0;
    let baseBudget = 2000;
    let particles = [];
    let heights = new Float32Array(0);
    let cellW = 8, nCols = 1, grainH = 6;
    let gravityOn = false;
    let visible = true;
    let degrade = 0, slowFrames = 0, fastFrames = 0;
    // Reduced-motion crossfade frames
    let rmOff = null, rmOn = null, rmT = 0, rmTarget = 0, rmDirty = true;

    function build() {
      const old = particles, oldW = W, oldH = H;
      const rect = canvas.getBoundingClientRect();
      dpr = dprNow();
      pageLeft = rect.left + window.scrollX;
      pageTop = rect.top + window.scrollY;
      W = Math.max(1, Math.round(rect.width * dpr));
      H = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = W;
      canvas.height = H;
      size = Math.max(2, Math.round(2 * dpr));

      // Rasterize the word offscreen, then sample it into particles.
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const octx = off.getContext('2d', { willReadFrequently: true });
      let fontPx = H * 0.4;
      octx.font = `800 ${fontPx}px ${DISPLAY_STACK}`;
      const tw = octx.measureText(WORD).width || 1;
      fontPx = Math.min(fontPx * (W * 0.86) / tw, H * 0.52);
      octx.font = `800 ${fontPx}px ${DISPLAY_STACK}`;
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillStyle = '#fff';
      octx.fillText(WORD, W / 2, H * 0.44);

      const img = octx.getImageData(0, 0, W, H).data;
      let probe = 0;
      for (let y = 0; y < H; y += 4)
        for (let x = 0; x < W; x += 4)
          if (img[(y * W + x) * 4 + 3] > 128) probe++;
      baseBudget = rect.width < 480 ? 900 : 2000;
      const budget = Math.max(220,
        Math.round(baseBudget * Math.pow(0.65, degrade)));
      const step = Math.max(2, Math.round(4 * Math.sqrt(probe / budget)) || 2);

      particles = [];
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          if (img[(y * W + x) * 4 + 3] > 128) {
            particles.push({
              x: Math.random() * W, y: Math.random() * H,
              vx: 0, vy: 0,
              hx: x, hy: y,
              resting: false, col: 0, holdUntil: 0,
            });
          }
        }
      }
      // Rebuilds carry the previous simulation state over (scaled) so a
      // resize or density change never explodes the scene; only the very
      // first build gets the random scatter-in intro.
      if (old.length) {
        const sx = W / (oldW || W), sy = H / (oldH || H);
        for (let i = 0; i < particles.length; i++) {
          const o = old[i % old.length];
          particles[i].x = o.x * sx;
          particles[i].y = o.y * sy;
          particles[i].vx = o.vx;
          particles[i].vy = o.vy;
        }
      }

      cellW = 4 * dpr;
      nCols = Math.max(1, Math.ceil(W / cellW));
      heights = new Float32Array(nCols);
      grainH = 3 * dpr;

      if (REDUCED) {
        octx.globalCompositeOperation = 'source-in';
        octx.fillStyle = BONE;
        octx.fillRect(0, 0, W, H);
        rmOff = off;
        rmOn = document.createElement('canvas');
        rmOn.width = W; rmOn.height = H;
        const cctx = rmOn.getContext('2d');
        cctx.fillStyle = BONE;
        const stacks = new Float32Array(nCols);
        for (const p of particles) {
          const col = clamp((p.hx / cellW) | 0, 0, nCols - 1);
          cctx.fillRect(p.hx - size / 2, H - stacks[col] - size, size, size);
          stacks[col] += grainH;
        }
        rmDirty = true;
      }
    }

    function setGravity(on) {
      gravityOn = on;
      rmTarget = on ? 1 : 0;
      heights.fill(0);
      const now = performance.now();
      for (const p of particles) {
        p.resting = false;
        if (on) {
          p.vy += (Math.random() - 0.5) * 1.5 * dpr;
          p.vx += (Math.random() - 0.5) * 1.5 * dpr;
        } else {
          // Erupt upward, then spring home with a distance-staggered delay.
          p.vy -= (2 + Math.random() * 3) * dpr;
          p.vx += (Math.random() - 0.5) * 2 * dpr;
          const d = Math.hypot(p.hx - p.x, p.hy - p.y) / dpr;
          p.holdUntil = now + d * 0.4;
        }
      }
    }

    function burst() {
      heights.fill(0);
      for (const p of particles) {
        p.resting = false;
        p.vx += (Math.random() - 0.5) * 9 * dpr;
        p.vy += (Math.random() - 0.8) * 9 * dpr;
      }
    }

    function renderReduced(dt) {
      if (rmT === rmTarget && !rmDirty) return;
      rmDirty = false;
      const dir = Math.sign(rmTarget - rmT);
      rmT = clamp(rmT + dir * (dt / 400), 0, 1);
      ctx.clearRect(0, 0, W, H);
      if (rmT < 1 && rmOff) {
        ctx.globalAlpha = 1 - rmT;
        ctx.drawImage(rmOff, 0, 0);
      }
      if (rmT > 0 && rmOn) {
        ctx.globalAlpha = rmT;
        ctx.drawImage(rmOn, 0, 0);
      }
      ctx.globalAlpha = 1;
      if (rmT !== rmTarget) rmDirty = true;
    }

    // Drop evenly spaced particles in place — no re-rasterize, no visual
    // reset — when the frame budget is blown.
    function thin() {
      const budget = Math.max(220,
        Math.round(baseBudget * Math.pow(0.65, degrade)));
      if (particles.length <= budget) return;
      const keepRatio = budget / particles.length;
      const kept = [];
      let acc = 0;
      for (const p of particles) {
        acc += keepRatio;
        if (acc >= 1) { acc -= 1; kept.push(p); }
        else if (p.resting) heights[p.col] = Math.max(0, heights[p.col] - grainH);
      }
      particles = kept;
    }

    function tick(dt, f, now) {
      if (!visible) return;
      if (REDUCED) { renderReduced(dt); return; }

      // Frame-time watchdog, relative to the display's own rAF cadence:
      // degrade sample density before frame rate, recover when calm returns.
      if (scheduler.dtEma > Math.max(19, scheduler.dtBase * 1.25) && degrade < 2) {
        if (++slowFrames > 60) { slowFrames = 0; degrade++; thin(); }
      } else {
        slowFrames = 0;
        if (degrade > 0 && scheduler.dtEma < scheduler.dtBase * 1.1) {
          if (++fastFrames > 300) { fastFrames = 0; degrade--; build(); }
        } else fastFrames = 0;
      }

      const px = (pointer.x - (pageLeft - window.scrollX)) * dpr;
      const py = (pointer.y - (pageTop - window.scrollY)) * dpr;
      const pActive = pointer.active;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = html.classList.contains('konami') ? '#FF6B4A' : BONE;
      const half = size / 2;

      if (!gravityOn) {
        const k = 0.06;
        const damp = Math.pow(0.86, f);
        const R = 120 * dpr, R2 = R * R;
        for (const p of particles) {
          if (now < p.holdUntil) {
            // Post-eruption drift: coast and slow until this grain's turn.
            p.vx *= Math.pow(0.94, f);
            p.vy *= Math.pow(0.94, f);
            p.x += p.vx * f; p.y += p.vy * f;
          } else {
            p.vx = (p.vx + (p.hx - p.x) * k * f) * damp;
            p.vy = (p.vy + (p.hy - p.y) * k * f) * damp;
            if (pActive) {
              const dx = p.x - px, dy = p.y - py;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2) {
                const d = Math.sqrt(d2) || 1;
                const force = (1 - d / R) * (1 - d / R) * 2.6 * dpr * f;
                p.vx += (dx / d) * force;
                p.vy += (dy / d) * force;
              }
            }
            p.vx += (Math.random() - 0.5) * 0.12 * dpr;
            p.vy += (Math.random() - 0.5) * 0.12 * dpr;
            p.x += p.vx * f; p.y += p.vy * f;
          }
          ctx.fillRect(p.x - half, p.y - half, size, size);
        }
        return;
      }

      // Gravity mode: rain, bounce, pile, and let the cursor plow the heap.
      const G = 0.35 * dpr;
      const scoopR = 160 * dpr, scoopR2 = scoopR * scoopR;
      const heapCap = H * 0.55;
      for (const p of particles) {
        if (p.resting) {
          if (pActive) {
            const dx = p.x - px, dy = p.y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < scoopR2) {
              const d = Math.sqrt(d2) || 1;
              p.resting = false;
              heights[p.col] = Math.max(0, heights[p.col] - grainH);
              const imp = (1 - d / scoopR) * 5 * dpr;
              p.vx += (dx / d) * imp;
              p.vy += (dy / d) * imp - 1.2 * dpr;
            }
          }
          ctx.fillRect(p.x - half, p.y - half, size, size);
          continue;
        }
        p.vy += G * f;
        if (pActive) {
          const dx = p.x - px, dy = p.y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < scoopR2) {
            const d = Math.sqrt(d2) || 1;
            const force = (1 - d / scoopR) * 1.3 * dpr * f;
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        }
        p.x += p.vx * f;
        p.y += p.vy * f;
        if (p.x < half) { p.x = half; p.vx = -p.vx * 0.45; }
        else if (p.x > W - half) { p.x = W - half; p.vx = -p.vx * 0.45; }
        if (p.y < half) { p.y = half; p.vy = -p.vy * 0.45; }
        const col = p.col = clamp((p.x / cellW) | 0, 0, nCols - 1);
        const ground = H - heights[col] - half;
        if (p.y >= ground) {
          p.y = ground;
          if (Math.abs(p.vy) < 1.6 * dpr) {
            p.resting = true;
            p.vx = 0; p.vy = 0;
            if (heights[col] < heapCap) heights[col] += grainH;
          } else {
            p.vy = -p.vy * 0.45;
            p.vx *= 0.92;
          }
        }
        ctx.fillRect(p.x - half, p.y - half, size, size);
      }
    }

    // Rebuild only on real size changes — mobile URL-bar show/hide fires
    // resize with a small height delta and must not wipe the simulation.
    function handleResize() {
      const rect = canvas.getBoundingClientRect();
      const d = dprNow();
      const newW = Math.max(1, Math.round(rect.width * d));
      const newH = Math.max(1, Math.round(rect.height * d));
      if (newW === W && d === dpr && Math.abs(newH - H) < 120 * d) {
        pageLeft = rect.left + window.scrollX;
        pageTop = rect.top + window.scrollY;
        return;
      }
      build();
    }

    build();
    onVisible(canvas, (v) => { visible = v; if (v && REDUCED) rmDirty = true; });
    scheduler.add(tick);

    return {
      resize: handleResize,
      setGravity,
      burst,
      count: () => particles.length,
      isVisible: () => visible,
    };
  })();

  /* ---------- The lever ---------- */

  const lever = (() => {
    const btn = document.getElementById('lever');
    const label = document.getElementById('leverLabel');
    const hint = document.getElementById('leverHint');
    const live = document.getElementById('liveRegion');
    const ON_PULL = 34;
    let on = false;
    let attempts = 0;
    let dragging = false;
    let startY = 0;
    let samples = [];
    let maxVel = 0;
    let suppressClickUntil = 0;

    const setPull = (v) => btn.style.setProperty('--pull', v + 'px');

    function apply(state) {
      on = state;
      attempts = 0;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      label.textContent = on ? 'GRAVITY: ON' : 'GRAVITY: OFF';
      html.classList.toggle('gravity-on', on);
      heroEngine.setGravity(on);
      setPull(on ? ON_PULL : 0);
      hint.classList.remove('warn');
      hint.innerHTML = on
        ? 'PULL AGAIN TO RESTORE ORDER <span class="zh" lang="zh">恢复秩序</span>'
        : 'PULL ↓ — OR PRESS ENTER / G <span class="zh" lang="zh">施加重力</span>';
      live.textContent = on
        ? 'Gravity on. The headline has collapsed into a heap. Pull the lever again to restore it.'
        : 'Gravity off. The headline is reassembling.';
    }

    function fail() {
      attempts++;
      setPull(0);
      btn.classList.remove('shake');
      void btn.offsetWidth;
      btn.classList.add('shake');
      hint.classList.add('warn');
      hint.innerHTML = 'PULL HARDER. GRAVITY IS HEAVY. <span class="zh" lang="zh">再用力一点</span>';
      live.textContent = 'Not enough pull. Gravity is heavy — pull the lever down harder, or press Enter to toggle.';
    }

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true;
      startY = e.clientY;
      maxVel = 0;
      samples = [{ y: e.clientY, t: performance.now() }];
      btn.classList.add('dragging');
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* older engines */ }
      e.preventDefault();
    });

    btn.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      setPull(clamp(e.clientY - startY, 0, ON_PULL + 6));
      const t = performance.now();
      const prev = samples[samples.length - 1];
      if (prev) maxVel = Math.max(maxVel, (e.clientY - prev.y) / Math.max(1, t - prev.t));
      samples.push({ y: e.clientY, t });
      if (samples.length > 10) samples.shift();
    });

    function release(e) {
      if (!dragging) return;
      dragging = false;
      btn.classList.remove('dragging');
      const raw = e.clientY - startY;
      const now = performance.now();
      const t0 = samples.length ? samples[0].t : now;
      // A tap, not a pull: let the click event toggle. This is also how
      // screen-reader double-taps and synthesized AT clicks get through.
      if (Math.abs(raw) < 6 && now - t0 < 300) {
        setPull(on ? ON_PULL : 0);
        return;
      }
      suppressClickUntil = now + 400;
      const recent = samples.filter((s) => now - s.t < 130);
      let vel = 0;
      if (recent.length >= 2) {
        const a = recent[0], b = recent[recent.length - 1];
        vel = (b.y - a.y) / Math.max(1, b.t - a.t);
      }
      if (on) { apply(false); return; }
      // Peak drag velocity counts too — a fast full pull that pauses at the
      // stop before release is still an earned pull.
      const earned = raw >= 48 && Math.max(vel, maxVel) >= 0.5;
      const mercy = attempts >= 2;
      if (REDUCED ? raw >= 4 : (earned || mercy)) apply(true);
      else fail();
    }

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', () => {
      dragging = false;
      btn.classList.remove('dragging');
      setPull(on ? ON_PULL : 0);
    });

    // Keyboard (Enter / Space, detail 0), plain clicks, and AT-synthesized
    // clicks all run the full sequence; drag-generated clicks are suppressed.
    btn.addEventListener('click', () => {
      if (performance.now() < suppressClickUntil) return;
      apply(!on);
    });

    // The nav keycap is honest: it is a real button, and the bare G shortcut
    // stays scoped to while the playroom is on screen.
    document.getElementById('keycapG').addEventListener('click', () => apply(!on));
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return;
      if ((e.key === 'g' || e.key === 'G') && heroEngine.isVisible()) apply(!on);
    });

    return { toggle: () => apply(!on) };
  })();

  /* ---------- Custom cursor + magnetics (fine pointers only) ---------- */

  if (FINE && !REDUCED) {
    const dot = document.getElementById('cursorDot');
    const ring = document.getElementById('cursorRing');
    let rx = -1000, ry = -1000;
    let lastX = null, lastY = null;

    scheduler.add((dt, f) => {
      const settled = Math.abs(rx - pointer.x) < 0.05 && Math.abs(ry - pointer.y) < 0.05;
      if (pointer.x === lastX && pointer.y === lastY && settled) return;
      lastX = pointer.x; lastY = pointer.y;
      dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      const t = 1 - Math.pow(1 - 0.16, f);
      rx = lerp(rx, pointer.x, t);
      ry = lerp(ry, pointer.y, t);
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    });

    document.addEventListener('pointerover', (e) => {
      const el = e.target instanceof Element
        ? e.target.closest('a, button, .card, .keycap')
        : null;
      ring.classList.toggle('is-hover', !!el);
    });

    const magnets = [...document.querySelectorAll('[data-magnetic]')]
      .map((el) => ({ el, x: 0, y: 0, vx: 0, vy: 0, rect: null }));
    let lastMX = null, lastMY = null;
    scheduler.add((dt, f) => {
      // Sleep while the pointer is still and every spring has settled.
      if (pointer.x === lastMX && pointer.y === lastMY &&
          magnets.every((m) =>
            Math.abs(m.x) + Math.abs(m.y) + Math.abs(m.vx) + Math.abs(m.vy) < 0.05)) return;
      lastMX = pointer.x; lastMY = pointer.y;
      // Read pass, then write pass — no interleaved layout flushes.
      for (const m of magnets) m.rect = m.el.getBoundingClientRect();
      for (const m of magnets) {
        const r = m.rect;
        const cx = r.left + r.width / 2 - m.x;
        const cy = r.top + r.height / 2 - m.y;
        const inX = Math.abs(pointer.x - cx) < r.width / 2 + 34;
        const inY = Math.abs(pointer.y - cy) < r.height / 2 + 34;
        const tx = pointer.active && inX && inY ? (pointer.x - cx) * 0.28 : 0;
        const ty = pointer.active && inX && inY ? (pointer.y - cy) * 0.28 : 0;
        m.vx += (tx - m.x) * 0.18 * f;
        m.vy += (ty - m.y) * 0.18 * f;
        const damp = Math.pow(0.72, f);
        m.vx *= damp; m.vy *= damp;
        m.x += m.vx * f; m.y += m.vy * f;
        m.el.style.transform =
          `translate(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px)`;
      }
    });
  }

  /* ---------- Marquee + scroll velocity ---------- */

  const scroll = { vel: 0, last: window.scrollY };
  scheduler.add(() => {
    const y = window.scrollY;
    scroll.vel = lerp(scroll.vel, y - scroll.last, 0.15);
    scroll.last = y;
  });

  let marqueeMeasure = () => {};

  (() => {
    const track = document.getElementById('marqueeTrack');
    const first = track.firstElementChild;
    let itemW = 0;
    let offset = 0;
    let skew = 0;
    let vis = true;

    function measure() {
      itemW = first.getBoundingClientRect().width || 1;
      const need = Math.max(2, Math.ceil((innerWidth * 2) / itemW) + 1);
      while (track.children.length < need)
        track.appendChild(first.cloneNode(true));
    }
    measure();

    if (!REDUCED) {
      onVisible(track.parentElement, (v) => { vis = v; });
      scheduler.add((dt, f) => {
        if (!vis) return;
        offset -= (0.9 + Math.min(Math.abs(scroll.vel) * 0.12, 6)) * f;
        if (offset <= -itemW) offset += itemW;
        skew = lerp(skew, clamp(scroll.vel * 0.5, -6, 6), 0.12 * f);
        track.style.transform =
          `translate3d(${offset.toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
      });
    }

    marqueeMeasure = measure;
  })();

  /* ---------- Toy: soft-body blob ---------- */

  const blob = (() => {
    const canvas = document.getElementById('blobCanvas');
    const ctx = canvas.getContext('2d');
    const N = 12;
    let d = 1, w = 0, h = 0, r0 = 0;
    let pageLeft = 0, pageTop = 0;
    let pts = [];
    let vis = false;

    function build() {
      d = fitCanvas(canvas);
      const rect = canvas.getBoundingClientRect();
      pageLeft = rect.left + window.scrollX;
      pageTop = rect.top + window.scrollY;
      w = canvas.width; h = canvas.height;
      r0 = Math.min(w, h) * 0.28;
      pts = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const x = w / 2 + Math.cos(a) * r0;
        const y = h / 2 + Math.sin(a) * r0;
        pts.push({ x, y, px: x, py: y, a, phase: Math.random() * Math.PI * 2 });
      }
      draw();
    }

    function tick(dt, f, now) {
      if (!vis || REDUCED) return;
      const mx = (pointer.x - (pageLeft - window.scrollX)) * d;
      const my = (pointer.y - (pageTop - window.scrollY)) * d;
      const inCanvas = pointer.active &&
        mx > 0 && mx < w && my > 0 && my < h;

      for (const p of pts) {
        const wob = 1 + 0.07 * Math.sin(now * 0.0022 + p.phase);
        const tx = w / 2 + Math.cos(p.a) * r0 * wob;
        const ty = h / 2 + Math.sin(p.a) * r0 * wob;
        const vx = (p.x - p.px) * 0.96;
        const vy = (p.y - p.py) * 0.96;
        p.px = p.x; p.py = p.y;
        p.x += vx + (tx - p.x) * 0.03 * f;
        p.y += vy + (ty - p.y) * 0.03 * f;
        if (inCanvas) {
          const dx = p.x - mx, dy = p.y - my;
          const dist = Math.hypot(dx, dy);
          const R = 60 * d;
          if (dist < R) {
            p.x += (dx / (dist || 1)) * (R - dist) * 0.22;
            p.y += (dy / (dist || 1)) * (R - dist) * 0.22;
          }
        }
      }
      const rest = 2 * r0 * Math.sin(Math.PI / N);
      for (let iter = 0; iter < 2; iter++)
        for (let i = 0; i < N; i++)
          constrain(pts[i], pts[(i + 1) % N], rest, 0.5);

      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const p0 = pts[i % N];
        const p1 = pts[(i + 1) % N];
        const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
        if (i === 0) ctx.moveTo(midX, midY);
        else ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(242, 239, 230, 0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(242, 239, 230, 0.9)';
      ctx.lineWidth = 1.5 * d;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 2.5 * d, 0, Math.PI * 2);
      ctx.fillStyle = LIME;
      ctx.fill();
    }

    function handleResize() {
      const rect = canvas.getBoundingClientRect();
      const dd = dprNow();
      if (Math.round(rect.width * dd) === canvas.width &&
          Math.round(rect.height * dd) === canvas.height) {
        pageLeft = rect.left + window.scrollX;
        pageTop = rect.top + window.scrollY;
        return;
      }
      build();
    }

    build();
    onVisible(canvas, (v) => { vis = v; });
    scheduler.add(tick);
    return { resize: handleResize };
  })();

  /* ---------- Toy: rope study ---------- */

  const rope = (() => {
    const canvas = document.getElementById('ropeCanvas');
    const ctx = canvas.getContext('2d');
    const SEG = 18;
    let d = 1, w = 0, h = 0, segLen = 10;
    let pageLeft = 0, pageTop = 0;
    let pts = [];
    let vis = false;

    function build() {
      d = fitCanvas(canvas);
      const rect = canvas.getBoundingClientRect();
      pageLeft = rect.left + window.scrollX;
      pageTop = rect.top + window.scrollY;
      w = canvas.width; h = canvas.height;
      segLen = (h * 0.55) / SEG;
      pts = [];
      for (let i = 0; i <= SEG; i++) {
        const x = w / 2, y = h * 0.2 + i * segLen;
        pts.push({ x, y, px: x, py: y });
      }
      draw();
    }

    function tick(dt, f, now) {
      if (!vis || REDUCED) return;
      const mx = (pointer.x - (pageLeft - window.scrollX)) * d;
      const my = (pointer.y - (pageTop - window.scrollY)) * d;
      const inCanvas = pointer.active &&
        mx > -40 && mx < w + 40 && my > -40 && my < h + 40;
      const head = pts[0];
      const tx = inCanvas ? mx : w / 2 + Math.sin(now * 0.0012) * w * 0.2;
      const ty = inCanvas ? my : h * 0.22 + Math.sin(now * 0.0019) * 12 * d;
      head.x = lerp(head.x, tx, clamp(0.35 * f, 0, 1));
      head.y = lerp(head.y, ty, clamp(0.35 * f, 0, 1));
      head.px = head.x; head.py = head.y;

      for (let i = 1; i <= SEG; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.985;
        const vy = (p.y - p.py) * 0.985;
        p.px = p.x; p.py = p.y;
        p.x += vx;
        p.y += vy + 0.35 * d * f;
      }
      for (let iter = 0; iter < 2; iter++)
        for (let i = 0; i < SEG; i++)
          constrain(pts[i], pts[i + 1], segLen, i === 0 ? 1 : 0.5);

      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= SEG; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = 'rgba(242, 239, 230, 0.9)';
      ctx.lineWidth = 2 * d;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      const tip = pts[SEG];
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 3 * d, 0, Math.PI * 2);
      ctx.fillStyle = LIME;
      ctx.fill();
    }

    function handleResize() {
      const rect = canvas.getBoundingClientRect();
      const dd = dprNow();
      if (Math.round(rect.width * dd) === canvas.width &&
          Math.round(rect.height * dd) === canvas.height) {
        pageLeft = rect.left + window.scrollX;
        pageTop = rect.top + window.scrollY;
        return;
      }
      build();
    }

    build();
    onVisible(canvas, (v) => { vis = v; });
    scheduler.add(tick);
    return { resize: handleResize };
  })();

  /* ---------- Toy: specular tilt card ---------- */

  (() => {
    const card = document.getElementById('tiltCard');
    if (REDUCED) return;
    let trx = 0, tryy = 0, crx = 0, cry = 0;
    let tmx = 50, tmy = 50, cmx = 50, cmy = 50;
    let active = false;

    if (FINE) {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
        const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
        tryy = (nx - 0.5) * 20;
        trx = -(ny - 0.5) * 20;
        tmx = nx * 100; tmy = ny * 100;
        active = true;
      });
      card.addEventListener('pointerleave', () => {
        trx = 0; tryy = 0;
        active = true;
      });
      scheduler.add((dt, f) => {
        if (!active) return;
        const t = 1 - Math.pow(1 - 0.14, f);
        crx = lerp(crx, trx, t); cry = lerp(cry, tryy, t);
        cmx = lerp(cmx, tmx, t); cmy = lerp(cmy, tmy, t);
        card.style.setProperty('--rx', crx.toFixed(2) + 'deg');
        card.style.setProperty('--ry', cry.toFixed(2) + 'deg');
        card.style.setProperty('--mx', cmx.toFixed(2) + '%');
        card.style.setProperty('--my', cmy.toFixed(2) + '%');
        if (Math.abs(crx - trx) + Math.abs(cry - tryy) < 0.01 &&
            Math.abs(cmx - tmx) + Math.abs(cmy - tmy) < 0.05) active = false;
      });
    } else {
      // Touch: a tap sweeps the sheen across the card.
      card.addEventListener('click', () => {
        card.classList.add('sweep');
        tmx = -20;
        const t0 = performance.now();
        const sweep = (now) => {
          const t = Math.min(1, (now - t0) / 700);
          card.style.setProperty('--mx', (-20 + t * 140).toFixed(1) + '%');
          card.style.setProperty('--my', '40%');
          if (t < 1) requestAnimationFrame(sweep);
          else card.classList.remove('sweep');
        };
        requestAnimationFrame(sweep);
      });
    }
  })();

  /* ---------- Scroll cue: a dot on a string ---------- */

  const cue = (() => {
    const canvas = document.getElementById('cueCanvas');
    if (!canvas || REDUCED) return { resize: () => {} };
    const ctx = canvas.getContext('2d');
    const SEG = 5;
    let d = 1, w = 0, h = 0, segLen = 10;
    let pts = [];
    let vis = true;

    function build() {
      d = fitCanvas(canvas);
      w = canvas.width; h = canvas.height;
      segLen = (h * 0.62) / SEG;
      pts = [];
      for (let i = 0; i <= SEG; i++) {
        const x = w / 2, y = i * segLen + 2 * d;
        pts.push({ x, y, px: x, py: y });
      }
    }

    function tick(dt, f, now) {
      if (!vis) return;
      const sway = Math.sin(now * 0.002) * 0.06 * d;
      pts[0].x = w / 2; pts[0].y = 2 * d;
      for (let i = 1; i <= SEG; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.98;
        const vy = (p.y - p.py) * 0.98;
        p.px = p.x; p.py = p.y;
        p.x += vx + sway * (i / SEG) + scroll.vel * 0.004 * i * d;
        p.y += vy + 0.3 * d * f;
      }
      for (let iter = 0; iter < 2; iter++)
        for (let i = 0; i < SEG; i++)
          constrain(pts[i], pts[i + 1], segLen, i === 0 ? 1 : 0.5);

      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= SEG; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = 'rgba(153, 160, 173, 0.55)';
      ctx.lineWidth = 1 * d;
      ctx.stroke();
      const tip = pts[SEG];
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 2.5 * d, 0, Math.PI * 2);
      ctx.fillStyle = LIME;
      ctx.fill();
    }

    function handleResize() {
      const rect = canvas.getBoundingClientRect();
      const dd = dprNow();
      if (Math.round(rect.width * dd) === canvas.width &&
          Math.round(rect.height * dd) === canvas.height) return;
      build();
    }

    build();
    onVisible(canvas, (v) => { vis = v; });
    scheduler.add(tick);
    return { resize: handleResize };
  })();

  /* ---------- Stats: count-up, then live numbers ---------- */

  (() => {
    const statsEl = document.querySelector('.stats');
    const nums = [...document.querySelectorAll('.stat-num')];
    const particlesEl = document.getElementById('statParticles');
    const fpsEl = document.getElementById('statFps');
    const fmt = (n) => Math.round(n).toLocaleString('en-US');
    let liveStarted = false;

    function goLive() {
      if (liveStarted) return;
      liveStarted = true;
      let acc = 0;
      scheduler.add((dt) => {
        acc += dt;
        if (acc < 500) return;
        acc = 0;
        particlesEl.textContent = fmt(heroEngine.count());
        fpsEl.textContent = fmt(clamp(scheduler.fps, 0, 120));
      });
    }

    if (REDUCED) {
      particlesEl.textContent = fmt(heroEngine.count());
      return;
    }

    const io = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      io.disconnect();
      const t0 = performance.now();
      const targets = nums.map((el) => {
        let v = parseFloat(el.dataset.count || '0');
        if (el === particlesEl) v = heroEngine.count();
        if (el === fpsEl) v = clamp(scheduler.fps, 0, 120);
        return v;
      });
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 900);
        const e = 1 - Math.pow(1 - t, 3);
        nums.forEach((el, i) => { el.textContent = fmt(targets[i] * e); });
        if (t < 1) requestAnimationFrame(step);
        else goLive();
      };
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    io.observe(statsEl);
  })();

  /* ---------- Manifesto: word-by-word reveal ---------- */

  (() => {
    const p = document.getElementById('manifestoText');
    const quote = p.closest('.manifesto-quote');
    const text = p.textContent.replace(/\s+/g, ' ').trim();

    const sr = document.createElement('p');
    sr.className = 'sr-only';
    sr.textContent = text;
    quote.insertBefore(sr, p);
    p.setAttribute('aria-hidden', 'true');
    p.innerHTML = text.split(' ').map((word, i) =>
      `<span class="m-word"><span class="m-inner" style="--i:${i}">${esc(word)}</span></span>`
    ).join(' ');

    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        quote.classList.add('in');
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(quote);
  })();

  /* ---------- Generic reveal on scroll ---------- */

  (() => {
    const els = [...document.querySelectorAll('.reveal')];
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      }
    }, { threshold: 0.2 });
    els.forEach((el) => io.observe(el));
  })();

  /* ---------- Konami: for emergencies ---------- */

  (() => {
    const seq = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown',
                 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    let i = 0;
    let timer = 0;
    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      i = k === seq[i] ? i + 1 : (k === seq[0] ? 1 : 0);
      if (i === seq.length) {
        i = 0;
        html.classList.add('konami');
        heroEngine.burst();
        clearTimeout(timer);
        timer = setTimeout(() => html.classList.remove('konami'), 3000);
      }
    });
  })();

  /* ---------- Resize ---------- */

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      heroEngine.resize();
      blob.resize();
      rope.resize();
      cue.resize();
      marqueeMeasure();
    }, 180);
  });

})();

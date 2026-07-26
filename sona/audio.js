/* ==========================================================================
   SONA · 流声 — 生成式音频引擎(框架无关,零音频文件)
   每首曲目 = 种子 → 调性/速度/和弦进行/旋律模式,WebAudio 实时合成。
   ========================================================================== */

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Deterministic per-(track, bar, step) randomness so seeking is stable.
const hashRand = (seed, bar, step, salt) =>
  mulberry32(seed * 374761393 + bar * 668265263 + step * 2246822519 + salt * 3266489917)();

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const SCALES = {
  minor: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 7, 9],
};
const PROGS = {
  minor: [0, 8, 3, 10],   // i  VI  III  VII
  major: [0, 9, 5, 7],    // I  vi  IV   V
};
const MOODS = {
  calm:   { bpm: [72, 84],   scale: 'minor', density: 0.45, drums: false },
  bright: { bpm: [92, 104],  scale: 'major', density: 0.6,  drums: true },
  drive:  { bpm: [106, 118], scale: 'minor', density: 0.7,  drums: true },
};

export function createEngine() {
  let ctx = null;
  let master, comp, analyser, delaySend, delayNode, delayFb, delayFilter;
  let seg = null;              // per-playback-segment gain: killed on pause/seek
  let noiseBuf = null;

  let track = null;
  let plan = null;             // derived musical plan for the loaded track
  let playing = false;
  let startedAt = 0;           // ctx time anchoring position 0
  let pausedAt = 0;            // seconds into the track while paused
  let step = 0;                // global 8th-note counter
  let nextStepTime = 0;
  let tickTimer = 0;
  let volume = 0.8;
  let endedCb = null;

  /* ---------- graph ---------- */

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume * volume;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;

    // send: feedback delay through a lowpass = cheap, soft space
    delayNode = ctx.createDelay(1);
    delayNode.delayTime.value = 0.28;
    delayFb = ctx.createGain();
    delayFb.gain.value = 0.34;
    delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1600;
    delayNode.connect(delayFilter);
    delayFilter.connect(delayFb);
    delayFb.connect(delayNode);
    delaySend = ctx.createGain();
    delaySend.gain.value = 0.25;
    delaySend.connect(delayNode);
    delayFilter.connect(comp);

    comp.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function newSeg() {
    seg = ctx.createGain();
    seg.connect(comp);
    seg.connect(delaySend);
  }

  function killSeg() {
    if (!seg) return;
    const g = seg;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    setTimeout(() => { try { g.disconnect(); } catch (_) { /* already gone */ } }, 120);
    seg = null;
  }

  /* ---------- musical plan ---------- */

  function makePlan(t) {
    const rnd = mulberry32(t.seed);
    const mood = MOODS[t.mood] || MOODS.calm;
    const bpm = mood.bpm[0] + Math.round(rnd() * (mood.bpm[1] - mood.bpm[0]));
    return {
      seed: t.seed,
      bpm,
      stepDur: 60 / bpm / 2,          // 8th note
      root: 55 + Math.round(rnd() * 7),
      scale: SCALES[mood.scale],
      prog: PROGS[mood.scale],
      density: mood.density,
      drums: mood.drums,
    };
  }

  /* ---------- voices ---------- */

  function env(g, at, a, peak, rel) {
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + a);
    g.gain.setTargetAtTime(0, at + a, rel);
  }

  function osc(type, freq, at, dur, peak, attack, rel, detune = 0, dest = null) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    env(g, at, attack, peak, rel);
    o.connect(g);
    g.connect(dest || seg);
    o.start(at);
    o.stop(at + dur);
  }

  function padChord(rootMidi, at, barDur) {
    // open voicing: root + fifth + octave — consonant under any pentatonic line
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 850;
    lp.connect(seg);
    for (const off of [0, 7, 12]) {
      const f = midiHz(rootMidi + off);
      osc('sawtooth', f, at, barDur * 2.1, 0.05, barDur * 0.5, barDur * 0.7, -6, lp);
      osc('sawtooth', f, at, barDur * 2.1, 0.05, barDur * 0.5, barDur * 0.7, 6, lp);
    }
  }

  function pluck(midi, at, gain) {
    osc('triangle', midiHz(midi), at, 0.6, gain, 0.004, 0.09);
    osc('sine', midiHz(midi + 12), at, 0.4, gain * 0.3, 0.004, 0.05);
  }

  function bass(midi, at) {
    osc('sine', midiHz(midi - 24), at, 0.55, 0.22, 0.01, 0.14);
  }

  function kick(at) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(105, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.09);
    const g = ctx.createGain();
    env(g, at, 0.002, 0.5, 0.06);
    o.connect(g); g.connect(seg);
    o.start(at); o.stop(at + 0.25);
  }

  function hat(at, gain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    env(g, at, 0.001, gain, 0.012);
    src.connect(hp); hp.connect(g); g.connect(seg);
    src.start(at); src.stop(at + 0.06);
  }

  /* ---------- scheduler (lookahead pattern) ---------- */

  function scheduleStep(s, at) {
    const p = plan;
    const bar = Math.floor(s / 8);
    const sub = s % 8;
    const chordRoot = p.root + p.prog[Math.floor(bar / 2) % p.prog.length];

    if (sub === 0) {
      padChord(chordRoot, at, p.stepDur * 8);
      bass(chordRoot, at);
    }
    if (sub === 4) bass(chordRoot + (hashRand(p.seed, bar, sub, 5) < 0.4 ? 7 : 0), at);

    // melody: seeded per-step choice from the pentatonic scale over the chord
    if (hashRand(p.seed, bar, sub, 1) < p.density) {
      const deg = Math.floor(hashRand(p.seed, bar, sub, 2) * p.scale.length);
      const oct = hashRand(p.seed, bar, sub, 3) < 0.25 ? 24 : 12;
      const gain = 0.16 + hashRand(p.seed, bar, sub, 4) * 0.08;
      pluck(chordRoot + p.scale[deg] + oct, at, gain);
    }

    if (p.drums) {
      if (sub % 2 === 1) hat(at, 0.035 + (sub === 7 ? 0.02 : 0));
      if (sub === 0 || sub === 4) kick(at);
      else if (sub === 6 && hashRand(p.seed, bar, sub, 6) < 0.3) kick(at);
    } else if (sub === 2 || sub === 6) {
      hat(at, 0.018);
    }
  }

  function tick() {
    if (!playing) return;
    const now = ctx.currentTime;
    while (nextStepTime < now + 0.16) {
      scheduleStep(step, Math.max(nextStepTime, now + 0.005));
      step++;
      nextStepTime += plan.stepDur;
    }
    if (getTime() >= track.dur) {
      const cb = endedCb;
      stopPlayback();
      pausedAt = 0;
      if (cb) cb();
    }
  }

  function startScheduler() {
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 40);
  }

  function stopPlayback() {
    playing = false;
    clearInterval(tickTimer);
    killSeg();
  }

  /* ---------- public API ---------- */

  function getTime() {
    if (!ctx || !track) return 0;
    return playing ? Math.min(ctx.currentTime - startedAt, track.dur) : pausedAt;
  }

  function startAt(sec) {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    killSeg();
    newSeg();
    startedAt = ctx.currentTime - sec;
    step = Math.floor(sec / plan.stepDur);
    nextStepTime = ctx.currentTime + 0.04;
    playing = true;
    startScheduler();
  }

  return {
    load(t, { autoplay = false } = {}) {
      const wasPlaying = playing || autoplay;
      if (ctx) stopPlayback();
      track = t;
      plan = makePlan(t);
      pausedAt = 0;
      if (wasPlaying) startAt(0);
    },
    play() {
      if (!track || playing) return;
      startAt(pausedAt);
    },
    pause() {
      if (!playing) return;
      pausedAt = getTime();
      stopPlayback();
    },
    toggle() { playing ? this.pause() : this.play(); },
    seek(sec) {
      if (!track) return;
      const s = Math.max(0, Math.min(sec, track.dur - 0.1));
      if (playing) startAt(s);
      else pausedAt = s;
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(volume * volume, ctx.currentTime, 0.03);
    },
    getVolume: () => volume,
    getTime,
    getDuration: () => (track ? track.dur : 0),
    isPlaying: () => playing,
    getTrack: () => track,
    onEnded(cb) { endedCb = cb; },
    getAnalyser: () => analyser || null,
  };
}

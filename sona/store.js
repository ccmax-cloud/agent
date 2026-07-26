/* ==========================================================================
   SONA · 流声 — 状态中心(框架无关)
   实现 DESIGN.md「播放语义」契约与 TECH.md §4/§6 的数据规则。
   队列为「条目」模型:sourceQueue/playOrder 存唯一条目 id(eid),
   entries 映射 eid→trackId —— 同曲可多次入队而互不混淆。
   ========================================================================== */

import { TRACKS } from './data.js';
import { LIMITS } from './flags.js';

let eidSeq = 1;
const newEid = () => 'e' + (eidSeq++);
const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function createStore({ engine, persist, flags, now = () => Date.now() }) {
  const saved = persist ? persist.loadAll() : { readOnly: false, playlists: [], tracks: [], player: null };

  const state = {
    player: {
      entries: {},          // eid -> trackId
      sourceQueue: [],      // 手动顺序(eid[])
      playOrder: [],        // 实际播放顺序(eid[])
      index: -1,
      playing: false,
      shuffle: false,
      repeat: 'off',        // 'off' | 'all' | 'one'
      volume: 0.8,
    },
    library: {
      userTracks: saved.tracks || [],
      userPlaylists: saved.playlists || [],
    },
    readOnly: !!saved.readOnly,
  };

  const listeners = new Set();
  const notifyCbs = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));
  const notify = (msg) => notifyCbs.forEach((fn) => fn(msg));

  /* ---------- 引用完整性:唯一解引用入口 ---------- */

  const resolve = (trackId) =>
    TRACKS.find((t) => t.id === trackId) ||
    state.library.userTracks.find((t) => t.id === trackId) ||
    null;

  /* ---------- 持久化双通道 ---------- */

  const saveUserData = () => {
    if (!persist || state.readOnly) return;
    const ok1 = persist.savePlaylists(state.library.userPlaylists);
    const ok2 = persist.saveTracks(state.library.userTracks);
    if (!(ok1 && ok2)) notify({ type: 'warn', text: '本次更改不会被保存(存储不可用)' });
  };

  let playerSaveTimer = 0;
  const playerSnapshot = () => ({
    entries: state.player.entries,
    sourceQueue: state.player.sourceQueue,
    playOrder: state.player.playOrder,
    index: state.player.index,
    shuffle: state.player.shuffle,
    repeat: state.player.repeat,
    volume: state.player.volume,
  });
  const savePlayerDebounced = () => {
    if (!persist || state.readOnly) return;
    clearTimeout(playerSaveTimer);
    playerSaveTimer = setTimeout(() => persist.savePlayer(playerSnapshot()), 300);
  };
  const flush = () => {
    if (!persist || state.readOnly) return;
    clearTimeout(playerSaveTimer);
    persist.savePlayer(playerSnapshot());
  };

  /* ---------- 队列内部工具 ---------- */

  const p = state.player;
  const currentEid = () => (p.index >= 0 && p.index < p.playOrder.length ? p.playOrder[p.index] : null);
  const currentTrack = () => {
    const eid = currentEid();
    return eid ? resolve(p.entries[eid]) : null;
  };

  function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function loadCurrent({ autoplay }) {
    const t = currentTrack();
    if (!t) { stopAll(); return; }
    if (engine) engine.load(t, { autoplay });
    p.playing = autoplay;
  }

  function stopAll() {
    p.playing = false;
    p.index = p.playOrder.length ? Math.min(p.index, p.playOrder.length - 1) : -1;
    if (engine && engine.pause) engine.pause();
  }

  /* ---------- 自然播完(engine.onEnded 接这里) ---------- */

  function handleEnded() {
    if (p.repeat === 'one') {
      if (engine) { engine.seek(0); engine.play(); }
      p.playing = true;
    } else if (p.index < p.playOrder.length - 1) {
      p.index++;
      loadCurrent({ autoplay: true });
    } else if (p.repeat === 'all' && p.playOrder.length) {
      p.index = 0;
      loadCurrent({ autoplay: true });
    } else {
      stopAll();  // repeat off:停止,停留末曲
    }
    savePlayerDebounced();
    emit();
  }
  if (engine && engine.onEnded) engine.onEnded(handleEnded);

  /* ---------- actions ---------- */

  const actions = {

    /* --- 播放上下文 --- */

    // 播放歌单/列表 = 替换整个队列,从被点击曲目起播
    playContext(trackIds, startIndex = 0) {
      const ids = trackIds.filter((id) => resolve(id));
      if (!ids.length) return;
      p.entries = {};
      p.sourceQueue = ids.map((tid) => {
        const eid = newEid();
        p.entries[eid] = tid;
        return eid;
      });
      const startEid = p.sourceQueue[Math.min(startIndex, p.sourceQueue.length - 1)];
      if (p.shuffle) {
        const rest = p.sourceQueue.filter((e) => e !== startEid);
        p.playOrder = [startEid, ...shuffled(rest)];
        p.index = 0;
      } else {
        p.playOrder = [...p.sourceQueue];
        p.index = p.playOrder.indexOf(startEid);
      }
      loadCurrent({ autoplay: true });
      savePlayerDebounced();
      emit();
    },

    togglePlay() {
      if (!currentTrack()) return;
      p.playing = !p.playing;
      if (engine) engine.toggle();
      savePlayerDebounced();
      emit();
    },

    seek(sec) { if (engine) engine.seek(sec); },

    setVolume(v) {
      p.volume = Math.max(0, Math.min(1, v));
      if (engine) engine.setVolume(p.volume);
      savePlayerDebounced();
      emit();
    },

    // 手动 next:repeat=one 也切曲(手动操作尊重用户意图)
    next() {
      if (!p.playOrder.length) return;
      if (p.index < p.playOrder.length - 1) {
        p.index++;
        loadCurrent({ autoplay: true });
      } else if (p.repeat === 'all' || p.repeat === 'one') {
        p.index = 0;
        loadCurrent({ autoplay: true });
      } else {
        stopAll();  // off + 末尾:停止,停留末曲
      }
      savePlayerDebounced();
      emit();
    },

    // prev:已播 >3s 回本曲 0s;≤3s 上一首(首曲则回 0s)
    prev() {
      if (!p.playOrder.length) return;
      const t = engine ? engine.getTime() : 0;
      if (t > 3 || p.index === 0) {
        if (engine) { engine.seek(0); if (!p.playing) { engine.play(); p.playing = true; } }
      } else {
        p.index--;
        loadCurrent({ autoplay: true });
      }
      savePlayerDebounced();
      emit();
    },

    setShuffle(on) {
      if (p.shuffle === !!on) return;
      p.shuffle = !!on;
      const cur = currentEid();
      if (on) {
        const rest = p.sourceQueue.filter((e) => e !== cur);
        p.playOrder = cur ? [cur, ...shuffled(rest)] : shuffled(p.sourceQueue);
        p.index = cur ? 0 : (p.playOrder.length ? 0 : -1);
      } else {
        p.playOrder = [...p.sourceQueue];
        p.index = cur ? p.playOrder.indexOf(cur) : (p.playOrder.length ? 0 : -1);
      }
      savePlayerDebounced();
      emit();
    },

    cycleRepeat() {
      p.repeat = { off: 'all', all: 'one', one: 'off' }[p.repeat];
      savePlayerDebounced();
      emit();
    },

    /* --- 队列编辑 --- */

    queueAdd(trackId) {                       // 追加到末尾
      if (!resolve(trackId)) return;
      const eid = newEid();
      p.entries[eid] = trackId;
      p.sourceQueue.push(eid);
      p.playOrder.push(eid);
      if (p.index === -1) { p.index = 0; loadCurrent({ autoplay: false }); }
      savePlayerDebounced();
      emit();
    },

    queueAddNext(trackId) {                   // 插入当前曲之后
      if (!resolve(trackId)) return;
      const eid = newEid();
      p.entries[eid] = trackId;
      const cur = currentEid();
      p.playOrder.splice(p.index + 1, 0, eid);
      const si = cur ? p.sourceQueue.indexOf(cur) : -1;
      p.sourceQueue.splice(si + 1, 0, eid);
      if (p.index === -1) { p.index = 0; loadCurrent({ autoplay: false }); }
      savePlayerDebounced();
      emit();
    },

    queueRemove(pos) {                        // pos 为 playOrder 位置
      if (pos < 0 || pos >= p.playOrder.length) return;
      const eid = p.playOrder[pos];
      p.playOrder.splice(pos, 1);
      p.sourceQueue.splice(p.sourceQueue.indexOf(eid), 1);
      delete p.entries[eid];
      if (pos === p.index) {
        if (p.playOrder.length) {
          p.index = Math.min(pos, p.playOrder.length - 1);
          loadCurrent({ autoplay: p.playing });
        } else {
          p.index = -1;
          stopAll();
        }
      } else if (pos < p.index) p.index--;
      savePlayerDebounced();
      emit();
    },

    queueReorder(from, to) {                  // 编辑 playOrder;随机关闭时镜像到手动顺序
      if (from === to || from < 0 || from >= p.playOrder.length) return;
      const [eid] = p.playOrder.splice(from, 1);
      p.playOrder.splice(to, 0, eid);
      if (from === p.index) p.index = to;
      else if (from < p.index && to >= p.index) p.index--;
      else if (from > p.index && to <= p.index) p.index++;
      if (!p.shuffle) p.sourceQueue = [...p.playOrder];
      savePlayerDebounced();
      emit();
    },

    queueClear() {                            // 确认后调用:停止播放
      p.entries = {};
      p.sourceQueue = [];
      p.playOrder = [];
      p.index = -1;
      stopAll();
      savePlayerDebounced();
      emit();
    },

    /* --- 歌单 CRUD(用户数据:同步直写) --- */

    playlistCreate(name, desc = '', hue = 220) {
      const count = state.library.userPlaylists.length;
      if (flags && !flags.canCreatePlaylist(count)) {
        notify({ type: 'limit', kind: 'playlists', text: `免费层最多 ${LIMITS.free.playlists} 个歌单` });
        return null;
      }
      if (!name || !name.trim()) return null;
      const pl = { id: newId('up'), name: name.trim(), desc, hue,
                   trackIds: [], createdAt: now(), updatedAt: now() };
      state.library.userPlaylists.push(pl);
      saveUserData();
      emit();
      return pl;
    },

    playlistRename(id, name) {
      const pl = state.library.userPlaylists.find((x) => x.id === id);
      if (!pl || !name || !name.trim()) return;
      pl.name = name.trim();
      pl.updatedAt = now();
      saveUserData();
      emit();
    },

    playlistDelete(id) {
      const i = state.library.userPlaylists.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const [removed] = state.library.userPlaylists.splice(i, 1);
      saveUserData();
      emit();
      return removed;                          // 供「撤销」Toast 使用
    },

    playlistRestore(pl, index = state.library.userPlaylists.length) {
      state.library.userPlaylists.splice(index, 0, pl);
      saveUserData();
      emit();
    },

    playlistAddTrack(plId, trackId) {
      const pl = state.library.userPlaylists.find((x) => x.id === plId);
      if (!pl || !resolve(trackId)) return;
      pl.trackIds.push(trackId);
      pl.updatedAt = now();
      saveUserData();
      emit();
    },

    playlistRemoveTrack(plId, pos) {
      const pl = state.library.userPlaylists.find((x) => x.id === plId);
      if (!pl || pos < 0 || pos >= pl.trackIds.length) return;
      pl.trackIds.splice(pos, 1);
      pl.updatedAt = now();
      saveUserData();
      emit();
    },

    playlistReorder(plId, from, to) {
      const pl = state.library.userPlaylists.find((x) => x.id === plId);
      if (!pl) return;
      const [tid] = pl.trackIds.splice(from, 1);
      pl.trackIds.splice(to, 0, tid);
      pl.updatedAt = now();
      saveUserData();
      emit();
    },

    /* --- 声音工坊:曲目管理 --- */

    trackForge({ title, mood, hue, dur, seed }) {
      const count = state.library.userTracks.length;
      if (flags && !flags.canForgeTrack(count)) {
        notify({ type: 'limit', kind: 'tracks', text: `工坊已满 · ${count}/${LIMITS.free.tracks}` });
        return null;
      }
      const t = {
        id: newId('u'),
        title: (title || '未命名').trim(),
        artist: '我', album: '我的创作',
        dur: Math.round(Math.max(60, Math.min(300, dur || 150))),
        hue: ((Math.round(hue) % 360) + 360) % 360,
        seed: Math.max(0, Math.floor(Number(seed) || 0)),
        mood: ['calm', 'bright', 'drive'].includes(mood) ? mood : 'calm',
        createdAt: now(),
      };
      state.library.userTracks.push(t);
      saveUserData();
      emit();
      return t;
    },

    trackRename(id, title) {
      const t = state.library.userTracks.find((x) => x.id === id);
      if (!t || !title || !title.trim()) return;
      t.title = title.trim();
      saveUserData();
      emit();
    },

    // 删除级联:歌单引用、队列条目、当前播放槽(TECH §4)
    trackDelete(id) {
      const i = state.library.userTracks.findIndex((x) => x.id === id);
      if (i < 0) return;
      const wasCurrent = (() => { const t = currentTrack(); return t && t.id === id; })();
      state.library.userTracks.splice(i, 1);
      for (const pl of state.library.userPlaylists) {
        const before = pl.trackIds.length;
        pl.trackIds = pl.trackIds.filter((tid) => tid !== id);
        if (pl.trackIds.length !== before) pl.updatedAt = now();
      }
      // 队列剪除(从后往前,避免位移)
      for (let pos = p.playOrder.length - 1; pos >= 0; pos--) {
        if (p.entries[p.playOrder[pos]] === id) {
          const eid = p.playOrder[pos];
          p.playOrder.splice(pos, 1);
          p.sourceQueue.splice(p.sourceQueue.indexOf(eid), 1);
          delete p.entries[eid];
          if (pos < p.index) p.index--;
          else if (pos === p.index) p.index = Math.min(p.index, p.playOrder.length - 1);
        }
      }
      if (wasCurrent) {
        if (p.playOrder.length) loadCurrent({ autoplay: p.playing });
        else { p.index = -1; stopAll(); }
      }
      saveUserData();
      savePlayerDebounced();
      emit();
    },

    /* --- 导入导出 --- */

    exportData() {
      return JSON.stringify({
        schema: 1,
        playlists: state.library.userPlaylists,
        tracks: state.library.userTracks,
      }, null, 2);
    },

    importData(json) {
      let data;
      try { data = typeof json === 'string' ? JSON.parse(json) : json; }
      catch (_) { return { ok: false, error: '不是有效的 JSON' }; }
      if (!data || data.schema !== 1) return { ok: false, error: '不支持的数据格式(schema)' };

      const report = { ok: true, tracks: 0, playlists: 0, skipped: 0, pruned: 0 };
      const idMap = {};   // oldId -> newId(冲突重生成时)
      const validMood = (m) => ['calm', 'bright', 'drive'].includes(m);

      for (const t of Array.isArray(data.tracks) ? data.tracks : []) {
        if (!t || typeof t.title !== 'string' || typeof t.seed !== 'number' ||
            typeof t.dur !== 'number' || !validMood(t.mood)) { report.skipped++; continue; }
        let id = typeof t.id === 'string' && t.id ? t.id : newId('u');
        if (resolve(id)) { const nid = newId('u'); idMap[id] = nid; id = nid; }
        state.library.userTracks.push({
          id, title: t.title, artist: '我', album: '我的创作',
          dur: Math.round(Math.max(60, Math.min(300, t.dur))),
          hue: ((Math.round(t.hue || 0) % 360) + 360) % 360,
          seed: Math.max(0, Math.floor(t.seed)), mood: t.mood,
          createdAt: t.createdAt || now(),
        });
        report.tracks++;
      }

      for (const pl of Array.isArray(data.playlists) ? data.playlists : []) {
        if (!pl || typeof pl.name !== 'string' || !Array.isArray(pl.trackIds)) { report.skipped++; continue; }
        let id = typeof pl.id === 'string' && pl.id ? pl.id : newId('up');
        if (state.library.userPlaylists.some((x) => x.id === id)) id = newId('up');
        const trackIds = pl.trackIds
          .map((tid) => idMap[tid] || tid)     // 应用 oldId→newId 映射
          .filter((tid) => resolve(tid) || (report.pruned++, false)); // 剪除悬空引用
        state.library.userPlaylists.push({
          id, name: pl.name, desc: pl.desc || '',
          hue: ((Math.round(pl.hue || 220) % 360) + 360) % 360,
          trackIds, createdAt: pl.createdAt || now(), updatedAt: now(),
        });
        report.playlists++;
      }

      saveUserData();
      emit();
      return report;
    },

    /* --- 会话恢复 --- */

    restorePlayer() {
      const sp = saved.player;
      if (!sp || !Array.isArray(sp.playOrder)) return false;
      const entries = sp.entries || {};
      // 启动清洗:剪除无法解析的条目(TECH §4)
      const alive = (eid) => entries[eid] && resolve(entries[eid]);
      const playOrder = (sp.playOrder || []).filter(alive);
      const sourceQueue = (sp.sourceQueue || []).filter(alive);
      const prunedCount = (sp.playOrder || []).length - playOrder.length;
      p.entries = {};
      playOrder.concat(sourceQueue).forEach((eid) => { p.entries[eid] = entries[eid]; });
      // eid 序列续号,避免与恢复的条目撞号
      const maxE = Math.max(0, ...Object.keys(p.entries).map((e) => parseInt(e.slice(1), 10) || 0));
      eidSeq = maxE + 1;
      p.playOrder = playOrder;
      p.sourceQueue = sourceQueue;
      p.index = Math.min(Math.max(sp.index ?? 0, 0), playOrder.length - 1);
      p.shuffle = !!sp.shuffle;
      p.repeat = ['off', 'all', 'one'].includes(sp.repeat) ? sp.repeat : 'off';
      p.volume = typeof sp.volume === 'number' ? Math.max(0, Math.min(1, sp.volume)) : 0.8;
      if (engine) engine.setVolume(p.volume);
      if (p.index >= 0) loadCurrent({ autoplay: false });
      if (prunedCount > 0) notify({ type: 'repair', text: `已清理 ${prunedCount} 条失效队列引用` });
      emit();
      return true;
    },
  };

  return {
    state,
    actions,
    resolve,
    currentTrack,
    flush,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onNotify(fn) { notifyCbs.add(fn); return () => notifyCbs.delete(fn); },
    _handleEnded: handleEnded,   // 测试钩子:模拟自然播完
  };
}

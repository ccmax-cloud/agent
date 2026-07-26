/* ==========================================================================
   SONA · 流声 — 应用装配层
   UI = SILK 组件;逻辑 = store(36 项契约测试);声音 = 生成式引擎。
   ========================================================================== */

import { createEngine } from './audio.js';
import { createStore } from './store.js';
import { createPersist } from './persist.js';
import { createFlags, LIMITS } from './flags.js';
import { TRACKS, PLAYLISTS } from './data.js';
import { LYRICS, forgeLyrics } from './lyrics.js';
import { toast, toggleTheme } from '../silk/silk.js';

const $ = (s, r = document) => r.querySelector(s);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const grad = (h) => `linear-gradient(135deg, hsl(${h} 72% 56%), hsl(${(h + 52) % 360} 82% 40%))`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- 内核 ---------- */

const engine = createEngine();
const previewEngine = createEngine();
const persist = createPersist();
let savedTier = 'free';
try { savedTier = localStorage.getItem('sona-tier') || 'free'; } catch (_) { /* */ }
const flags = createFlags(savedTier);
const store = createStore({ engine, persist, flags });

const getLyrics = (t) => LYRICS[t.id] || t.lyrics || forgeLyrics(t.seed, t.mood, t.dur);

/* ---------- 通用弹窗(Promise 化) ---------- */

function confirmDialog(title, body, okLabel = '确认') {
  return new Promise((res) => {
    const m = $('#confirmModal');
    m.querySelector('h3').textContent = title;
    $('#confirmBody').textContent = body;
    $('#confirmYes').textContent = okLabel;
    const yes = () => { cleanup(); m.close('confirm'); res(true); };
    const onClose = () => { cleanup(); res(false); };
    const cleanup = () => {
      $('#confirmYes').removeEventListener('click', yes);
      $('#confirmNo').removeEventListener('click', no);
      m.removeEventListener('close', onClose);
    };
    const no = () => m.close('cancel');
    $('#confirmYes').addEventListener('click', yes);
    $('#confirmNo').addEventListener('click', no);
    m.addEventListener('close', onClose);
    m.show();
  });
}

function promptName(title, label, initial = '') {
  return new Promise((res) => {
    const m = $('#promptModal');
    m.querySelector('h3').textContent = title;
    $('#promptLabel').textContent = label;
    const input = $('#promptInput');
    const err = $('#promptError');
    input.value = initial;
    err.textContent = '';
    input.closest('.silk-input').removeAttribute('data-error');
    const yes = () => {
      const v = input.value.trim();
      if (!v) {
        err.textContent = '名字不能为空';
        input.closest('.silk-input').setAttribute('data-error', '');
        input.focus();
        return;
      }
      cleanup(); m.close('ok'); res(v);
    };
    const onClose = () => { cleanup(); res(null); };
    const cleanup = () => {
      $('#promptYes').removeEventListener('click', yes);
      $('#promptNo').removeEventListener('click', no);
      input.removeEventListener('keydown', key);
      m.removeEventListener('close', onClose);
    };
    const no = () => m.close('cancel');
    const key = (e) => { if (e.key === 'Enter') yes(); };
    $('#promptYes').addEventListener('click', yes);
    $('#promptNo').addEventListener('click', no);
    input.addEventListener('keydown', key);
    m.addEventListener('close', onClose);
    m.show();
    setTimeout(() => input.focus(), 60);
  });
}

function pickPlaylist() {
  return new Promise((res) => {
    const m = $('#pickModal');
    const list = $('#pickList');
    const pls = store.state.library.userPlaylists;
    list.innerHTML = pls.length
      ? pls.map((p) => `<li class="silk-list-item" data-id="${p.id}">
          <span class="silk-avatar" style="--silk-av-bg:${grad(p.hue)}">${esc(p.name[0])}</span>
          <span>${esc(p.name)}<br><small class="dim">${p.trackIds.length} 首</small></span></li>`).join('')
      : '<li class="empty">还没有歌单 — 先去「歌单」页建一个。</li>';
    const onClick = (e) => {
      const row = e.target.closest('[data-id]');
      if (!row) return;
      cleanup(); m.close('ok'); res(row.dataset.id);
    };
    const onClose = () => { cleanup(); res(null); };
    const cleanup = () => {
      list.removeEventListener('click', onClick);
      $('#pickNo').removeEventListener('click', no);
      m.removeEventListener('close', onClose);
    };
    const no = () => m.close('cancel');
    list.addEventListener('click', onClick);
    $('#pickNo').addEventListener('click', no);
    m.addEventListener('close', onClose);
    m.show();
  });
}

function limitDialog(kind) {
  return new Promise((res) => {
    const m = $('#limitModal');
    const n = kind === 'tracks'
      ? `免费层包含 ${LIMITS.free.tracks} 首创作。`
      : `免费层包含 ${LIMITS.free.playlists} 个歌单。`;
    $('#limitBody').textContent =
      `${n} 这是个演示项目:「升级」不会收费,数据只存在这台浏览器里。也可以删掉旧的腾出位置。`;
    const up = () => {
      flags.upgrade();
      try { localStorage.setItem('sona-tier', 'premium'); } catch (_) { /* */ }
      cleanup(); m.close('up');
      toast('已升级(演示)。上限已解除。');
      res(true);
    };
    const onClose = () => { cleanup(); res(false); };
    const cleanup = () => {
      $('#limitUp').removeEventListener('click', up);
      $('#limitNo').removeEventListener('click', no);
      m.removeEventListener('close', onClose);
    };
    const no = () => m.close('cancel');
    $('#limitUp').addEventListener('click', up);
    $('#limitNo').addEventListener('click', no);
    m.addEventListener('close', onClose);
    m.show();
  });
}

// 上限在调用点前置检查(升级成功可无缝重试);notify 只负责警示与修复类
store.onNotify((msg) => {
  if (msg.type !== 'limit') toast(msg.text);
});

/* ---------- 视图切换 ---------- */

const views = { library: $('#view-library'), playlist: $('#view-playlist'), queue: $('#view-queue'), forge: $('#view-forge') };
let currentView = 'library';

function showView(name) {
  if (name !== 'forge') stopPreview();
  currentView = name;
  Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
  document.querySelectorAll('.nav-btn').forEach((b) =>
    b.toggleAttribute('data-current', b.dataset.view === name));
  if (name === 'queue') renderQueue();
}
document.querySelectorAll('.nav-btn').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.view)));
$('#brand').addEventListener('click', (e) => { e.preventDefault(); showView('library'); });

/* ---------- 曲目行 ---------- */

function trackRow(t, { removable = false, index = -1 } = {}) {
  const cur = store.currentTrack();
  const active = cur && cur.id === t.id;
  const mine = t.id.startsWith('u');
  return `<li class="silk-list-item t-row" data-id="${t.id}" data-index="${index}"
             ${active ? 'data-active' : ''} ${active && !store.state.player.playing ? 'data-paused' : ''}>
    <span class="silk-avatar" style="--silk-av-bg:${grad(t.hue)}">${esc(t.title[0])}</span>
    <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="t-title"><strong>${esc(t.title)}</strong><small>${esc(t.artist)} · ${esc(t.album)}</small></span>
    <span class="spacer"></span>
    <span class="t-dur">${fmt(t.dur)}</span>
    <span class="silk-actions">
      <silk-dropdown class="row-drop">
        <button class="silk-icon-btn" aria-label="更多操作">
          <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </button>
        <div class="silk-menu">
          <button data-value="play">播放</button>
          <button data-value="next">下一首播放</button>
          <button data-value="queue">加入队列</button>
          <button data-value="addto">加入歌单…</button>
          ${removable ? '<hr><button data-value="removehere">从歌单移除</button>' : ''}
          ${mine ? '<hr><button data-value="rename">重命名</button><button data-value="delete">删除</button>' : ''}
        </div>
      </silk-dropdown>
    </span>
  </li>`;
}

async function handleTrackAction(trackId, action, ctx) {
  const a = store.actions;
  switch (action) {
    case 'play': a.playContext(ctx.list, ctx.list.indexOf(trackId)); openNP(); break;
    case 'next': a.queueAddNext(trackId); toast('将在当前曲后播放。'); break;
    case 'queue': a.queueAdd(trackId); toast('已加入队列。'); break;
    case 'addto': {
      const plId = await pickPlaylist();
      if (plId) {
        a.playlistAddTrack(plId, trackId);
        const pl = store.state.library.userPlaylists.find((x) => x.id === plId);
        toast(`已加入「${pl.name}」。`);
      }
      break;
    }
    case 'removehere':
      if (ctx.plId) {
        const pl = store.state.library.userPlaylists.find((x) => x.id === ctx.plId);
        const pos = pl.trackIds.indexOf(trackId);
        if (pos >= 0) a.playlistRemoveTrack(ctx.plId, pos);
      }
      break;
    case 'rename': {
      const t = store.resolve(trackId);
      const name = await promptName('重命名曲目', '曲目名称', t.title);
      if (name) a.trackRename(trackId, name);
      break;
    }
    case 'delete': {
      const t = store.resolve(trackId);
      if (await confirmDialog('删除这首创作?', `「${t.title}」将从曲库、所有歌单和队列中移除。这一步没有撤销。`, '删除')) {
        a.trackDelete(trackId);
        toast('已删除。位置空出来了。');
      }
      break;
    }
  }
}

function wireList(listEl, getCtx) {
  listEl.addEventListener('click', (e) => {
    if (e.target.closest('.silk-actions')) return;
    const row = e.target.closest('.t-row');
    if (!row) return;
    const ctx = getCtx();
    store.actions.playContext(ctx.list, ctx.list.indexOf(row.dataset.id));
    openNP();
  });
  listEl.addEventListener('select', (e) => {
    const row = e.target.closest('.t-row');
    if (row) handleTrackAction(row.dataset.id, e.detail.value, getCtx());
  });
}

/* ---------- 曲库 ---------- */

let query = '';
const allTracks = () => [...TRACKS, ...store.state.library.userTracks];
const filteredTracks = () => {
  const q = query.toLowerCase();
  return allTracks().filter((t) => !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
};

function renderPlaylists() {
  const officials = PLAYLISTS.map((p) => ({ ...p, official: true }));
  const mine = store.state.library.userPlaylists;
  $('#playlistGrid').innerHTML =
    [...officials, ...mine].map((p) => `
      <div class="silk-card pl-card" data-hover data-id="${p.id}" data-official="${p.official ? 1 : ''}">
        <span class="cov" style="background:${grad(p.hue)}"></span>
        <strong>${esc(p.name)}</strong>
        <p>${esc(p.desc || '')} · ${p.trackIds.length} 首</p>
      </div>`).join('') +
    `<button class="pl-new" id="plNew">＋ 新建歌单</button>`;
  $('#plNew').addEventListener('click', async () => {
    if (!flags.canCreatePlaylist(store.state.library.userPlaylists.length)) {
      if (!(await limitDialog('playlists'))) return;
    }
    const name = await promptName('新建歌单', '歌单名称');
    if (!name) return;
    const pl = store.actions.playlistCreate(name, '', Math.floor(Math.random() * 360));
    if (pl) toast(`歌单「${pl.name}」已创建。`);
  });
}
$('#playlistGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.pl-card');
  if (card) openPlaylist(card.dataset.id, !!card.dataset.official);
});

function renderTracks() {
  const list = filteredTracks();
  $('#trackList').innerHTML = list.length
    ? list.map((t) => trackRow(t)).join('')
    : '<li class="empty">没有匹配的曲目。</li>';
}
wireList($('#trackList'), () => ({ list: filteredTracks().map((t) => t.id) }));

function renderMine() {
  const mine = store.state.library.userTracks;
  $('#mineList').innerHTML = mine.map((t) => trackRow(t)).join('');
  $('#mineEmpty').hidden = mine.length > 0;
}
wireList($('#mineList'), () => ({ list: store.state.library.userTracks.map((t) => t.id) }));

$('#searchInput').addEventListener('input', (e) => {
  query = e.target.value.trim();
  renderTracks();
});

/* ---------- 歌单详情 ---------- */

let openPl = null; // { id, official }

function openPlaylist(id, official) {
  openPl = { id, official };
  renderPlaylistView();
  showView('playlist');
}

function currentPl() {
  if (!openPl) return null;
  return openPl.official
    ? PLAYLISTS.find((p) => p.id === openPl.id)
    : store.state.library.userPlaylists.find((p) => p.id === openPl.id);
}

function renderPlaylistView() {
  const pl = currentPl();
  if (!pl) { showView('library'); return; }
  $('#plCover').style.background = grad(pl.hue);
  $('#plTitle').textContent = pl.name;
  $('#plDesc').textContent = `${pl.desc || (openPl.official ? '官方歌单' : '我的歌单')} · ${pl.trackIds.length} 首`;
  $('#plMore').style.display = openPl.official ? 'none' : '';
  const tracks = pl.trackIds.map((tid) => store.resolve(tid)).filter(Boolean);
  $('#plTracks').innerHTML = tracks.map((t) => trackRow(t, { removable: !openPl.official })).join('');
  $('#plEmpty').hidden = tracks.length > 0;
}
wireList($('#plTracks'), () => ({ list: currentPl() ? currentPl().trackIds.filter((id) => store.resolve(id)) : [], plId: openPl && !openPl.official ? openPl.id : null }));

$('#plBack').addEventListener('click', () => showView('library'));
$('#plPlayAll').addEventListener('click', () => {
  const pl = currentPl();
  if (pl && pl.trackIds.length) { store.actions.playContext(pl.trackIds, 0); openNP(); }
});
$('#plMore').addEventListener('select', async (e) => {
  const pl = currentPl();
  if (!pl) return;
  if (e.detail.value === 'rename') {
    const name = await promptName('重命名歌单', '歌单名称', pl.name);
    if (name) store.actions.playlistRename(pl.id, name);
  } else if (e.detail.value === 'delete') {
    if (await confirmDialog('删除歌单?', `「${pl.name}」含 ${pl.trackIds.length} 首曲目。6 秒内可以后悔。`, '删除')) {
      const removed = store.actions.playlistDelete(pl.id);
      showView('library');
      toast(`歌单「${removed.name}」已删除。`, {
        actionLabel: '撤销',
        onAction: () => store.actions.playlistRestore(removed),
      });
    }
  }
});

/* ---------- 队列 ---------- */

function renderQueue() {
  const p = store.state.player;
  const rows = p.playOrder.map((eid, i) => {
    const t = store.resolve(p.entries[eid]);
    if (!t) return '';
    const active = i === p.index;
    return `<li class="silk-list-item t-row q-row" draggable="true" data-pos="${i}"
               ${active ? 'data-active' : ''} ${active && !p.playing ? 'data-paused' : ''}>
      <span class="silk-avatar" style="--silk-av-bg:${grad(t.hue)}">${esc(t.title[0])}</span>
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="t-title"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span>
      <span class="spacer"></span>
      <span class="t-dur">${fmt(t.dur)}</span>
      <span class="silk-actions">
        <button class="silk-icon-btn q-remove" aria-label="移出队列">
          <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </span>
    </li>`;
  }).join('');
  $('#queueList').innerHTML = rows;
  $('#qCount').textContent = p.playOrder.length ? `${p.playOrder.length} 首 · ${p.shuffle ? '随机' : '顺序'}` : '';
  $('#qEmpty').hidden = p.playOrder.length > 0;
}

$('#queueList').addEventListener('click', (e) => {
  const row = e.target.closest('.q-row');
  if (!row) return;
  const pos = Number(row.dataset.pos);
  if (e.target.closest('.q-remove')) { store.actions.queueRemove(pos); return; }
  if (pos !== store.state.player.index) store.actions.queueJump(pos);
  openNP();
});

let dragPos = null;
$('#queueList').addEventListener('dragstart', (e) => {
  const row = e.target.closest('.q-row');
  if (!row) return;
  dragPos = Number(row.dataset.pos);
  row.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
$('#queueList').addEventListener('dragover', (e) => {
  e.preventDefault();
  const row = e.target.closest('.q-row');
  document.querySelectorAll('.q-row').forEach((r) => r.classList.remove('drop-above', 'drop-below'));
  if (!row || dragPos === null) return;
  const r = row.getBoundingClientRect();
  row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
});
$('#queueList').addEventListener('drop', (e) => {
  e.preventDefault();
  const row = e.target.closest('.q-row');
  if (row && dragPos !== null) {
    const r = row.getBoundingClientRect();
    let to = Number(row.dataset.pos) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
    if (to > dragPos) to--;
    store.actions.queueReorder(dragPos, to);
  }
  dragPos = null;
  renderQueue();
});
$('#queueList').addEventListener('dragend', () => { dragPos = null; renderQueue(); });

$('#qClear').addEventListener('click', async () => {
  if (!store.state.player.playOrder.length) return;
  if (await confirmDialog('清空队列?', `${store.state.player.playOrder.length} 首曲目将被移除,正在播放的会停下来。`, '清空')) {
    store.actions.queueClear();
    toast('队列已清空。');
  }
});

/* ---------- 声音工坊 ---------- */

const forge = { mood: 'calm', hue: 262, dur: 150, seed: 42 };
let previewing = false;

function renderForge() {
  $('#hueVal').textContent = `${forge.hue}°`;
  $('#durVal').textContent = fmt(forge.dur);
  $('#forgeDisc').style.setProperty('--forge-bg', grad(forge.hue));
  $('#forgeDisc').style.background = grad(forge.hue);
  const n = store.state.library.userTracks.length;
  $('#forgeQuota').textContent = flags.tier === 'premium' ? `${n} 首 · 高级层` : `${n}/${LIMITS.free.tracks} · 免费层`;
}

$('#moodRow').addEventListener('click', (e) => {
  const b = e.target.closest('.mood');
  if (!b) return;
  forge.mood = b.dataset.mood;
  document.querySelectorAll('.mood').forEach((x) => x.toggleAttribute('data-current', x === b));
  if (previewing) startPreview(); // 热换
});
$('#hueSlider').addEventListener('input', (e) => { forge.hue = e.detail.value; renderForge(); });
$('#durSlider').addEventListener('input', (e) => { forge.dur = e.detail.value; renderForge(); });
$('#seedInput').addEventListener('input', (e) => {
  forge.seed = Math.max(0, Math.floor(Number(e.target.value) || 0));
});
$('#diceBtn').addEventListener('click', () => {
  forge.seed = Math.floor(Math.random() * 1000000);
  const btn = $('#diceBtn');
  btn.classList.remove('rolling'); void btn.offsetWidth; btn.classList.add('rolling');
  $('#seedInput').value = forge.seed;
  if (previewing) startPreview();
});

function forgeTrackDraft() {
  return { id: '__preview', title: '试听', artist: '我', album: '工坊',
           dur: forge.dur, hue: forge.hue, seed: forge.seed, mood: forge.mood };
}

function startPreview() {
  if (store.state.player.playing) store.actions.togglePlay();
  previewEngine.load(forgeTrackDraft(), { autoplay: true });
  previewing = true;
  $('#previewBtn').textContent = '停止试听';
  $('#forgeDisc').classList.add('spin');
  $('#previewBadge').hidden = false;
}
function stopPreview() {
  if (!previewing) return;
  previewEngine.pause();
  previewing = false;
  $('#previewBtn').textContent = '试听';
  $('#forgeDisc').classList.remove('spin');
  $('#previewBadge').hidden = true;
}
previewEngine.onEnded(stopPreview);
$('#previewBtn').addEventListener('click', () => (previewing ? stopPreview() : startPreview()));

$('#saveBtn').addEventListener('click', async () => {
  if (!flags.canForgeTrack(store.state.library.userTracks.length)) {
    if (!(await limitDialog('tracks'))) return;
  }
  const name = await promptName('给这首曲子起名', '曲目名称');
  if (!name) return;
  const t = store.actions.trackForge({ title: name, mood: forge.mood, hue: forge.hue, dur: forge.dur, seed: forge.seed });
  if (!t) return;
  stopPreview();
  toast(`「${t.title}」已入库,在「我的创作」等你。`);
});

document.addEventListener('visibilitychange', () => { if (document.hidden) stopPreview(); });

/* ---------- 迷你条 + 正在播放 ---------- */

const npSheet = $('#npSheet');
let npOpen = false;
let npLastFocus = null;

function openNP() {
  if (npOpen) return;
  const t = store.currentTrack();
  if (!t) return;
  npOpen = true;
  npLastFocus = document.activeElement;
  npSheet.hidden = false;
  npSheet.removeAttribute('data-closing');
  document.documentElement.style.overflow = 'hidden';
  [...document.body.children].forEach((el) => {
    if (el !== npSheet && !el.classList.contains('silk-toasts')) el.inert = true;
  });
  renderNP();
  lyricField.forceLine(null);
  $('#playBtn').focus({ preventScroll: true });
}

function closeNP() {
  if (!npOpen) return;
  npOpen = false;
  [...document.body.children].forEach((el) => { el.inert = false; });
  const finish = () => {
    npSheet.hidden = true;
    npSheet.removeAttribute('data-closing');
    document.documentElement.style.overflow = '';
    if (npLastFocus && npLastFocus.isConnected) npLastFocus.focus({ preventScroll: true });
  };
  if (REDUCED) { finish(); return; }
  npSheet.setAttribute('data-closing', '');
  npSheet.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 400);
}
$('#miniOpen').addEventListener('click', openNP);
$('#npClose').addEventListener('click', closeNP);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && npOpen) closeNP();
  if (e.key === ' ' && !e.target.closest('input, silk-slider, button, silk-switch')) {
    e.preventDefault();
    store.actions.togglePlay();
  }
});

function renderMini() {
  const t = store.currentTrack();
  const p = store.state.player;
  $('#miniTitle').textContent = t ? t.title : '未在播放';
  $('#miniArtist').textContent = t ? t.artist : '选一首歌开始';
  $('#miniCover').style.background = t ? grad(t.hue) : '';
  $('#miniPlay').toggleAttribute('data-playing', p.playing);
  $('#miniPlay').disabled = !t;
  $('#miniNext').disabled = !t;
}
$('#miniPlay').addEventListener('click', () => store.actions.togglePlay());
$('#miniNext').addEventListener('click', () => store.actions.next());

const REPEAT_LABEL = { off: '关', all: '全部', one: '单曲' };

function renderNP() {
  const t = store.currentTrack();
  if (!t) { closeNP(); return; }
  const p = store.state.player;
  $('#npTitle').textContent = t.title;
  $('#npArtist').textContent = `${t.artist} · ${t.album}`;
  $('#npBg').style.setProperty('--np-bg', `linear-gradient(160deg, hsl(${t.hue} 60% 30%), hsl(${(t.hue + 52) % 360} 65% 12%))`);
  $('#npDur').textContent = fmt(t.dur);
  const ps = $('#progressSlider');
  ps.setAttribute('max', String(t.dur));
  $('#playBtn').toggleAttribute('data-playing', p.playing);
  $('#shuffleSwitch').checked = p.shuffle;
  $('#repeatBtn').toggleAttribute('data-active', p.repeat !== 'off');
  $('#repeatBtn').setAttribute('aria-label', `循环模式:${REPEAT_LABEL[p.repeat]}`);
  $('#repeatOne').hidden = p.repeat !== 'one';
  $('#repeatLabel').textContent = REPEAT_LABEL[p.repeat];
  $('#volumeSlider').value = Math.round(p.volume * 100);
}

$('#playBtn').addEventListener('click', () => store.actions.togglePlay());
$('#prevBtn').addEventListener('click', () => store.actions.prev());
$('#nextBtn').addEventListener('click', () => store.actions.next());
$('#shuffleSwitch').addEventListener('change', (e) => store.actions.setShuffle(e.detail.checked));
$('#repeatBtn').addEventListener('click', () => store.actions.cycleRepeat());
$('#volumeSlider').addEventListener('input', (e) => store.actions.setVolume(e.detail.value / 100));
$('#progressSlider').addEventListener('change', (e) => store.actions.seek(e.detail.value));

/* ---------- 重力歌词粒子场 ---------- */

const lyricField = (() => {
  const canvas = $('#lyricCanvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let particles = [];
  let lineText = null;

  function fit() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W; canvas.height = H;
  }

  function targetsFor(text) {
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d', { willReadFrequently: true });
    let fontPx = Math.min(H * 0.5, W * 0.14);
    octx.font = `700 ${fontPx}px ${getComputedStyle(document.body).fontFamily}`;
    const tw = octx.measureText(text).width || 1;
    fontPx = Math.min(fontPx * (W * 0.9) / tw, H * 0.6);
    octx.font = `700 ${fontPx}px ${getComputedStyle(document.body).fontFamily}`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = '#fff';
    octx.fillText(text, W / 2, H / 2);
    const img = octx.getImageData(0, 0, W, H).data;
    let probe = 0;
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4)
      if (img[(y * W + x) * 4 + 3] > 128) probe++;
    const budget = 700;
    const step = Math.max(2, Math.round(4 * Math.sqrt(probe / budget)) || 2);
    const targets = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step)
      if (img[(y * W + x) * 4 + 3] > 128) targets.push({ x, y });
    targets.sort((a, b) => a.x - b.x || a.y - b.y);  // 从左到右「写」出来
    return targets;
  }

  function setLine(text) {
    if (text === lineText) return;
    lineText = text;
    if (!text) { particles = []; return; }
    if (REDUCED) return; // RM:draw() 里直接画字
    fit();
    const targets = targetsFor(text);
    const old = particles;
    particles = targets.map((tg, i) => {
      const src = old.length
        ? old[Math.floor((i / targets.length) * old.length)]
        : { x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H + Math.random() * H * 0.3, vx: 0, vy: 0 };
      return { x: src.x, y: src.y, vx: src.vx || 0, vy: src.vy || 0, hx: tg.x, hy: tg.y,
               delay: (tg.x / W) * 240 + Math.random() * 40 };
    });
    const t0 = performance.now();
    particles.forEach((p) => { p.until = t0 + p.delay; });
  }

  function impulse(strength) {
    const cx = W / 2, cy = H / 2;
    for (const p of particles) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      p.vx += (dx / d) * strength * dpr;
      p.vy += (dy / d) * strength * dpr;
    }
  }

  function tick(f, now, wind) {
    if (REDUCED) { drawStatic(); return; }
    if (!particles.length) { ctx.clearRect(0, 0, W, H); return; }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    const size = 2 * dpr;
    const damp = Math.pow(0.88, f);
    for (const p of particles) {
      if (now >= p.until) {
        p.vx = (p.vx + (p.hx - p.x) * 0.055 * f) * damp;
        p.vy = (p.vy + (p.hy - p.y) * 0.055 * f) * damp;
      } else {
        p.vx *= Math.pow(0.94, f); p.vy *= Math.pow(0.94, f);
      }
      p.vx += wind * 0.03 * Math.sin(now * 0.001 + p.hy * 0.02) * f;
      p.x += p.vx * f; p.y += p.vy * f;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
  }

  function drawStatic() {
    fitIfNeeded();
    ctx.clearRect(0, 0, W, H);
    if (!lineText) return;
    let fontPx = Math.min(H * 0.5, W * 0.14);
    ctx.font = `700 ${fontPx}px ${getComputedStyle(document.body).fontFamily}`;
    const tw = ctx.measureText(lineText).width || 1;
    fontPx = Math.min(fontPx * (W * 0.9) / tw, H * 0.6);
    ctx.font = `700 ${fontPx}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(lineText, W / 2, H / 2);
  }

  function fitIfNeeded() {
    const r = canvas.getBoundingClientRect();
    if (Math.round(r.width * dpr) !== W || Math.round(r.height * dpr) !== H) fit();
  }

  return { setLine, impulse, tick, forceLine: (t) => { lineText = undefined; setLine(t); } };
})();

/* ---------- 音频信号总线 + 主循环 ---------- */

const bus = {
  buf: null, E: 0, prevE: 0, fluxHist: [], lastHit: 0, warmUntil: 0,
  low: 0, mid: 0,
};

function sampleBus(now) {
  const an = engine.getAnalyser();
  if (!an || !store.state.player.playing) { bus.low *= 0.9; bus.mid *= 0.9; return false; }
  if (!bus.buf || bus.buf.length !== an.frequencyBinCount) bus.buf = new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(bus.buf);
  const mean = (a, b) => {
    let s = 0; for (let i = a; i <= b; i++) s += bus.buf[i];
    return s / ((b - a + 1) * 255);
  };
  bus.prevE = bus.E;
  bus.E = mean(0, 2);
  bus.low = mean(0, 3);
  bus.mid = mean(6, 32);
  const flux = bus.E - bus.prevE;
  bus.fluxHist.push(flux);
  if (bus.fluxHist.length > 42) bus.fluxHist.shift();
  if (now < bus.warmUntil || bus.E < 0.12) return false;
  const sorted = [...bus.fluxHist].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const hit = flux > Math.max(0.045, median * 1.5) && now - bus.lastHit > 250;
  if (hit) bus.lastHit = now;
  return hit;
}

let lastTs = 0;
function loop(now) {
  const dt = Math.min(64, now - lastTs || 16.7);
  lastTs = now;
  const f = clamp(dt / 16.667, 0.25, 2.5);
  const t = store.currentTrack();

  if (t) {
    const time = engine.getTime();
    // 迷你条进度 + 脉动
    $('#miniProgress').style.width = `${(time / t.dur) * 100}%`;
    const hit = sampleBus(now);
    if (!REDUCED) {
      document.documentElement.style.setProperty('--mini-pulse', String(1 + bus.low * 0.06));
    }
    if (npOpen) {
      const ps = $('#progressSlider');
      if (!ps.hasAttribute('data-dragging')) ps.value = time;
      $('#npTime').textContent = fmt(time);
      // 歌词同步
      const ly = getLyrics(t);
      let line = null, next = null;
      for (let i = 0; i < ly.length; i++) {
        if (time >= ly[i].t) { line = ly[i].line; next = ly[i + 1] ? ly[i + 1].line : ''; }
      }
      lyricField.setLine(line);
      $('#npNextLine').textContent = next || '';
      if (hit) lyricField.impulse(4.2);
      if (!REDUCED) npSheet.style.setProperty('--np-pulse', String(1 + bus.low * 0.04));
      lyricField.tick(f, now, bus.mid);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- 导入导出 ---------- */

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([store.actions.exportData()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sona-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出 sona-backup.json。');
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const report = store.actions.importData(await file.text());
  if (!report.ok) { toast(`导入失败:${report.error}`); return; }
  toast(`导入完成:${report.tracks} 曲 / ${report.playlists} 单` +
        (report.skipped ? ` · 跳过 ${report.skipped}` : '') +
        (report.pruned ? ` · 修复 ${report.pruned}` : ''));
});

$('#themeBtn').addEventListener('click', () => toggleTheme());

/* ---------- 订阅渲染 + 启动 ---------- */

function renderAll() {
  renderPlaylists();
  renderTracks();
  renderMine();
  renderMini();
  renderForge();
  if (!views.playlist.hidden) renderPlaylistView();
  if (!views.queue.hidden) renderQueue();
  if (npOpen) renderNP();
}
store.subscribe(renderAll);

window.addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });

store.actions.restorePlayer();
renderAll();

// 调试/E2E 钩子
window.__sona = { store, engine, bus };

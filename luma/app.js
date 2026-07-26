/* ==========================================================================
   LUMA — 流光媒体
   Vanilla JS. View Transitions where available, graceful everywhere else.
   ========================================================================== */
'use strict';

(() => {

  const $ = (sel, root = document) => root.querySelector(sel);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // body overflow does not propagate to the viewport while html has
  // overflow-x: clip — the root element is the real scroller to lock.
  const lockScroll = (on) => { root.style.overflow = on ? 'hidden' : ''; };
  const setBackgroundInert = (on) => {
    ['.rail', '.topbar', '#content'].forEach((sel) => {
      const el = $(sel);
      if (el) el.inert = on;
    });
  };

  /* ---------- Data ---------- */

  const VIDEOS = [
    { id: 'v01', title: '把留白当作功能:一次首页减法实验', channel: '白与灰', glyph: 'WS', views: '18.2万', age: '2 天前', dur: '14:08', cat: '设计', hue: 18, seen: 62 },
    { id: 'v02', title: '60fps 的秘密:合成层、变换与你', channel: 'Frame Perfect', glyph: 'FP', views: '9.4万', age: '5 天前', dur: '21:33', cat: '开发', hue: 210, seen: 0 },
    { id: 'v03', title: '深夜城市 Lo-Fi:写代码时循环的 40 分钟', channel: '雾岛电台', glyph: '雾', views: '112万', age: '3 周前', dur: '40:00', cat: '音乐', hue: 262, seen: 18 },
    { id: 'v04', title: '产品发布会舞台设计,藏着多少心理学', channel: '幕后频道', glyph: 'BK', views: '31万', age: '1 周前', dur: '17:46', cat: '设计', hue: 340, seen: 0 },
    { id: 'v05', title: '实时:空间站掠过太平洋上空', channel: 'ORBIT LIVE', glyph: '🛰', views: '2.1万人在看', age: '直播中', dur: 'LIVE', cat: '科技', hue: 195, live: true, seen: 0 },
    { id: 'v06', title: '缓动曲线品鉴:为什么 ease-out 更贵气', channel: 'Frame Perfect', glyph: 'FP', views: '27万', age: '2 周前', dur: '11:52', cat: '设计', hue: 152, seen: 0 },
    { id: 'v07', title: '从终端到桌面:一个 CLI 工具的养成', channel: '循环引用', glyph: '循', views: '6.8万', age: '4 天前', dur: '24:15', cat: '开发', hue: 96, seen: 0 },
    { id: 'v08', title: '胶片色彩科学入门:从负片到 LUT', channel: '曝光三角', glyph: 'EX', views: '15万', age: '6 天前', dur: '19:27', cat: '纪录', hue: 30, seen: 41 },
    { id: 'v09', title: '合成器纯享:一台 Prophet 的 30 种音色', channel: '雾岛电台', glyph: '雾', views: '8.9万', age: '1 个月前', dur: '28:44', cat: '音乐', hue: 286, seen: 0 },
    { id: 'v10', title: '固态电池,这次是真的快了吗?', channel: '硬核拆解', glyph: '硬', views: '52万', age: '3 天前', dur: '16:05', cat: '科技', hue: 6, seen: 0 },
    { id: 'v11', title: '字距的 0.02em:小数点后的排版尊严', channel: '白与灰', glyph: 'WS', views: '12万', age: '1 周前', dur: '09:58', cat: '设计', hue: 226, seen: 88 },
    { id: 'v12', title: '在冰岛拍了 14 天极光,素材全在这', channel: '曝光三角', glyph: 'EX', views: '76万', age: '2 个月前', dur: '32:19', cat: '纪录', hue: 174, seen: 0 },
    { id: 'v13', title: '状态机救了我的播放器:一次重构复盘', channel: '循环引用', glyph: '循', views: '4.3万', age: '昨天', dur: '18:36', cat: '开发', hue: 314, seen: 0 },
    { id: 'v14', title: '为什么大厂都在做「果冻感」按压反馈', channel: '幕后频道', glyph: 'BK', views: '44万', age: '4 天前', dur: '13:21', cat: '科技', hue: 48, seen: 0 },
  ];

  const CATS = ['全部', '设计', '开发', '科技', '音乐', '纪录'];

  const NAV_VIEWS = {
    home:    { title: '为你推荐',   pick: (v) => v },
    explore: { title: '现在流行',   pick: (v) => [...v].reverse() },
    subs:    { title: '订阅更新',   pick: (v) => v.filter((x) => ['白与灰', 'Frame Perfect', '雾岛电台'].includes(x.channel)) },
    library: { title: '稍后观看',   pick: (v) => v.filter((x) => x.seen > 0) },
  };

  const grad = (hue) =>
    `linear-gradient(135deg, hsl(${hue} 72% 56%), hsl(${(hue + 52) % 360} 82% 40%))`;

  /* ---------- View-transition helper ---------- */

  const withTransition = (update) => {
    if (document.startViewTransition && !REDUCED) {
      return document.startViewTransition(update);
    }
    update();
    return null;
  };

  /* ---------- Theme ---------- */

  $('#themeToggle').addEventListener('click', () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    withTransition(() => {
      root.dataset.theme = dark ? 'light' : 'dark';
      localStorage.setItem('luma-theme', root.dataset.theme);
    });
  });

  /* ---------- Toasts ---------- */

  const toasts = $('#toasts');
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, 2200);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toast]');
    if (t) toast(t.dataset.toast);
  });

  /* ---------- Avatar menu ---------- */

  const avatarBtn = $('#avatarBtn');
  const avatarMenu = $('#avatarMenu');
  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = avatarMenu.hidden;
    avatarMenu.hidden = !open;
    avatarBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!avatarMenu.hidden && !avatarMenu.contains(e.target)) {
      avatarMenu.hidden = true;
      avatarBtn.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- Grid ---------- */

  const grid = $('#grid');
  const gridEmpty = $('#gridEmpty');
  const chipsEl = $('#chips');
  const sectionTitle = $('#sectionTitle');
  let activeCat = '全部';
  let activeNav = 'home';
  let query = '';

  function currentList() {
    let list = NAV_VIEWS[activeNav].pick(VIDEOS);
    if (activeCat !== '全部') list = list.filter((v) => v.cat === activeCat);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((v) =>
        v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q));
    }
    return list;
  }

  function cardHTML(v, i) {
    return `
      <button class="card is-in" style="--stagger:${Math.min(i, 12) * 40}ms" data-id="${v.id}">
        <span class="thumb" style="--thumb-bg:${grad(v.hue)}; background:${grad(v.hue)}">
          <span class="thumb-glyph">${v.glyph}</span>
          ${v.live
            ? '<span class="badge live">Live</span>'
            : `<span class="badge">${v.dur}</span>`}
          ${v.seen ? `<span class="thumb-progress" style="--seen:${v.seen}%"><i></i></span>` : ''}
        </span>
        <span class="card-meta">
          <span class="channel-avatar" style="--av-bg:${grad((v.hue + 120) % 360)}; background:${grad((v.hue + 120) % 360)}">${v.glyph[0]}</span>
          <span>
            <span class="card-title">${v.title}</span>
            <span class="card-sub mono">${v.channel} · ${v.views} · ${v.age}</span>
          </span>
        </span>
      </button>`;
  }

  const SKELETON = `
    <div class="card">
      <div class="sk sk-thumb"></div>
      <div class="sk sk-line"></div>
      <div class="sk sk-line short"></div>
    </div>`;

  function emptyStateHTML() {
    if (query) {
      const scoped = activeCat !== '全部';
      return `<p>没有和「${esc(query)}」匹配的内容${scoped ? `(当前筛选:${esc(activeCat)})` : ''}。</p>` +
        (scoped ? '<button class="btn" data-reset-cat>在全部分类中搜索</button>' : '');
    }
    return '<p>这里还没有内容。</p>';
  }

  function renderGrid({ skeleton = false } = {}) {
    clearTimeout(renderGrid.t);
    if (skeleton && !REDUCED) {
      grid.innerHTML = SKELETON.repeat(8);
      gridEmpty.hidden = true;
      renderGrid.t = setTimeout(() => renderGrid(), 340);
      return;
    }
    const list = currentList();
    grid.innerHTML = list.map(cardHTML).join('');
    gridEmpty.hidden = list.length > 0;
    if (list.length === 0) gridEmpty.innerHTML = emptyStateHTML();
  }

  const gridEmptyEl = gridEmpty;
  gridEmptyEl.addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset-cat]')) return;
    activeCat = '全部';
    document.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('is-active', c.dataset.cat === '全部');
      c.setAttribute('aria-pressed', String(c.dataset.cat === '全部'));
    });
    renderGrid();
  });

  /* ---------- Chips ---------- */

  chipsEl.innerHTML = CATS.map((c, i) =>
    `<button class="chip${i === 0 ? ' is-active' : ''}" aria-pressed="${i === 0}" data-cat="${c}">${c}</button>`).join('');
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.dataset.cat === activeCat) return;
    const prev = $('.chip.is-active', chipsEl);
    prev.classList.remove('is-active');
    prev.setAttribute('aria-pressed', 'false');
    chip.classList.add('is-active');
    chip.setAttribute('aria-pressed', 'true');
    activeCat = chip.dataset.cat;
    renderGrid({ skeleton: true });
  });

  /* ---------- Rail nav ---------- */

  document.querySelectorAll('.rail-item[data-nav]').forEach((item) => {
    item.addEventListener('click', () => {
      if (item.dataset.nav === activeNav) return;
      document.querySelectorAll('.rail-item[data-nav]').forEach((n) => {
        n.classList.toggle('is-active', n === item);
        if (n === item) n.setAttribute('aria-current', 'page');
        else n.removeAttribute('aria-current');
      });
      activeNav = item.dataset.nav;
      sectionTitle.textContent = NAV_VIEWS[activeNav].title;
      window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      renderGrid({ skeleton: true });
    });
  });

  $('.rail-item[data-action="settings"]').addEventListener('click', () =>
    toast('设置面板在路上了 — 这是个演示。'));
  $('#uploadBtn').addEventListener('click', () =>
    toast('上传通道已就绪 — 假装如此。'));

  /* ---------- Search ---------- */

  const searchInput = $('#searchInput');
  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim();
    sectionTitle.textContent = query ? `搜索「${query}」` : NAV_VIEWS[activeNav].title;
    renderGrid();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && watch.hidden) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  /* ---------- Watch overlay + fake player ---------- */

  const watch = $('#watch');
  const player = $('#player');
  const playerPlay = $('#playerPlay');
  const playerProgress = $('#playerProgress');
  const playerTime = $('#playerTime');
  const subscribeBtn = $('#subscribeBtn');
  const related = $('#related');
  const mini = $('#mini');
  let current = null;
  let playing = false;
  let elapsed = 0;
  let totalSec = 0;
  let timer = 0;
  let lastThumb = null;

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function parseDur(dur) {
    if (dur === 'LIVE') return 0;
    const [m, s] = dur.split(':').map(Number);
    return m * 60 + s;
  }

  function setPlaying(state) {
    playing = state;
    player.classList.toggle('is-playing', playing);
    clearInterval(timer);
    if (playing) {
      timer = setInterval(() => {
        elapsed = totalSec ? Math.min(elapsed + 0.3, totalSec) : elapsed + 0.3;
        playerProgress.style.width = totalSec ? `${(elapsed / totalSec) * 100}%` : '100%';
        playerTime.textContent = fmt(elapsed);
        if (totalSec && elapsed >= totalSec) setPlaying(false);
      }, 300);
    }
  }

  function fillWatch(v) {
    current = v;
    elapsed = 0;
    totalSec = parseDur(v.dur);
    player.style.setProperty('--thumb-bg', grad(v.hue));
    player.style.background = grad(v.hue);
    playerProgress.style.width = '0%';
    playerTime.textContent = v.live ? '直播中' : '00:00';
    $('#watchTitle').textContent = v.title;
    $('#watchMeta').textContent = `${v.views} · ${v.age} · ${v.cat}`;
    $('#watchChannel').textContent = v.channel;
    $('#watchSubs').textContent = '128 万订阅';
    const av = $('#watchAvatar');
    av.style.background = grad((v.hue + 120) % 360);
    av.textContent = v.glyph[0];
    subscribeBtn.classList.remove('is-on');
    subscribeBtn.textContent = '订阅';
    related.innerHTML = VIDEOS.filter((x) => x.id !== v.id).slice(0, 5).map((x) => `
      <button class="rel-item" data-id="${x.id}">
        <span class="rel-thumb" style="background:${grad(x.hue)}">
          <span class="badge${x.live ? ' live' : ''}">${x.live ? 'Live' : x.dur}</span>
        </span>
        <span class="rel-text">
          <strong>${x.title}</strong>
          <span class="mono">${x.channel} · ${x.views}</span>
        </span>
      </button>`).join('');
  }

  let lastFocus = null;
  // Intent flag: an Escape that lands before the open view-transition's
  // update callback must still cancel the open, not get swallowed.
  let wantOpen = false;

  function mountWatch() {
    lockScroll(true);
    setBackgroundInert(true);
    $('.watch-panel').focus({ preventScroll: true });
  }

  function openWatch(v, thumbEl) {
    fillWatch(v);
    hideMini();
    lastThumb = thumbEl || null;
    lastFocus = document.activeElement;
    wantOpen = true;
    if (lastThumb && document.startViewTransition && !REDUCED) {
      lastThumb.style.viewTransitionName = 'player';
      const vt = document.startViewTransition(() => {
        lastThumb.style.viewTransitionName = '';
        if (wantOpen) {
          watch.hidden = false;
          mountWatch();
        }
      });
      // Guard: the overlay may already be closed again by the time the
      // transition settles — don't resume a hidden player.
      vt.finished.then(() => { if (wantOpen && !watch.hidden) setPlaying(true); });
    } else {
      watch.hidden = false;
      mountWatch();
      setPlaying(true);
    }
  }

  function restoreFocus() {
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function closeWatch({ toMini = true } = {}) {
    wantOpen = false;
    if (watch.hidden) return;
    setPlaying(false);
    setBackgroundInert(false);
    const finish = () => {
      watch.hidden = true;
      lockScroll(false);
      restoreFocus();
      if (toMini && current) showMini(current);
    };
    if (lastThumb && lastThumb.isConnected && document.startViewTransition && !REDUCED && !toMini) {
      const vt = document.startViewTransition(() => {
        watch.hidden = true;
        lastThumb.style.viewTransitionName = 'player';
      });
      vt.finished.then(() => {
        lastThumb.style.viewTransitionName = '';
        lockScroll(false);
        restoreFocus();
      });
    } else {
      finish();
    }
  }

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-id]');
    if (!card) return;
    const v = VIDEOS.find((x) => x.id === card.dataset.id);
    if (v) openWatch(v, $('.thumb', card));
  });

  related.addEventListener('click', (e) => {
    const item = e.target.closest('.rel-item');
    if (!item) return;
    const v = VIDEOS.find((x) => x.id === item.dataset.id);
    if (v) { fillWatch(v); setPlaying(true); $('.watch-panel').scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); }
  });

  playerPlay.addEventListener('click', () => setPlaying(!playing));
  player.addEventListener('click', (e) => {
    if (e.target.closest('.player-play')) return;
    setPlaying(!playing);
  });

  subscribeBtn.addEventListener('click', () => {
    const on = subscribeBtn.classList.toggle('is-on');
    subscribeBtn.textContent = on ? '已订阅' : '订阅';
    toast(on ? `已订阅「${current.channel}」` : `已取消订阅「${current.channel}」`);
  });

  watch.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeWatch();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!watch.hidden || wantOpen) closeWatch();
      else if (!avatarMenu.hidden) { avatarMenu.hidden = true; avatarBtn.setAttribute('aria-expanded', 'false'); }
    }
  });

  /* ---------- Mini player ---------- */

  function showMini(v) {
    $('#miniThumb').style.background = grad(v.hue);
    $('#miniTitle').textContent = v.title;
    $('#miniChannel').textContent = v.channel;
    mini.classList.remove('is-leaving');
    mini.hidden = false;
  }
  function hideMini() {
    if (mini.hidden) return;
    if (REDUCED) { mini.hidden = true; return; }
    mini.classList.add('is-leaving');
    mini.addEventListener('animationend', () => {
      mini.hidden = true;
      mini.classList.remove('is-leaving');
    }, { once: true });
  }
  $('#miniExpand').addEventListener('click', () => {
    hideMini();
    if (current) {
      lastFocus = document.activeElement;
      wantOpen = true;
      watch.hidden = false;
      mountWatch();
      setPlaying(true);
    }
  });
  $('#miniClose').addEventListener('click', hideMini);

  /* ---------- First paint ---------- */

  renderGrid();

})();

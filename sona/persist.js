/* SONA · 流声 — 持久层适配器(schema v1,localStorage 实现)
   将来上云:换掉这里的适配器即可,store 与 UI 不动(TECH §9)。 */

const SCHEMA = 1;
const KEYS = {
  meta: 'sona.v1.meta',
  playlists: 'sona.v1.playlists',
  tracks: 'sona.v1.tracks',
  player: 'sona.v1.player',
};

export function createPersist(storage = null) {
  const ls = storage || window.localStorage;
  let writable = true;

  const read = (key, fallback) => {
    try {
      const raw = ls.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      ls.setItem(key, JSON.stringify(value));
      writable = true;
      return true;
    } catch (_) {
      writable = false;  // 隐私模式 / 配额:功能不阻断,UI 据此提示
      return false;
    }
  };

  return {
    get writable() { return writable; },
    loadAll() {
      const meta = read(KEYS.meta, { schema: SCHEMA });
      if (meta.schema > SCHEMA) {
        return { readOnly: true, playlists: [], tracks: [], player: null };
      }
      // schema < SCHEMA 时在此接迁移函数链(目前仅 v1)
      return {
        readOnly: false,
        playlists: read(KEYS.playlists, []),
        tracks: read(KEYS.tracks, []),
        player: read(KEYS.player, null),
      };
    },
    savePlaylists(v) { return write(KEYS.playlists, v) && write(KEYS.meta, { schema: SCHEMA }); },
    saveTracks(v) { return write(KEYS.tracks, v) && write(KEYS.meta, { schema: SCHEMA }); },
    savePlayer(v) { return write(KEYS.player, v); },
  };
}

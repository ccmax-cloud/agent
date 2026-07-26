/* SONA · 流声 — 免费/高级分层(演示态,本地判定) */

export const LIMITS = { free: { tracks: 3, playlists: 2 }, premium: { tracks: Infinity, playlists: Infinity } };

export function createFlags(initialTier = 'free') {
  let tier = initialTier;
  return {
    get tier() { return tier; },
    upgrade() { tier = 'premium'; },   // 「升级(演示)」— 不收费,数据只在本机
    downgrade() { tier = 'free'; },
    canForgeTrack: (count) => count < LIMITS[tier].tracks,
    canCreatePlaylist: (count) => count < LIMITS[tier].playlists,
    limits: () => LIMITS[tier],
  };
}

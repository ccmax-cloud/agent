/* SONA · 流声 — 曲库数据(演示用,全部虚构) */

export const TRACKS = [
  { id: 't01', title: '子夜环线', artist: '雾岛电台', album: '城市待机', dur: 168, hue: 262, seed: 11, mood: 'calm' },
  { id: 't02', title: '玻璃晴朗', artist: '白与灰', album: '留白练习', dur: 142, hue: 196, seed: 23, mood: 'bright' },
  { id: 't03', title: '低电量星球', artist: 'Frame Perfect', album: '60fps 之梦', dur: 187, hue: 330, seed: 37, mood: 'calm' },
  { id: 't04', title: '货运电梯上行', artist: '循环引用', album: '尾调用', dur: 155, hue: 96, seed: 41, mood: 'drive' },
  { id: 't05', title: '曝光过度的夏天', artist: '曝光三角', album: '负片日记', dur: 201, hue: 36, seed: 53, mood: 'bright' },
  { id: 't06', title: '轨道之外', artist: 'ORBIT', album: '近地点', dur: 233, hue: 210, seed: 67, mood: 'calm' },
  { id: 't07', title: '果冻按钮', artist: 'Frame Perfect', album: '60fps 之梦', dur: 128, hue: 8, seed: 71, mood: 'drive' },
  { id: 't08', title: '薄雾快进', artist: '雾岛电台', album: '城市待机', dur: 176, hue: 286, seed: 83, mood: 'drive' },
  { id: 't09', title: '硬盘里的海', artist: '白与灰', album: '留白练习', dur: 214, hue: 174, seed: 97, mood: 'calm' },
  { id: 't10', title: '安全区边缘', artist: '循环引用', album: '尾调用', dur: 149, hue: 122, seed: 103, mood: 'bright' },
  { id: 't11', title: '延迟满足', artist: 'ORBIT', album: '近地点', dur: 192, hue: 226, seed: 113, mood: 'calm' },
  { id: 't12', title: '维生素 D 不足', artist: '曝光三角', album: '负片日记', dur: 163, hue: 48, seed: 127, mood: 'bright' },
];

export const PLAYLISTS = [
  { id: 'p01', name: '深夜写码', desc: '给长会话的低刺激背景音', hue: 262, trackIds: ['t01', 't03', 't06', 't09', 't11'] },
  { id: 'p02', name: '通勤加速度', desc: '把地铁坐出片尾曲的感觉', hue: 8, trackIds: ['t04', 't07', 't08', 't10'] },
  { id: 'p03', name: '晴天补丁', desc: '维生素 D 的替代方案', hue: 36, trackIds: ['t02', 't05', 't12'] },
];

export const byId = (id) => TRACKS.find((t) => t.id === id);

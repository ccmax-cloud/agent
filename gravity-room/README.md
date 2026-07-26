# GRAVITY ROOM · 重力房间

A physics-driven, dark Swiss-editorial one-pager. The headline is ~2,000 canvas
particles; pull the lever (really pull it) and gravity rains the typography into
a heap you can plow through with the cursor — flip it back and the word
reassembles, grain by grain.

一个物理驱动的暗色瑞士编辑风格单页。主标题由约 2,000 个 canvas 粒子组成:
用力拉下重力拉杆,文字会坍塌成一堆"字型沙",可以用光标翻搅;
再拉一次,粒子逐颗归位,标题重新聚合。

## Run · 运行

No build step, no dependencies. Just open it:

```sh
open index.html          # macOS
# or serve the folder:
npx http-server .
```

## What's inside · 内部构造

| File | Purpose |
| --- | --- |
| `index.html` | Semantic markup, deadpan copy, zero external requests |
| `styles.css` | Design tokens, glass pill nav, ghost numerals, gravity-state theme flip |
| `main.js` | One shared rAF loop: particle headline, lever gesture, verlet toys, cursor |

## Notes · 说明

- **Zero dependencies** — system font stacks, hand-drawn physics, no requests
  leave the page.
- **The lever is honest** — a real pull (≥48px, with velocity) earns the
  toggle; a timid drag gets you: *"Pull harder. Gravity is heavy."* The third
  attempt always succeeds. Plain clicks/taps, `Enter`, `Space`, and `G`
  (while the playroom is on screen) also toggle, so every input method
  reaches the wow moment.
- **Accessible** — real `<h1>`, `aria-pressed` lever with live announcements,
  focus rings, and a full `prefers-reduced-motion` narrative (crossfade instead
  of simulation, nothing gutted).
- **Performance** — DPR capped at 2, `fillRect`-only particle rendering, one
  blurred surface, frame-time watchdog that degrades particle density before
  frame rate, everything pauses off-screen and when the tab hides.
- **Emergencies** — ↑↑↓↓←→←→BA.

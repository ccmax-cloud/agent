# LUMA · 流光媒体

一个现代简约、动画丝滑的流媒体应用界面演示(Apple 的克制 × YouTube 的信息结构)。
纯 HTML/CSS/JS,零依赖,打开 `index.html` 即可运行。

A modern-minimal streaming UI demo with silky animations. Zero dependencies —
just open `index.html`.

## 亮点 · Highlights

- **令牌驱动的双主题** — 颜色/阴影/圆角/动效全部走 CSS 自定义属性;跟随系统
  `prefers-color-scheme`,右上角可手动切换(带 View Transitions 全页渐变),
  选择持久化到 `localStorage`。
- **丝滑动效体系** — 三条曲线各司其职:`--glide`(Apple 式长滑)、`--pop`
  (按压回弹)、`--spring`(`linear()` 真弹簧,用于 Toast/菜单/面板入场);
  卡片入场逐个错峰,骨架屏微光扫过,全部尊重 `prefers-reduced-motion`。
- **View Transitions API** — 点击卡片,缩略图无缝放大为播放器;不支持的浏览器
  优雅回退为弹簧面板。
- **完整交互链** — 侧栏悬停展开、磨砂顶栏、chips 筛选、实时搜索(`/` 聚焦)、
  假装很敬业的播放器(进度/计时/播放暂停)、迷你播放器停靠、Toast、下拉菜单、
  骨架屏、移动端底部标签栏。

## 结构 · Files

| 文件 | 说明 |
| --- | --- |
| `index.html` | 语义化骨架:侧栏 / 顶栏 / 网格 / 观看层 / 迷你播放器 |
| `styles.css` | 设计令牌(两套主题)+ 全部组件样式与动效 |
| `app.js` | 渲染与交互:筛选、搜索、观看层、主题、Toast |

## 设计令牌 · Tokens

```css
--bg / --surface / --surface-2 / --ink / --muted / --hairline  /* 中性层级 */
--accent: #F4633A (light) · #FF7048 (dark)                     /* 唯一强调色 */
--glide / --pop / --spring                                      /* 动效曲线 */
--t-fast: 150ms · --t-med: 280ms · --t-slow: 480ms              /* 时长 */
--r-sm / --r-md / --r-lg                                        /* 圆角 */
```

内容均为演示用假数据;缩略图为按色相生成的渐变材质,无任何外部请求。

# SILK · 丝 — 设计令牌驱动的零依赖 UI 组件库

现代简约、动画丝滑、复制即用。纯 CSS + 原生自定义元素(light DOM),
不锁任何框架——Vanilla / React / Vue 页面都能直接用。

```html
<link rel="stylesheet" href="silk/silk.css">
<script type="module">
  import { toast, toggleTheme } from './silk/silk.js';
</script>
```

## 设计令牌(tokens.css)

一切组件只消费 `--silk-*` 令牌;**换品牌 = 改一个文件**,最少只改
`--silk-accent`。明暗双主题内建:跟随系统 `prefers-color-scheme`,
`data-theme` 覆盖(`setTheme('dark')` 持久化到 localStorage)。

动效三曲线(丝滑的骨架):

| 令牌 | 用途 |
| --- | --- |
| `--silk-glide` | 一切空间位移与**退场**(退场永远 glide,时长约为入场 0.6 倍) |
| `--silk-pop` | ≤48px 小件微反馈(按压回弹),只配 `--silk-fast` |
| `--silk-spring` | 新对象**入场**与物理归位(Modal/Toast/菜单/滑块松手),永不退场 |

## 组件 API

**静态组件用类**(样式即组件):

```html
<button class="silk-btn" data-variant="primary|ghost|danger" data-size="sm|lg">按钮</button>
<button class="silk-icon-btn" data-active aria-label="收藏"><svg>…</svg></button>
<label class="silk-input" data-error><span>标签</span><input><em class="silk-error">错误文案</em></label>
<div class="silk-card" data-hover>…</div>
<ul class="silk-list"><li class="silk-list-item" data-active>…<span class="silk-actions">…</span></li></ul>
<div class="silk-skeleton" data-variant="line|circle"></div>
<span class="silk-badge" data-tone="accent|live">Live</span>
<span class="silk-avatar" style="--silk-av-bg: …">雾</span>
```

**行为组件用自定义元素**(a11y 内建):

```html
<silk-slider min="0" max="100" value="35" step="1" aria-label="音量"></silk-slider>
<!-- 事件:input(拖动中)/ change(提交);键盘:←→↑↓ PageUp/Down Home/End -->

<silk-switch checked aria-label="随机"></silk-switch>   <!-- change 事件,role=switch -->

<silk-tabs selected="0">                                <!-- change 事件;←→ 漫游 -->
  <silk-tab label="歌单">…</silk-tab>
</silk-tabs>

<silk-modal title="确认?">…按钮自备…</silk-modal>
<!-- modal.show() / modal.close(reason) / close 事件
     内建:焦点保存→背景 inert→还原;Esc/遮罩关闭;滚动锁定在根元素 -->

<silk-dropdown>
  <button class="silk-btn">更多 ▾</button>
  <div class="silk-menu"><button data-value="x">选项</button></div>
</silk-dropdown>
<!-- select 事件;↑↓ Home End 键盘导航;空间不足自动向上翻 -->
```

**函数**:

```js
toast('已加入队列。');
toast('已删除。', { actionLabel: '撤销', onAction: () => {} });  // 6s,可撤销
setTheme('dark'); getTheme(); toggleTheme();
```

## 质量基线

- 键盘全覆盖,`:focus-visible` 零延迟焦点环
- `prefers-reduced-motion`:位移动画全部降为 `--silk-fade` 透明度淡入
- Modal 焦点圈闭经背景 `inert` 实现;滚动锁定在**根元素**(body 的
  overflow 不会穿透 html 的 overflow 设置——这是实战踩过的坑)
- 触屏:`.silk-actions` 常显;Slider `touch-action: none` 仅限自身

演示画廊:`demo.html`(全组件 × 全状态 × 双主题)。

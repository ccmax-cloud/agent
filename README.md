# 前端实验室 · Frontend Lab

四个渐进式前端作品,零依赖、纯手写,每一个都经过多智能体对抗审查与
真实浏览器(Playwright)验证。**在线预览:启用 GitHub Pages 后访问
仓库主页即可**(见下方「部署」)。

| 项目 | 一句话 | 目录 |
| --- | --- | --- |
| 🪐 **GRAVITY ROOM** 重力房间 | 标题由 2,000 个粒子组成——拉下重力拉杆,文字塌成沙,再拉一次逐粒归位 | [`gravity-room/`](gravity-room/) |
| 📺 **LUMA** 流光媒体 | 现代简约流媒体界面:View Transitions 转场、双主题、迷你播放器 | [`luma/`](luma/) |
| 🧵 **SILK** 丝 | 设计令牌驱动的零依赖 UI 组件库:14 类组件、双主题、无障碍内建 | [`silk/`](silk/) |
| 🎵 **SONA** 流声 | 生成式音乐播放器:曲目由种子实时合成,歌词是会被鼓点击散的粒子 | [`sona/`](sona/) |

## 四个项目的关系

```
GRAVITY ROOM ──粒子文字技术──┐
LUMA ──────动效语言与主题体系──┼──▶ SILK(组件库)──▶ SONA(旗舰应用)
                              │        SONA 同时是 SILK 的验收测试
生成式音频引擎 ────────────────┘
```

SONA 是集大成者:UI 来自 SILK 组件库,重力歌词复用 GRAVITY ROOM 的
粒子文字技术,动效体系承自 LUMA,声音由零依赖的 WebAudio 生成式引擎
实时合成——**没有一个音频文件,没有一行第三方代码**。

## 本地运行

无构建步骤。任选其一:

```sh
npx http-server .        # 然后访问 http://127.0.0.1:8080
# 或直接双击任意项目的 index.html(SONA 因 ES module 需经 http 服务)
```

## 部署(GitHub Pages)

仓库内置 `.github/workflows/pages.yml`,推送到 `claude/modern-frontend-ui-eu5mcb`
分支即自动部署整站。若首次部署因权限未生效,在仓库
**Settings → Pages → Source** 选择 **GitHub Actions** 后重跑一次 workflow 即可。

## 质量方法论

- **对抗审查**:每个项目由多智能体从正确性/性能/无障碍/视觉多镜头审查,
  每条发现再经怀疑论者验证,只修确认为真的(累计 30+ 项确认修复)
- **真实浏览器验证**:Playwright 全流程 E2E(SONA 18 项、SILK 19 项、
  store 契约 36 项断言全绿)
- **文档先行**:SONA 拥有完整的产品规格/技术架构/实现路径/交互动效
  施工图(见 [`sona/DESIGN.md`](sona/DESIGN.md) 等四件套)

## 技术要点

- 零依赖:系统字体栈、手写物理、原生 WebAudio / Web Components
- 双主题:令牌层换肤,跟随系统 + 手动切换 + 持久化
- 无障碍:键盘全覆盖、焦点管理(inert)、`prefers-reduced-motion` 完整降级
- 性能:transform/opacity 白名单、单 rAF、DPR 上限、帧率看门狗

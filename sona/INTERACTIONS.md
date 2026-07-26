# SONA · 流声 — INTERACTIONS.md 交互动效总规格

> 配套文档:`DESIGN.md`(产品规格)、`TECH.md`(技术架构)、`ROADMAP.md`(里程碑)。
> 动效令牌取自 house 动效语言:曲线 `--glide` cubic-bezier(0.32,0.72,0,1)、`--pop` cubic-bezier(0.34,1.56,0.64,1)、`--spring` linear() 弹簧曲线;时长 `--t-fast`(150ms)、`--t-med`(280ms)、`--t-slow`(480ms)。

本文档是 SONA 全部交互动效的唯一事实源,合并五个区域规格并裁决其冲突。总约束:**DOM 动画只许 transform/opacity**(具名豁免仅三项:颜色类过渡 background-color/border-color/box-shadow、共享元素变形中的封面 border-radius 单点豁免、主题切换的 View Transitions clip-path);曲线与时长一律引用令牌,样式表内禁止裸写 cubic-bezier 或毫秒字面量(canvas 内部时序、与音频信号同步的 JS/WAAPI 微时序、错峰 delay 不在此限,以本规格数值为准);全应用共享单 rAF;组件一律按抽象组件(Button/Slider/Tabs/Modal/Toast/Dropdown/List…)书写,不绑定具体框架。每条规格恒含六项:触发 / 动效 / 趣味 / 中断 / 降级 / 验收。趣味的基调是 deadpan-premium:机智、物理、意料之外但有目的——绝不幼稚。

---

## 一、总纲:全局动效系统

### 1.1 三律定音(曲线与时长决定表)

**触发**:任何新动效的设计与评审,以此表为唯一裁决依据。

**动效**:
- `--glide`:一切**空间位移与退场**——视图滑动、面板收合、尺寸变化、所有 dismiss/exit。
- `--pop`:仅用于 **≤48px 小件的微反馈**(按压回弹、图标交换、chip 切换),且**只许配 --t-fast**。
- `--spring`:用于**新对象的入场**(Toast/Modal/Dropdown/迷你条进场)与**物理归位/回弹**(拖拽落槽、thumb 松手、指示器落定、脉动回落);仅作用于 transform,配 `--t-med` 或 `--t-slow`。
- `--t-fast`=状态反馈与每秒可能触发 ≥1 次的效果;`--t-med`=局部布局变化(下拉、指示器、交叉淡入);`--t-slow`=跨空间/全局(视图切换、正在播放展开、主题)。
- **铁律一**:退场永远 `--glide`,时长约为入场的 0.6 倍(入场 `--t-slow --spring` → 退场 `--t-med --glide`;入场 `--t-med` → 退场 `--t-fast`)。
- **铁律二**:`--spring` 永不用于退场。
- **铁律三**:动画属性仅 transform/opacity(外加上文三项具名豁免)。

**趣味**:「出场热烈,退场克制」——弹簧只在进门与归位时用,关门永远比开门快,像有教养的客人:到场带劲,离席无声。

**中断**:全部走 CSS transition 从当前计算值重定向;JS 驱动的用弹簧重设目标——永不从 0 重播。

**降级**:三曲线全部失效,按第六章「静水流深」映射表执行,仅保留 `--t-fade`(120ms)的 opacity 淡入淡出。

**验收**:CI 静态审计(stylelint + 自定义规则)扫描全部样式表,断言 (a) 无 `--pop` 与 `--t-med/--t-slow` 配对;(b) 无退场类关键帧(含 -out/leave/exit)引用 `--spring`;(c) transition/animation 声明中不出现裸 `cubic-bezier(` 或裸 ms 数值(令牌定义处除外);(d) transition-property/keyframe 白名单只含 transform/opacity/三项豁免。Playwright 抽查 5 个组件的 computed transition 与令牌值一致。

### 1.2 一条心电图(音频信号总线)

**触发**:播放期间每 rAF 一次;全应用所有音频驱动视觉的唯一数据源。

**动效(信号侧规范)**:每帧对 `getAnalyser()` 执行**恰一次** `getByteFrequencyData`(复用单 Uint8Array,零分配),经 store 分发,**禁止任何组件各自采样**。统一频段表(fftSize 256,bin≈187.5Hz@48k):检测频段 bins 0–2(kick 42–105Hz 与贝斯)、低频能量 low=mean(bins 0–3)、中频 mid=mean(bins 6–32)(1.1k–6kHz,琶音与 pad 泛音)、高频 high=mean(bins 40–96)(7.5k–18kHz,恰好是引擎 6.5k 高通的 hat)。**唯一低频命中检测器**:E=mean(bins 0–2)/255,flux=E−E_prev;命中条件 flux > max(0.045, 1.5×近 0.7s flux 中位数) 且 E>0.28;不应期 250ms(引擎最快 kick 间隔≈508ms@118bpm,安全);静音门:近 500ms E<0.12 或 `isPlaying()`=false → 检测器关闭;play/seek 后 300ms 预热期不触发(防不连续假峰)。命中事件经 store 广播——低音破阵、心跳光环、脉搏共用同一事件,永远同拍。

**趣味**:整个 App 只有一条心电图——歌词粒子、播放键、迷你条发丝线在同一毫秒一起被同一次鼓点打动,这种「全屋同拍」是假动画装不出来的。

**中断**:seek → 清空 flux 历史并进入 300ms 预热;暂停 → 检测器门控,所有订阅者各按自身规格静止。

**降级**:RM 下检测器与装饰性订阅全部不启动;信息性数值(进度)不经此总线。

**验收**:E2E hook 断言每帧 `getByteFrequencyData` 调用数恒为 1(多订阅者不叠加);暴露 `__sona.bassDebug()` → {triggerCount, lastInterval}:drive 情绪曲目播放 10s 断言 triggerCount≥8 且所有间隔 ≥250ms;暂停 3s 期间增量=0;加载后未播放(静音)5s 触发=0(M4 硬性验收);seek 后 300ms 内触发=0。

### 1.3 鱼贯与涟漪(入场错峰统一规范)

**触发**:视图首挂载、Tabs 切换后的内容替换、搜索/筛选结果替换、导入完成刷新;重排序不适用(重排走 FLIP,见 1.8)。

**动效**:**全应用唯一错峰口径**——列表(曲目/队列):第 i 行 delay=min(i,11)×40ms(错峰名额默认 12,第 13 行起共用 440ms;场景总预算不足时名额可压至 8——侧幕、起拍即此例,其后条目共用末位 delay),每行 opacity 0→1 + translateY(12px→0),`--t-med --glide`,整段编排 ≤720ms。网格(歌单卡):按 (row+col) 对角波纹,delay=(row+col)×30ms,对角线数上限 8(最大 delay 210ms),每卡 opacity 0→1 + translateY(16px) + scale(0.98→1),`--t-slow --glide`;波源优先取触发点(被点的 Tab/卡片)所在角,未知则左上角。仅首屏可视区内条目参与错峰,视口外与虚拟化行零动画直接呈现。

**趣味**:波纹从你点击的地方漾开——点左边的 Tab,内容从左上角涌出;点右边的卡,涟漪从右边荡过来。界面像是从指尖倒出来的。

**中断**:错峰期间用户滚动或点击 → 取消所有未开始的 delay,在途条目 `--t-fast` 内直达终态;错峰期间数据再次变更 → 先杀光在途入场再开新编排,禁止双重错峰叠加。入场期间 pointer-events 不锁,任何行立即可点。

**降级**:无位移无错峰,整个容器单次 opacity `--t-fade`(120ms)淡入。

**验收**:Playwright:挂载 30 行曲目列表,读 computed animation-delay:第 6 行=200ms、第 13+ 行=440ms;虚拟化视口外行 getAnimations() 为空;错峰进行中(t=100ms)触发点击,断言 200ms 内全部行 opacity=1;网格 4×4 断言 delay(r2,c1)=90ms;emulateMedia reduce 下断言无 translateY 且容器淡入 ≤150ms。

### 1.4 指尖分寸(hover/press/focus 三态标准)

**触发**:对应指针/键盘状态,适用于全部组件类。

**动效**:Button:hover 背景色 `--t-fast` ease;press scale(0.96) `--t-fast --pop`(松手靠 pop 的 6% 过冲回弹);disabled 零 transform、opacity 0.45。IconButton(≤40px):press scale(0.90)。Chip:press scale(0.94)。Card:hover translateY(-4px) scale(1.015)+shadow `--t-med --glide`;press translateY(-1px) scale(0.99)。ListItem:hover 背景 `--t-fast` ease,行内操作按钮 opacity 0→1 + translateX(4px→0) `--t-fast --glide`;press scale(0.995)。Slider thumb:hover scale(1.2) `--t-fast --pop`;拖拽中 scale(1.35) 且零过渡(1:1 跟手);松手 `--t-med --spring` 归位(进度 Slider 保留唯一结构特例:静止态 thumb 隐藏,hover/focus-visible 时 scale 0→1,见 3.6)。Switch:滑块行程 `--t-med --spring`,按下瞬间滑块向目的方向 scaleX(1.2) 拉伸。**梯度规则**:控件越小按得越深(icon 0.90 < chip 0.94 < button 0.96 < card 0.99)。Focus:`:focus-visible` 外描边 2px accent 零延迟即现(transition-duration 0s),键盘 Enter/Space 同样触发 press 动画;hover 效果仅在 (hover:hover) 媒体下启用,触屏只保留 press。

**趣味**:按压深度分级像真实材料——小键帽按到底,大琴键点到即止,指尖能「读」出控件的质量。

**中断**:全部 CSS transition 自然重定向;按住中途指针移出 → `--t-fast --glide` 回弹。

**降级**:一切 transform 反馈替换为颜色反馈(press=brightness(0.92) `--t-fade`),Card 悬停只留阴影变化,Slider thumb 用描边加粗替代放大,Switch 滑块瞬移+颜色 `--t-fade`。

**验收**:组件画廊 E2E:逐类模拟 hover/press/focus,读 computed transform 矩阵断言 scale 精确值(IconButton press 矩阵 a=d=0.90);断言 `:focus-visible` 的 outline transition-duration=0s;Tab 键聚焦后按 Enter 断言 press 缩放出现;emulateMedia reduce 下 press 期间 computed transform=none 且 filter 含 brightness;(hover:none) 仿真下 hover 态样式不生效。

### 1.5 吐司叠罗汉(Toast 编排)

**触发**:任何 Toast 反馈(全应用统一,含收藏、加入歌单、删除撤销、导入导出、保存入库)。

**动效**:位置底部居中,bottom=迷你播放条高度+12px,永不遮控制区。入场:opacity 0 + translateY(16px) scale(0.9) → 终态,`--t-med --spring`。堆叠:最多同时可见 3 条;新 Toast 从底部进入,旧的依次上移 8px 并 scale(0.95)/scale(0.90)、opacity 0.8/0.6(`--t-med --glide`);出现第 4 条时最旧者立即退场。退场:opacity→0 + translateY(8px),`--t-fast --glide`(铁律一:退场为入场约 0.6 倍)。**计时全应用统一**:普通 3200ms 自动消失,带撤销操作的 6000ms;hover/focus 悬停暂停全部计时器,移出恢复。去重:800ms 内同文案不新增,原 Toast scale 1→1.06→1(`--t-fast --pop`)脉冲一次并追加「×2」计数。点按或下滑手势(位移>24px)立即以 `--t-fast --glide` 退场。aria-live=polite。

**趣味**:重复消息不排队——原 Toast 原地「拍胸脯」并亮出 ×2 徽记,连点 5 次收藏也只有一张吐司在数数。

**中断**:退场动画中来了新 Toast 不等待,并行编排;队列里超过 3 条的积压合并为最后一条带计数。

**降级**:入退场均为 opacity `--t-fade`,堆叠位移瞬时重排,计时与 ×2 计数逻辑不变。

**验收**:E2E:600ms 内触发 5 条不同 Toast → 断言可见 ≤3、最旧的已移除、第 2 旧者 computed transform 含 scale(0.95);800ms 内同文案两次 → DOM 仅 1 条且文本含 ×2;hover 后等 4s 断言仍存在,移出后 3200ms 内消失;断言容器 bottom 偏移=迷你条高度+12px;reduce 下 getAnimations() 仅 opacity 且 ≤150ms。

### 1.6 骨架有礼(Skeleton 规则)

**触发**:仅「内容确实异步且不可预测」的首次加载(SONA 中 localStorage 同步可得,故仅限曲库首开的封面材质生成等场景);同会话二次进入、缓存命中一律不出骨架。

**动效**:**300ms 沉默期**——内容 300ms 内就绪则骨架从不渲染(防闪);一旦渲染,最短驻留 400ms(防单帧闪现)。形状与真实布局逐块对位,高度误差 ≤4px,行数=视口可容行数+2,杜绝整页骨架海。Shimmer:`::after` 渐变条 translateX(-100%→100%) 1200ms linear infinite(transform-only),全页骨架共用同一起始时间戳,扫光同相位横过整页。退场:真实内容在骨架之上交叉淡入 opacity `--t-med --glide`,骨架尺寸=终态尺寸故零布局位移,随后按 1.3 规范入场。

**趣味**:全页骨架共享一个相位——扫光像一束车灯从整页碾过,而不是每根骨头各自闪烁的圣诞灯;300ms 沉默期意味着足够快的加载连骨架的脸都见不到。

**中断**:内容在最短驻留期内到达 → 等满 400ms 再交叉淡入;用户切走视图 → 立即销毁,无退场动画。

**降级**:shimmer 移除(静态 surface-2 色块),交叉淡入降为 `--t-fade` opacity。

**验收**:E2E 用生成延迟桩:延迟 200ms → 断言 .sk 从未进入 DOM;延迟 500ms → 骨架可见 ≥400ms 后交叉淡入,内容容器 getBoundingClientRect 前后偏移 ≤4px;两个骨架块的 ::after 动画 startTime 相同;reduce 下 .sk::after 无动画。

### 1.7 昼夜翻面(主题切换)

**触发 A**(用户点主题 IconButton):(1) 图标天体交接——出场图标 translateY(±120%) rotate(∓40deg) + opacity→0,入场图标反向归位;transform 用 `--t-slow --spring`,opacity 用 `--t-med` ease;(2) 支持 View Transitions 时:以按钮中心为圆心的 clip-path 径向揭幕,`--t-slow --glide`,新主题从指尖扩散;(3) 不支持则回退:body 及壳层组件的颜色类属性过渡 `--t-med --glide`(仅颜色,零 transform);(4) canvas 类视觉(封面材质/粒子色)下一帧起在绘制内部用 280ms 线性插值追新令牌,不走 CSS。**触发 B**(系统 prefers-color-scheme 变化且用户未手动锁定):跳过径向与图标大动作,仅执行 (3)——没人按按钮就不许从按钮爆发。

**趣味**:太阳沉入按钮的地平线、月亮带着 -40° 的倾角升起——这颗 40px 的按钮是个微型天文馆;点下去时,夜色真的是从你指尖泼向整个屏幕的。

**中断**:转场中再点 → CSS 路径自然重定向;VT 路径队列深度为 1,第二次点击令当前转场 skipTransition() 直达终态再开新场。

**降级**:无图标位移(opacity `--t-fade` 直切)、无径向揭幕,颜色交叉缩至 `--t-fade`。

**验收**:E2E:点击切换 → data-theme 翻转、body computed transition-duration=280ms、太阳图标矩阵含 translateY 负位移;150ms 内连点两次 → 零控制台错误且终态与点击次数奇偶一致;stub 掉 document.startViewTransition → 走颜色交叉路径且无 clip-path 动画;模拟系统主题变化 → 无径向、无图标行程;reduce 下仅 opacity/颜色 ≤150ms。

### 1.8 视图接力(视图转场机制与 FLIP 规则)

**触发**:一切视图/层级变化的底层机制;方向语义由 2.5「移步换景」定义。

**动效**:首选 View Transitions API:同级视图 root 交叉淡入 + 水平 ±24px 位移,`--t-med --glide`;迷你条→正在播放为共享元素转场(封面 view-transition-name: cover,自 48px 缩略图 morph 至主视觉),`--t-slow --glide`,控制区延迟 120ms 后 `--t-med` 淡入。回退规则(无 startViewTransition):(1) 同级切换 → 旧视图 opacity `--t-fast` 淡出 + 新视图按方向语法水平 ±24px→0 `--t-med --glide` 滑入(层级深入/返回则垂直 16px);(2) 唯一保留的手写 FLIP 是封面 morph(测 first/last 矩形,纯 transform 插值,`--t-slow --glide`)——这是招牌镜头,值得手写;(3) 任何回退都禁止动画 width/height/top/left。列表拖拽重排同为 FLIP:被让位的行 transform `--t-med --glide`,被拖行零过渡 1:1 跟手。

**趣味**:招牌镜头只有一个且亲手打磨,其余全部交给统一机制——克制本身是品位。

**中断**:转场中再次导航 → VT 路径 skipTransition() 后开新场;FLIP 路径取当前插值矩形为新 first 继续,位置连续;展开途中按 Esc → 从当前位置反向收回,永不跳变。

**降级**:一切视图变化=`--t-fade` opacity 交叉淡入,无滑动、无 morph、无 FLIP。

**验收**:Playwright(Chromium):展开迷你条,转场中帧截图断言封面矩形在 48px 与终态间插值且存在 ::view-transition 伪元素;注入 startViewTransition=undefined → 断言封面元素 getAnimations() 只含 transform/opacity(border-radius 豁免除外)且无 width/top 条目;reduce 下切换仅 opacity ≤150ms。

---

## 二、App Shell:迷你播放条、队列、导航

### 2.1 起拍(冷启动入场序列)

**触发**:首次加载/刷新。全程不阻塞输入(pointer-events 始终开启)。

**动效**:时间轴——t=0:--bg 由内联关键样式即时铺色(零白闪),hue 渐变材质层 opacity 0→1,`--t-slow --glide`;t=80ms:导航栏 translateX(−8px)+opacity 入场,`--t-med --glide`;t=140ms:视图内容——标题先行,列表行/卡片按 1.3 规范错峰(间隔 40ms、名额压至 8),各 `--t-med --glide`(数据未就绪时 Skeleton 走完全相同编排);t=320ms:迷你条压轴,translateY(16px) scale(0.96) opacity 0 → 恒等,`--t-slow --spring`(整场唯一的弹跳);若 localStorage 有 PlayerState,迷你条入场时已带上次曲目的标题与 hue,发丝线停在恢复的进度百分比上。整场 ≤800ms 收束。

**趣味**:开台顺序:先亮场灯(hue)、再搭台(导航栏)、摆好歌单(列表),乐队最后一个走上台(迷你条)带着唯一一次 --spring 鞠躬——而且它记得上次演到哪。

**中断**:序列完成前任何 keydown/pointerdown → 全部入场动画同帧 .finish() 快进到终态;t=0 起点击任何可交互元素都立即生效。

**降级**:全部内容即时就位,无错峰无弹跳,单次整体呈现(`--t-fade` 以内)。

**验收**:预置 localStorage PlayerState 后刷新:断言迷你条动画 startTime ≥320ms 且 easing 为 spring linear() 曲线,发丝线 scaleX 等于持久化进度 ±1%;断言第 9 张卡片无入场动画;t≈100ms 时按任意键 → 50ms 内 getAnimations() 全部 finished;t≈50ms 点击某曲目行 → play action 已分发;RM 仿真断言启动全程仅 opacity 且 ≤150ms;截图断言 t=0 无白闪(首帧背景色 === --bg)。

### 2.2 脉搏(迷你条进度发丝线)

**触发**:播放期间持续;seek、切歌、低频命中事件(订阅 1.2 总线)。

**动效**:迷你条上缘 2px 发丝线,transform: scaleX(getTime()/getDuration()),transform-origin:left,由共享 rAF 每帧直写(播放中无缓动——时间本身就是缓动);aria-hidden(进度语义由 Slider 承担)。seek:scaleX 用 `--t-fast --glide` 滑到新值后恢复逐帧跟踪。切歌:opacity 80ms 降 0 → scaleX 瞬时归零 → opacity 80ms 回 1(绝不倒放进度,倒放是在谎报时间)。低频脉冲:同几何的辉光层(box-shadow 预烘焙),收到总线命中事件时 opacity 0→0.5→0,180ms ease-out(信号同步微时序豁免),不应期由总线统一保证。

**趣味**:歌被收进小小一条时,发丝线仍随真实低音轻轻发亮——App 被折叠了,心跳还在;暂停时绝对纹丝不动(静音零触发是可断言的诚实)。

**中断**:脉冲期间的再次命中被总线不应期吞掉;seek 滑动中再次 seek 从当前值重定目标。

**降级**:无脉冲;位置每 1000ms 离散步进更新(信息性运动保留)。

**验收**:播放确定性种子曲目 2s,断言 scaleX 与 getTime()/getDuration() 误差 <1%;seek 至 50%,断言 200ms 内 transform 到达 0.5;暂停 3s 内辉光层 opacity 变化次数 === 0;切歌断言 scaleX 无从高到低的过渡帧;RM 仿真断言无辉光动画且更新间隔 ≥1000ms。

### 2.3 开幕(迷你条 ↔ 正在播放:共享元素变形 + 粒子倾珠)

**触发**:展开——点击迷你条非按钮区域、聚焦后 Enter/Space、或迷你条上划 ≥24px(触屏);收起——下箭头按钮、Esc、抓手处下拉 ≥80px 或甩动速度 ≥0.5px/ms。

**动效**:分三层。【变形(transform FLIP)】封面 48×48 → min(62vw, 380px):外层 translateX(`--t-slow --glide`)+ 内层 translateY(`--t-slow --glide`,延迟 40ms)双层包裹产生轻微弧线飞行;正在播放整页作为 sheet 自视口底部 translateY(100%)→0,`--t-slow --glide`;封面圆角 8px→20px 与飞行同曲线(border-radius 单点豁免)。【交叉淡化(opacity)】迷你条标题/按钮在前 40% 内 opacity→0(`--t-fast`);内容层自 t≈40% 起依次上浮(translateY 24px→0 + opacity 0→1,各 `--t-med --glide`):标题 +120ms、控制区 +180ms、进度环 +220ms;进度交接:变形 ≥70% 时迷你条发丝线 opacity→0,同值的完整进度 Slider 同步淡入,两者百分比误差 <0.5%;目标区控件在 70% 前 pointer-events:none。【粒子入场(canvas)】扩张完成(t=480ms)后歌词粒子才开始聚合,且初始位置不是随机撒点——全部粒子生成于迷你条封面起始 rect 内,带 2–5px/frame 向外初速,再接「聚沙成字」(3.1)弹簧归位;全流程 ≤1.4s 就绪。收起:按钮/Esc → 反向 `--t-med --glide`(出场快于入场),粒子加重力 0.35px/frame² 坠落并 200ms 渐隐;手势收起继承手势速度,时长在 280–480ms 间按速度取值。**焦点管理(Modal 语义)**:展开后焦点落到播放键;Esc 收起且焦点还给迷你条。

**趣味**:封面带一点弧线「抛」上去——像把一张黑胶从架子上甩到唱机上;而迷你条其实是个首饰匣:粒子珠子从封面那一角倾泻而出,飞散又聚拢成当前那句歌词——原来这一条里一直装着整首歌。发丝线在 70% 处把进度值亲手交接给大 Slider,数值严丝合缝。

**中断**:整段用一组 WAAPI 动画驱动,展开中收起(或反之)调用 reverse() 从当前帧原速返程,任意时刻矩形帧间位移 <40px,永不跳变;快速反复点击按动画方向切换防抖,不排队;展开中途收起时内容层 `--t-fast` 渐出。

**降级**:零位移零飞行零粒子,新旧两态即时切换,静态歌词立即可见;焦点规则不变(展开→播放键,Esc→迷你条)。

**验收**:Playwright:展开后断言封面为同一 DOM 节点(data-shared-id)且 t=240ms 时 getBoundingClientRect 严格介于起止矩形之间;点击迷你条 700ms 内背景变形达 identity、页面可见;展开 160ms 后按 Esc,逐帧采样断言矩形连续(帧间 <40px)且回到迷你条矩形、焦点 === 迷你条元素、零控制台错误;交接瞬间断言 Slider aria-valuenow 与发丝线 scaleX 换算值误差 <0.5%;getAnimations() 断言除封面 border-radius 外仅 transform/opacity;RM 仿真:50ms 内页面可见且 document.getAnimations().length=0。

### 2.4 换幕(上/下曲全页色相与封面过渡)

**触发**:上一首/下一首按钮、自然播完自动切、队列点行、移除正在播放行。方向:next/自动 = 出场向左、入场自右;prev 反向。

**动效**:【色相(灯光)】shell 层两张叠放的全页渐变层,底层持旧 hue,顶层以新 hue opacity 0→1,`--t-slow --glide`,t=0 即启动。【封面(演员)】出场 translateX(∓24px)+opacity→0 `--t-med --glide`;入场自 ±24px→0 `--t-slow --glide`,延迟 80ms(灯光先行 80ms)。标题/歌手:同型,再延迟 40ms、位移 8px。迷你条封面/文字:同方向 8px 缩小版,`--t-med`。发丝线按 2.2 规则归零。频谱 canvas 不做任何过渡——引擎换曲后频谱自然形变即是过渡。

**趣味**:灯光先行——hue 渐变比封面早 80ms 开始换色,像现场演出里灯光师总比演员先动手;prev 时演员从反方向走回来,App 因此有了空间感。

**中断**(狂按 next):音频动作每按立即分发(engine.load autoplay),视觉永不阻塞输入;视觉重定目标:底层渐变按顶层当前 opacity 在 OKLCH 中插值出当下混合 hue 一次性重绘,顶层以最新 hue 从 0 重新淡入;重启至多 1 次/100ms,窗口内的连按只更新目标 hue。

**降级**:hue 即时切换、封面文字零位移即时替换。

**验收**:按 next:断言 hue 顶层 opacity 动画 1 帧内启动、封面入场动画 startTime 差 ≈80ms(±16ms);断言 next 入场初始 transform 为 translateX(+24px)、prev 为 −24px;300ms 内狂按 next ×5:零控制台错误、engine.getTrack().id 第 5 次按下后立即为第 5 首、+600ms 后终态 hue 等于第 5 首、无残留动画;RM 仿真断言切曲全程无位移动画。

### 2.5 移步换景(视图切换方向语义)

**触发**:导航栏项、快捷键 1–4、曲库 Tabs。机制走 1.8「视图接力」,本条定义方向与恒常层。

**动效**:方向由导航序号差决定:向后切(index 增大)旧视图 translateX(−24px)+opacity 1→0,新视图自 translateX(+24px)→0 + opacity 0→1;反向取反。两者并行交叉,均 `--t-med --glide`,总时长 280ms。**Shell 恒常层零动画**:hue 渐变材质、导航栏、迷你条在切换中纹丝不动(连续感的来源);各视图滚动位置在入场前恢复。导航当前项指示器落定时给一下 `--spring` 轻弹(物理归位)。

**趣味**:视图是滑过同一块色相材质上方的几片玻璃——背景从不重置,切来切去像在同一间屋子里踱步,正是「移步换景」的本义。

**中断**:切换中再切,出场者继续走完;在途入场者就地转为出场(从当前计算 opacity/transform 起);同屏动画视图数上限 2,第 3 个到来时中间视图立即 finish() 清场。终局约束:落定后有且仅有一个视图可见,其余 display:none。

**降级**:零位移,`--t-fade` 级 opacity 交叉即时切换。

**验收**:曲库→队列:断言新旧视图仅 transform/opacity 动画且时长 280ms,背景 hue 层动画数为 0;视图 1→4 与 4→1 断言位移方向符号与序号差一致;200ms 内连按 1、2、3:落定后恰一个视图可见、其余 display:none,+600ms 时 document.getAnimations().length===0、零控制台错误;RM 仿真断言切换无位移动画。

### 2.6 侧幕(队列开合)

**触发**:迷你条/导航的队列按钮、快捷键 Q。

**动效**:桌面:360px 面板自右侧 translateX(100%)→0,`--t-slow --glide`;移动端:70vh 底部 sheet translateY(100%)→0 同参数,遮罩 opacity 0→1 `--t-med`。行入场按 1.3 规范:前 8 个可见行 translateX(16px)→0 + opacity 0→1,自面板启动 120ms 后每行错峰 40ms,各 `--t-med --glide`;第 9 行起不参与动画。正在播放行例外:用 `--spring` 入场且行内电平表已在跳动。关闭:面板 `--t-med --glide` 滑出,行不做动画,遮罩同步淡出。

**趣味**:曲目们像乐手从侧幕依次列队上场,而正在播放的那行是主唱——唯一带 --spring 弹性入场,并且电平表进场时就已经在唱。

**中断**:开合中再次触发对面板 WAAPI reverse() 从当前位置返程,行错峰动画立即 finish();连点 N 次终态与点击次数奇偶一致。

**降级**:面板与行零位移即时出现,无错峰,遮罩即时。

**验收**:打开队列,断言面板动画仅含 transform/opacity 且时长 480ms;断言第 3 行动画 delay ≈ 120+80ms、第 9 行无动画;正在播放行 easing 为 spring linear() 曲线;300ms 内连点 5 次,断言零控制台错误且终态开合与奇偶一致、+600ms 时 document.getAnimations().length===0;RM 仿真断言面板 50ms 内就位且无位移动画。

### 2.7 谢幕(队列划动移除)

**触发**:队列行水平划动;意图判定 |dx|>1.5|dy|(8px 死区后)。拖拽排序见 4.7「拎起一行」(歌单与队列共用同一规格)。

**动效**:行 1:1 跟手,opacity 随位移线性降至 50% 宽度时 0.4;释放位移 ≥35% 宽 或 甩动 ≥0.6px/ms → translateX(±110%) 退场,时长随甩速在 280→120ms 压缩,`--glide`,下方行 translateY 补位 `--t-med --glide` 后提交重排;未达阈值 `--t-med --spring` 回弹(物理归位)。移除正在播放行:允许,立即触发「换幕」切下一首;Toast「已移除 · 撤销」(带撤销,6000ms,走 1.5 规范)。

**趣味**:退场时长继承你的甩劲——甩得越狠,走得越快(280ms 压到 120ms),行为有质量、有惯性。

**中断**:划出中再次按住,动画取消、从当前 X 继续跟手;补位动画中开始新拖拽,取消并从当前位置重算 FLIP。

**降级**:功能完整保留——移除即时消失、无滑出,兄弟行即时补位。

**验收**:E2E:划 40% 宽释放 → store 队列长度 −1 且 Toast 可见;划 20% → 回弹且未移除;15% 位移但甩速 0.8px/ms → 移除;移除正在播放行断言 engine.getTrack() 已是下一首;RM 仿真断言全程仅 opacity 且 ≤150ms。

---

## 三、重力歌词播放页

> 本章 canvas 粒子系统豁免 transform/opacity 限制,但全部注册进 7.1 的共享单 rAF 与粒子预算(总量 ≤1200、DPR≤2),帧因子 f=clamp(dt/16.667, 0.25, 2.5)。

### 3.1 聚沙成字(粒子聚合与行间字形流变)

**触发**:getTime() ≥ lyrics[i].t − 0.05s 时第 i 行激活(DOM 高亮与 canvas 重定向同帧发生,满足 <200ms 同步)。

**动效**:复用 GRAVITY ROOM 离屏 fillText 采样(alpha>128,采样步长按预算自适应),字号 clamp(H×0.16, 宽度 86% 适配)。粒子预算:字形 ≤900、星尘 ≤240、总量 ≤1200(降级阶梯见 7.1)。弹簧归位:半隐式欧拉,v=(v+(target−p)×k×f)×0.88^f,k=0.055/frame²;|v|<0.05px 且 |d|<0.5px 时置 resting 并吸附,整行约 700ms 内落定。换行流变:新旧采样点按 x 列桶匹配(左对左、右对右,避免交叉乱流);逐粒 stagger:delay=(hx_new/W)×240ms+rand(0,40ms)——新行按阅读顺序从左到右「写」出来;等待期粒子以 0.94^f 阻尼惯性漂移(holdUntil 模式)。新行粒子少于旧行:多余粒子转为「字灰」,重力 0.12px/frame² 下落 + opacity 420ms 渐隐后回收进池;多于旧行:从随机现存粒子位置分裂补足(材质分裂而非凭空出现)。上下伴行为 DOM 文本(抽象 Typography 组件):0.6em、opacity 0.35、translateY ±64px,自然换行时槽位上移用 `--t-slow --glide`(仅 transform/opacity)。

**趣味**:新行像被一支看不见的笔从左到右写出来;而当一句短行接在长行后面,用剩的粒子化作字灰簌簌落下——说完的话,烧成灰。

**中断**:morph 未完成时新行到来 → 就地重定向,保留当前位置与速度,stagger 上限压缩到 120ms,不排队、不跳变。seek 场景交由 3.7「时间折跃」。

**降级**:完全无粒子(引擎不初始化),歌词渲染为静态文本列表,当前行满 opacity + accent 色,其余 0.35,行切换瞬时完成。

**验收**:测试环境暴露 `window.__sona.lyricsDebug()` → {activeIndex, settledRatio, particleCount, hasNaN}。Playwright:播放至 lyrics[3].t+1.2s,断言 settledRatio>0.9、particleCount≤1200、hasNaN=false;activeIndex 变更时刻与 getTime() 对照误差 <200ms;RM 模拟下断言无 canvas 粒子(particleCount=0)且当前行 computed opacity=1、邻行 0.35。

### 3.2 低音破阵(低频冲击波)

**触发**:订阅 1.2 总线的低频命中事件(检测参数、不应期、静音门、预热期全部由总线统一)。

**动效**(canvas):以字形质心为震中,I(d)=A×(1−d/R)²,A=3.2×clamp(flux/0.09, 0.6, 1.4) px/frame,R=0.9×画布对角线,附 ±8% 切向分量(有机旋流);粒子置 resting=false,速度上限 12px/frame;恢复即 3.1 的弹簧归位(约 500–700ms 回形)。morph 进行中命中 → 冲击 ×0.5 保证换行可读。

**趣味**:冲击波本身不可见——你只看见歌词被自己的鼓点打得一颤又立刻站回原位;震中附近的粒子被击中的 120ms 内放大到 1.25× 并衰减,像被镲片打亮的尘埃。

**中断**:恢复期再次命中 → 速度叠加(仍受 12px/frame 上限);冲击中暂停 → 弹簧继续跑 600ms 优雅落定后静止,不冻帧不跳变;冲击中 seek → 交给 3.7 重定向路径。

**降级**:无粒子即无冲击波,无任何替代闪烁(遵循静态歌词规范)。

**验收**:检测器验收见 1.2(triggerCount/不应期/静音零触发/预热期);视觉侧:命中后断言 settledRatio 先降后升且 900ms 内回到 >0.9。

### 3.3 声息风尘(三频段背景)

**触发**:随播放持续运行,数据取自 1.2 总线(low/mid/high)。

**动效**:① 呼吸——背景 hue 渐变层 target scale = 1+0.04×low^1.6(gamma 1.6 压噪声底、扩峰值),辉光层 opacity = 0.5+0.3×low^1.6;非对称平滑:攻击 lerp 0.35/frame(≈90ms 吸气)、释放 0.06/frame(≈450ms 呼气),仅 transform/opacity,每 rAF 写 style。② 风——wind = clamp((mid−0.35)×0.9, −0.15, +0.45) px/frame²,风向 θ(t)=0.6sin(t/9000)+0.35sin(t/4100) 缓慢游移;星尘受全额风力,字形粒子只受 20%(稳态偏移 ≈1.6px,文字微微摇曳但永远可读)。③ 星尘——每帧生成 floor(high²×6) 颗微粒,池上限 240(计入 1200 总预算,降级时最先裁);每颗 1–2px、寿命 700–1400ms、opacity 80ms 冲到 0.9 后衰减、上浮 0.1–0.3px/frame + 风。暂停 → 各频段值按各自释放曲线 ≈600ms 内呼出归零,背景静止为素渐变。

**趣味**:攻击快、释放慢的非对称平滑让页面在重拍上猛地吸一口气、再慢慢叹出来——整页像在侧耳听歌;hi-hat 一响,星尘应声亮起,是灰尘恰好飘过光束。

**中断**:暂停/恢复反复切换 → 平滑器天然连续,无跳变;主题切换 → 星尘颜色读一次 CSS token 缓存,下一帧生效(见 1.7-(4))。

**降级**:静态渐变定格在 scale 1.02、辉光 0.6,无呼吸、无风、无星尘。

**验收**:映射函数纯函数化并单测:breath(0)=1.000、breath(1)=1.040、单调;阶跃响应:0→1 在 ≤120ms 达 90%,1→0 在 ≥400ms 才降到 10%(非对称断言)。E2E:播放 5s 采样背景层 transform 方差 >0;暂停 1s 后连续 10 帧 transform 不变;星尘计数任意时刻 ≤240。

### 3.4 心跳光环(播放键节拍进度环)

**触发**:进度随播放持续;脉动订阅 1.2 总线命中事件(与冲击波、发丝线脉冲永远同拍)。

**动效**:64px 主 IconButton 外包 SVG 圆环 r=34px、stroke 3px、周长 213.6px,进度用 stroke-dashoffset 在共享 rAF 内按 getTime()/dur 更新(SVG paint 属性,无布局开销;环 wrapper 与按钮内层是独立 transform 层)。脉动:WAAPI 从当前计算 scale 出发 → 1+0.04×clamp(flux/0.09, 0.6, 1.4)(即 1.024–1.056,力度诚实映射),上行 60ms ease-out(信号同步微时序豁免),回落 `--t-slow --spring`(物理归位);同时一层模糊描边副本 opacity 0→0.5→0 共 `--t-med --glide`。节拍之间环绝对静止——静,脉搏才读得出来。进度语义:时间即真理——dashoffset 永不补间,seek 后下一帧直接跳到正确值。

**趣味**:环是伪装成心跳的诚实 VU 表:实拍重踩振幅 1.056,幽灵鼓点只轻轻一跳 1.024——盯着播放键,你能「看见」鼓手下脚的轻重。

**中断**:脉动中按下播放键 → 按钮内层自身 press scale 0.92(`--t-fast --pop`)与环 wrapper 各自独立,互不打架;连续节拍 → WAAPI 从当前值重启,无叠加漂移;暂停 → 总线门控,环冻结在当前进度,零脉动。

**降级**:进度环保留(信息性),脉动与辉光全部禁用。

**验收**:E2E:drive 曲目播放 10s,ring.getAnimations() 新建脉动动画 ≥8 次;暂停 5s 新增=0;3 个采样时刻断言 dashoffset = (1−getTime()/dur)×213.6 误差 <1%;seek 至 50% 后下一 rAF dashoffset 即为 106.8±1(无补间);RM 下播放 10s getAnimations()=0 且进度仍前进。

### 3.5 一息之间(播放/暂停形变与全页屏息)

**触发**:点击主 IconButton、迷你条播放键或非输入焦点下 Space(三处状态经 store 单源同步)。

**动效**:图标形变:三角/双竖条两层叠放,交叉切换 opacity + scale 0.6→1,`--t-fast --pop`;按压 :active scale 0.92,松开 `--t-fast --pop` 回弹。状态即时性:UI 乐观更新——点击当帧(<16ms)开始形变,绝不等待 AudioContext.resume()。物理呼应(canvas):暂停 → 全部歌词粒子速度 ×0.5 并自然落定,星尘停止生成,背景按呼气曲线归零——整页屏住呼吸;播放 → 自中心 0.8px/frame 的轻柔径向唤醒脉冲,按钮做一次 1→1.08→1 的 `--t-slow --spring` 回弹,像唱针落盘。

**趣味**:按下暂停的不只是声音:粒子放缓落定、星尘熄灭、背景吐出最后一口气——整个页面陪你屏息;再按播放,一圈轻的涟漪把所有尘埃叫醒。

**中断**:100ms 内连续快速切换 → 图标层为状态驱动 class,CSS transition 从当前计算值原路反演,无残影;--spring 回弹动画取消重启。

**降级**:图标瞬时互换,无回弹、无唤醒脉冲、无粒子(本就无)。

**验收**:E2E:点击后同一 tick 内 aria-label 在「暂停/播放」间翻转且 engine.isPlaying() 一致;双击间隔 <100ms 后终态正确,可见图标 computed opacity=1、隐藏层=0(无残影);Space 在列表获焦时不触发、body 焦点时触发;axe 断言按钮可访问名随状态更新。

### 3.6 指尖时间(进度与音量 Slider 手感)

**触发**:进度/音量 Slider 的 hover/focus/拖拽/键盘操作(抽象 Slider 组件,验证 aria-valuenow/min/max)。

**动效**:进度 Slider(1.4 的唯一结构特例):静止态 4px 轨道、thumb 隐藏;hover/focus-visible → 轨道容器 scaleY(2)、thumb scale 0→1,各 `--t-fast --pop`。拖拽中:thumb scale 1.35(对齐 1.4 全局值)且零过渡;上方 mono 字体 tooltip 随 transform 跟手,显示目标时间 + 该时间点歌词行截断 ≤14 字(拖着进度条读歌词找副歌)。跟手张力:填充边缘经单帧临界阻尼 lerp(系数 0.55)落后指尖约 30ms,像在拽一卷磁带;松手 thumb `--t-med --spring` 归位。提交语义:拖拽期间绝不连续 seek(避免引擎 killSeg 风暴),视觉跟手、松手才 engine.seek(t);键盘 ←/→ = ±5s,150ms 内连按合并后立即提交;Home/End 到 0/dur−0.1。音量 Slider:↑/↓ 或拖拽映射 setVolume(引擎内部 v² 感知曲线);喇叭图标弧线按阈值 0/40/75 分级显隐,`--t-fast` opacity 交叉切换;点击图标静音/恢复记忆值;拉满 100 时 thumb 做一次 `--t-fast --pop` 微过冲「到顶」确认。

**趣味**:tooltip 里不只有时间,还有那个时间点的歌词——你不是在找 1:47,你是在找「那句」;填充边缘慢半拍的磁带张力让快进有了重量。

**中断**:拖拽中 Esc 或 pointercancel → 取消提交,进度 `--t-fast --glide` 滑回实时 getTime();拖拽中曲目自然结束 → onEnded 正常走,tooltip 立即隐藏、拖拽上下文废弃。

**降级**:轨道/thumb 状态瞬时切换,张力 lerp 关闭(填充精确贴指尖),tooltip 保留(信息性)。

**验收**:E2E:拖至 60% 途中断言 engine.getTime() 未变(未提交),松手后 getTime() ≈ 0.6×dur ±0.3s;聚焦进度条按 ArrowRight → aria-valuenow +5 且音频时间前进;Esc 中止拖拽后 aria-valuenow 回到实时值;音量 ArrowUp 后 engine.getVolume() 与 aria-valuenow 一致;RM 下拖拽时填充位置与指针 x 完全一致。

### 3.7 时间折跃(morph 进行中 seek 的裁决)

**触发**:Slider 提交、←/→ ±5s、或点击上下伴行(伴行可点,seek 至该行 t——歌词即导航)。

**动效**:二分查找新行索引。同行:粒子状态不动,总线清空 flux 历史并进入 300ms 预热。跨行:硬重定向——保留位置与速度,但 stagger 改为按距离:delay=(d_i/W)×160ms(近者先至,读作「集结跳跃」而非「重写」);前 400ms 弹簧临时增益 k×1.5=0.083 再回落 0.055,修正 ≤700ms 完成;DOM 高亮与目标位在 seek 后同帧更新(满足 M4「seek 后当前行立即校正」<200ms)。伴行 DOM:seek 不播放逐槽滑动(连滑 5 行是噪音),改用 `--t-fast` opacity 交叉切换;自然换行才有 `--t-slow --glide` 槽位上移。连续快速 seek(键盘连打):目标重算节流至 90ms 一次、末次为准;速度始终延续——粒子从不瞬移,只是不断折向最新的真相。背景频段保持各自释放曲线不闪跳。

**趣味**:向回 seek 超过 3s 时,底部 8 颗字灰逆着重力升起 300ms 后隐去——倒带时,连烧掉的词都短暂地「未曾说出」。

**中断**:seek 中再 seek → 节流合并;暂停态 seek → 重定向照常运行至落定后静止(高亮必须校正,即使无声)。

**降级**:静态列表直接切换高亮行,无其他任何动效。

**验收**:E2E:在第 3 行换行后 +100ms(morph 中)seek 至第 7 行 t:`__sona.lyricsDebug().activeIndex` 在 200ms 内正确,settledRatio>0.9 在 900ms 内达成,零控制台错误;1s 内连按 10 次 ArrowRight → 终态行号与终态时间匹配、particleCount≤1200、hasNaN=false;暂停态 seek 后高亮行 200ms 内正确;向回 seek 5s 断言字灰上升粒子恰好 ≤8 且 400ms 内消失。

---

## 四、曲库与歌单

### 4.1 追光(Tabs 指示器)

**触发**:点击 Tabs(歌单/专辑/歌手/我的创作)或键盘 ←/→(roving tabindex)。

**动效**:指示器仅 transform: translateX + scaleX;面板仅 opacity + translateX。指示器位移 `--t-med --spring`(物理归位);前 40%(约 112ms)沿运动方向拉伸,视觉宽度上限 = 静止宽 + min(0.6×行程, 64px),transform-origin 置于运动方向后缘——前缘先行、尾缘回弹。内容面板按 1.8 回退条款 (1) 同步切换:旧面板 opacity 1→0(`--t-fast` ease),新面板 opacity 0→1 + translateX(按行进方向 ±24px→0)`--t-med --glide`。

**趣味**:指示器像被拉长的水滴:前缘先冲向目标 Tab,尾缘啪地跟上,--spring 曲线自带约 16% 峰值过冲的那一下回弹。

**中断**:动画未完再点第三个 Tab,指示器从当前插值位置直接重定目标(CSS transition 从 computed style 续走,不排队);旧面板动画立即跳终态;连点 N 次以最终选中为准。

**降级**:指示器瞬移、面板仅瞬时 opacity 切换,选中态由颜色 + aria-selected 表达。

**验收**:Playwright:从 Tab1 点 Tab3,t≈100ms 截取指示器 boundingBox 宽 > 静止宽;t≥450ms 与目标 Tab 宽误差 ≤1px、左缘对齐 ≤1px;150ms 内连点两次,终态停在最后选中 Tab 且零控制台错误;RM 模拟下 element.getAnimations() 为空。

### 4.2 真声电平(曲目行三态)

**触发**:pointer 悬停 / :focus-within 曲目行;播放中行常驻电平标记。

**动效**:全部 transform/opacity——行高亮用绝对定位的底色层做 opacity 0→1(`--t-fast` ease),不动画 background-color。悬停:序号 opacity 1→0(75ms),播放 IconButton opacity 0→1 + scale 0.6→1 `--t-fast --pop`;行尾操作(收藏、⋯)opacity 0→1 + translateX(-4px→0) `--t-fast --glide`;按下整行 scale 0.995 `--t-fast --pop`。播放中行:序号位替换为 3 柱电平(总宽 14px:柱宽 3px、间距 2.5px、高 12px,accent 色,aria-hidden),数据取自 1.2 总线(低 0–3 / 中 6–32 / 高 40–96 段均值),每 3 帧刷新(约 20fps)映射 scaleY 0.2–1.0,transform-origin bottom,帧间 lerp 0.3 平滑;行离开视口(IntersectionObserver)即停刷新。暂停:三柱以 `--t-med --glide` 滑至静止姿态 scaleY 0.45/0.7/0.55 并停帧(不归零)。悬停播放中行:电平与暂停按钮 `--t-fast` 交叉淡化。

**趣味**:电平是真的:接的是引擎实时频谱,暂停时它真的屏住呼吸凝在原地,而不是循环假动画——歌停了,柱子也停了。

**中断**:hover 中途进出由 CSS transition 从当前值自然反向;切歌瞬间电平直接重绑总线新数据,无重置动画。

**降级**:电平不动——静态 accent 音符图标 + aria-label「正在播放」;悬停显隐仅瞬时 opacity。

**验收**:E2E:播放后 500ms 内对柱子截取两次 transform 断言不相等;pause 后 400ms 再取两次断言相等且约等于静止姿态;将行滚出视口,断言刷新回调停止计数;RM 下断言渲染静态图标而非柱子。

### 4.3 鱼贯入座(列表入场)

**触发**:Tab 面板首次显示 / 打开歌单详情 / 导入完成后列表刷新(搜索过滤不走此规格,见 4.4)。

**动效**:严格执行 1.3 规范:每行 opacity 0→1 + translateY(12px→0),`--t-med --glide`,逐行 delay 40ms;仅首屏 ≤12 行参与 stagger,第 13 行起 delay 固定 440ms,整场 ≤720ms。首次数据加载显示 Skeleton(走 1.6 规则),就绪后原位替换真行再入场;虚拟化(>200 行,TECH.md 阈值)时只对渲染窗口内的行应用。

**趣味**:40ms 的节拍让整列像拇指洗牌——刷的一声码好;而且超过一屏立刻收手:第 40 行绝不会还在慢悠悠地飘。

**中断**:入场期间 pointer-events 不锁,任何行立即可点;入场中切走 Tab——本面板动画全部 cancel 跳终态,新面板重新入场;入场中滚动,新滚入的行不补动画(一次性 animation,播完即弃)。

**降级**:无 translate、无 stagger、整列表单次 `--t-fade` opacity 出现;Skeleton shimmer 关闭为静态色块。

**验收**:E2E:打开 20 行歌单,断言第 1 行与第 8 行 animation-delay 差 = 280ms、第 13+ 行 delay = 440ms;t≥800ms 所有行 opacity=1 且 transform 为 none;入场第 100ms 点击第 2 行,断言 store 触发 playTrack(交互不被动画阻塞)。

### 4.4 落键即寻(搜索即时过滤)

**触发**:曲库搜索 Input 键入。

**动效**:debounce 120ms;IME 组合期(compositionstart→compositionend)不过滤,compositionend 后立即执行一次;本地对 title/artist/album 做大小写不敏感子串过滤;命中子串以 `<mark>`(accent 10% 底)静态高亮;结果计数「共 N 首」mono 小字实时更新(aria-live=polite,播报另行 800ms 防抖)。动画刻意克制:留存行按 track id 复用 DOM 原地不动;仅新出现行 opacity 0→1 `--t-fast` ease,无 stagger;清除按钮(×)在 value 非空时 scale 0.6→1 + opacity `--t-fast --pop` 入场,Esc 清空并保焦点;结果恰好收敛到 1 行时该行 scale 1→1.015→1 `--t-fast --pop` 轻轻一顿。空结果延迟 300ms 才切空态(见 4.10),避免逐键闪烁。

**趣味**:收敛到唯一结果时那记 1.5% 的点头——列表替你说「就是它」;而中文用户全程不会被半个拼音的中间态骚扰。

**中断**:新键入取消未决 debounce;上一批渐显未完就有新结果——直接跳终态再应用;粘贴长串只触发一次过滤。

**降级**:无 pop、无单行点头,结果瞬时替换,仅保留 mark 与计数。

**验收**:E2E:以 50ms 间隔逐键输入 4 字符,埋点断言过滤仅执行 1 次;模拟 composition 事件序列断言组合中零过滤、compositionend 后过滤 1 次;结果收敛到 1 条时监听到 scale>1 的 transform 动画事件;清空后全列表恢复且不重播入场动画。

### 4.5 命名仪式(歌单新建/重命名)

**触发**:「新建歌单」Button / 行 ⋯ 菜单「重命名」。

**动效**:Modal 入场 opacity 0→1 + translateY(28px→0) + scale 0.96→1,`--t-slow --spring`;遮罩 opacity `--t-med` ease;焦点落名称 Input(重命名时全选现名)。错误态:空名提交——Input 容器 translateX 关键帧 0→-4→4→-2→2→0px 共 `--t-med`(ease-out)摇头,错误文案「歌单总得有个名字」opacity 0→1 `--t-fast`、role=alert;键入首个有效字符错误即 opacity→0(`--t-fast`)。名称上限 40 字,38/40 起计数变 accent。色相选择:8 个 hue swatch,选中 scale 1→1.15 `--t-fast --pop`,其余回 1。提交成功:Modal 出场 opacity→0 + translateY(12px) + scale 0.97 `--t-med --glide`(铁律一);新歌单行以 `--t-slow --spring` 入场(scale 0.9→1 + opacity),其上同 hue 薄膜层 opacity 0.3→0(`--t-slow --glide`)。

**趣味**:placeholder 由种子生成一个现成的好名字(如「深夜蓝 · 04」),直接回车也有品位;而空名提交时输入框会物理摇头拒绝你。

**中断**:入场中 Esc/点遮罩——从当前状态直接反向出场(`--t-fast`);提交中按钮 disabled 防双击;旧 Modal 出场未完再点新建,等 120ms 再进新 Modal 防叠影;localStorage 写失败按 TECH.md:Modal 保持打开 + Toast「本次更改不会被保存」。

**降级**:Modal 仅瞬时 opacity;不摇头——错误只靠文案 + aria;新行无 spring 无薄膜。

**验收**:E2E:空名提交断言 alert 可见、Input 触发过 translateX 动画(animationend)、store 无新增;键入 1 字符断言错误消失;成功后断言新歌单渲染且刷新页面仍在(persist);入场 100ms 时按 Esc,断言 400ms 内 Modal 移出 DOM、零控制台错误;焦点还给触发按钮。

### 4.6 落袋为安(加入歌单)

**触发**:曲目行 ⋯ IconButton → Dropdown「添加到歌单」(键盘 ↑/↓ 导航、Enter 选中、Esc 关闭并还焦点)。

**动效**:Dropdown 入场 transform-origin 锚定触发角,scale 0.9→1 + translateY(-6px→0) + opacity,`--t-med --spring`。选中:项内对勾 opacity 0→1 + scale 0.5→1 `--t-fast --pop`;菜单 120ms 后 `--t-fast --glide` 淡出;同时一颗 6px 歌单 hue 色圆点(position:fixed、aria-hidden)从菜单项飞向 Toast 落点:translate `--t-slow --glide`,末 20% 行程 opacity→0;Toast 在 delay 380ms 处按 1.5 规范入场(`--t-med --spring`)并叠 scale 1→1.03→1 `--t-fast --pop` 的「接住」一颤,文案「已加入《晨雾》」+ 同 hue 圆点 + 「撤销」,带撤销故 6000ms 后退场(1.5 规范)。已在歌单的项带对勾,再点为移除,Toast「已从《晨雾》移除」。

**趣味**:那颗 hue 色小圆点真的把歌「飞」进了歌单,Toast 接住时轻轻一沉——一条完整的物理因果链,而不是两个互不相干的弹窗。

**中断**:Esc/外点任意时刻关菜单(`--t-fast`);飞行中滚动无影响(fixed 坐标一次采样,落点容差 8px);快速连加——Toast 复用并刷新文案与计时(「已加入 3 首到《晨雾》」),飞点最多同时 2 颗;「撤销」即取消计时、逆操作回滚、文案变「已撤销」再 1200ms 出场;store 先提交、撤销为逆操作,不阻塞持久化。

**降级**:无飞点、无 spring——菜单与 Toast 瞬时 opacity,对勾直显,aria-live 播报结果。

**验收**:E2E:添加后断言目标歌单 trackIds 含该曲、Toast 文案含歌单名;点撤销断言移除且文案变「已撤销」;连加 2 首断言页面仅 1 个 Toast 且文案含「2 首」;RM 下断言飞点元素从未插入 DOM;纯键盘(⋯→Enter→↓→Enter)全流程可完成。

### 4.7 拎起一行(拖拽排序——歌单详情与队列通用)

**触发**:拖拽手柄 pointerdown(精确指针按下即抓起);触屏为行长按 280ms(期间行 scale 缓升至 1.02 预示可拖,先位移则让位给滚动)。本规格为全应用唯一拖拽排序规格,歌单详情与队列共用;队列的划动移除见 2.7。

**动效**(全 transform/opacity):拎起:行升为 ghost——scale 1→1.02 `--t-fast --pop`,预置 shadow-2 的伪元素层 opacity 0→1(`--t-fast`),cursor:grabbing。跟手:共享单 rAF 中 ghost translate3d 每帧向指针 lerp(系数 1−pow(1−0.35, f),复用 gravity-room 帧率无关插值)——3~4 帧橡皮筋滞后;倾斜:rotate = clamp(指针横向速度 px/ms × 0.6, −2°, +2°),以 0.18 系数 lerp 回 0。兄弟行让位:FLIP,translateY(±行高)`--t-med --glide`,每次越行即时重定目标。自动滚动:ghost 中心距滚动容器上/下缘 <56px 时,速度 = (1 − 距离/56)² × 14px/帧。落下:ghost translate/rotate→0 + scale→1,`--t-slow --spring` 弹入槽位(物理归位);周围行 `--t-med --glide` 合拢;落位行 hue 薄膜 opacity 0.18→0(`--t-slow`)。Esc/pointercancel:飞回原位 `--t-med --glide`,顺序不变。键盘等价:行焦点 Space 拎起(scale 1.02 + aria-live「已拎起,上下键移动」),↑/↓ 每次一位(相邻行 `--t-fast --glide`),Space 落下,Esc 取消。store 仅在落下时 commit(playlistReorder / queueReorder),持久化 300ms 防抖。

**趣味**:速度倾斜——把行往侧一甩,它像从唱片架抽出的黑胶一样斜着身子,像端着托盘走路;松手 --spring 落槽,带一次约 4% 过冲的「咔哒」。

**中断**:拖拽中第二指针/右键忽略;拖出窗口视为在最后合法槽位落下;拖拽中列表被外部更新(如另一处撤销)——按 track id 重解析槽位,失败则取消回原位;补位动画中开始新拖拽,取消并从当前位置重算 FLIP。

**降级**:无弹簧/倾斜/薄膜,拖行 1:1 瞬时跟指针、兄弟行瞬时重排;键盘流程完全等价。

**验收**:E2E:鼠标把第 1 行拖到第 4 位,断言 store 顺序变 [2,3,4,1,…] 且刷新后保持;拖拽中断言兄弟行仅 transform 动画;拖至底缘悬停 500ms 断言 scrollTop 递增;拖拽中 Esc 断言顺序不变;键盘 Space/↓↓/Space 断言下移两位;全程零控制台错误、指针抬起后无残留 ghost 元素;RM 仿真断言排序全程仅 opacity 且 ≤150ms。

### 4.8 后悔药(删除与撤销)

**触发**:歌单 ⋯ 菜单「删除歌单」/ 队列「清空」。

**动效**:确认 Modal(入场同 4.5:`--t-slow --spring`),文案给事实:「删除《晨雾》?其中 12 首曲目仍会留在曲库。」;默认焦点在「取消」,确认钮为 destructive 变体,焦点圈闭 + Esc 关闭。确认后:Modal 刻意快速出场(`--t-fast --glide`)给列表动画让路;被删行 opacity 1→0 + scale 0.96 `--t-fast`;下方行 FLIP translateY 上移合拢 `--t-med --glide`;同时 Toast「已删除《晨雾》 · 撤销」(带撤销,6000ms,走 1.5 规范)。撤销:歌单以快照(含 trackIds 与原 index)在原位置以 `--t-slow --spring` 长回(scale 0.9→1 + opacity),hue 薄膜 0.3→0。数据策略:store 立即删除并持久化,撤销为重插快照。

**趣味**:删除轻手轻脚,恢复大张旗鼓——真正的表演给了撤销:歌单「长回来」那下 --spring 过冲比删除本身更有存在感,产品立场写在动效里。

**中断**:Toast 存续期再删第二个——按 1.5 堆叠规则(≤3,各自计时,各自独立可撤销);确认钮首击后 disabled 防双击;持久化失败追加 Toast「但未能写入存储」(TECH.md 约定)。

**降级**:Modal 瞬时 opacity、行移除/合拢瞬时回流、Toast 无 spring,撤销行为完全不变。

**验收**:E2E:删除含 3 曲歌单,断言 Modal 文案含曲目数、store 移除、刷新后仍无;6s 内点撤销断言歌单以原 trackIds 顺序回到原 index;连删 2 个断言两个 Toast 独立可撤销;Modal 内 Tab 焦点循环封闭、Esc 无副作用关闭。

### 4.9 行李托运(导入导出)

**触发**:导出——曲库「导出」Button;导入——「导入」Button(file picker)或拖文件入窗口。

**动效**:导出:按钮内托盘图标 translateY 0→3px→0 `--t-fast --pop`(文件落进托盘),生成 sona-backup-YYYYMMDD.json({schema:1, playlists, tracks})下载,Toast「已导出 3 歌单 · 5 首创作」。导入:dragenter 且含文件时全区 dropzone 遮罩 opacity 0→1 `--t-fast`,虚线框 +「松手导入 JSON」;dragleave/drop 后 `--t-fast` 淡出。校验(TECH.md §4):逐条校验字段与类型、冲突 id 重新生成(oldId→newId 映射)、非法条目跳过。结果分层:全部成功→Toast「导入 2 歌单 · 8 曲目」,新条目走 4.3 入场;部分成功→Modal「已导入 6 · 跳过 2」,可展开逐条原因(mono 小字);完全失败(parse 抛错/schema 不识)→错误 Modal:标题「这个文件读不懂」+ mono 摘录错误首行 + 正文强调「你的现有数据未被改动」;schema 高于当前→按迁移策略提示升级。拖入非 .json:dropzone 边框转 error 色、容器 translateX ±4px 摇头 `--t-med`(同 4.5)+ Toast「只支持 .json 文件」,不进入解析。写入失败(隐私模式/配额):Toast「导入成功但无法保存——本次会话有效」。

**趣味**:导出图标那记 3px 的「落袋」下沉,文件真的掉进了托盘;而每条失败文案都先说「你的数据没事」,再谈错误——安全感先行。

**中断**:拖着文件离开窗口遮罩 `--t-fast` 淡出;结果 Modal 打开期间忽略新 drop;重复导入同文件 id 全部重生成、数量照报。

**降级**:图标不下沉、无摇头、遮罩瞬时 opacity,全部状态靠文案 + aria-live。

**验收**:E2E:建 2 歌单→导出→清 localStorage→导入,断言歌单名与曲目数深比对一致(id 允许不同);导入截断 JSON 断言错误 Modal 出现、现有数据不变、零未捕获异常;导入含 2 条非法记录的文件断言报「跳过 2」且 6 条合法入库;拖入 .txt 断言摇头动画触发且未进入解析。

### 4.10 虚位以待(空状态)

**触发**:(a) 新用户无歌单;(b) 歌单 0 曲;(c) 搜索无结果(经 4.4 的 300ms 稳定期);(d)「我的创作」为空。

**动效**:内容全部用设计令牌绘制、零图片:(a) 虚线描边幽灵歌单卡 +「第一张歌单,从一个名字开始」+「新建歌单」CTA;(b) 3 条静态幽灵行(hairline 描边、opacity 0.35)+「这里还很安静」+「去曲库挑几首」;(c)「没有找到「{query}」」+「换个短一点的词?或者去声音工坊,造一首世界上还不存在的」+ 双 CTA(清空搜索/去工坊);(d)「你的第一首曲子还在等一个种子」+「打开声音工坊」。空态整体 opacity 0→1 + translateY(8px→0),`--t-med --glide`;(b) 幽灵行 hover 时被指那条 opacity 0.35→0.55 + translateX(0→3px)`--t-fast --glide`,点击任意幽灵行直达曲库;CTA 用 1.4 标准 press。

**趣味**:幽灵行会向光标凑近 3px——空歌单不是死路,是三张留了座的椅子;且每句文案都把出口指向产品独门能力(声音工坊),空态兼任转化入口。

**中断**:空态显示中数据到达(撤销/导入/搜索命中)——空态 opacity→0(`--t-fast`)后移除,列表按对应规格入场;搜索继续键入直接打断空态入场。

**降级**:无 translate、幽灵行不凑近(hover 反馈交还组件库配色),文案与 CTA 全量可用,空态出现由 aria-live 播报一次。

**验收**:E2E:清存储进歌单 Tab,断言 (a) 可见且 CTA 打开新建 Modal;空歌单断言恰 3 条幽灵行、点击后视图切到曲库;搜索「zzzz」400ms 后断言 (c) 含 query 原文,补 1 个有效字符后空态移除;RM 模拟下断言幽灵行 hover 无 transform 变化。

---

## 五、声音工坊(Sound Forge)

> 试听走 `createEngine()` 独立第二实例(TECH.md §5);工坊内预览盘 + 频谱短刻 + 卷尺弧合并为**一块** canvas,色相环 canvas 仅交互时按需重绘、不注册 ticker——满足 7.1「同时 ≤2 活跃 canvas」红线。

### 5.1 三种脾气(情绪拨盘)

**触发**:三枚 Segmented chips(静 calm / 亮 bright / 驰 drive)组成 radiogroup,点击或 ←/→ 键切换。

**动效**:选中指示为滑动药丸,translateX 滑至目标 chip,`--t-med --spring`(物理归位),transform-only;每枚 chip 内含微型音波 glyph,选中者以该情绪 BPM 中值的节拍呼吸(calm 78BPM→769ms/拍、bright 98→612ms、drive 112→536ms,信号同步微时序豁免),每拍 scale 1→1.06 + opacity 0.7→1,ease-in-out。试听中切换:经 store 的 forgeUpdate action 触发 engine.load({...新mood},{autoplay:true}) 热换(引擎 killSeg 自带 20ms 淡出防爆音),预览盘做一次 scale 0.97→1 squash(`--t-fast --pop`)示意「重新酿造」。

**趣味**:选中的情绪图标按那个情绪真实的 BPM 呼吸——calm 慢吸慢吐、drive 心跳偏快,还没按试听,情绪就先有了脉搏。

**中断**:快速连续切换时药丸从当前位置直接重定向新目标(transition 中断续行,不排队),glyph 节拍计时器归零按新 BPM 重启。

**降级**:药丸瞬移、glyph 静止(选中以填充色+对勾静态表示),热换仅保留音频淡换。

**验收**:Playwright:点击 drive 后 ≤480ms 断言指示药丸 transform 落点在 drive chip 边界内;断言选中 glyph 的 animation-duration===536ms(或 data-bpm=112);←/→ 改变 aria-checked;试听中切情绪后 200ms 内 analyser getByteFrequencyData 求和非零;emulate reduced-motion 断言药丸 transition-duration ≤0.01ms。

### 5.2 拾色环(色相环 + 活渐变)

**触发**:直径 168px 色相环(canvas conic 渐变)上 14px thumb 可拖(pointer capture);键盘 ←/→ ±2°,Shift+←/→ ±15° 吸附色名桶。

**动效**:中央 96px 圆盘 = 未来封面的实时渐变材质(与正在播放页同款 soft-light 纹理),拖拽时同帧直改(直接操纵,不经缓动)。色相 0–359 分 24 桶、每 15° 一个中文传统色名(0 绯红、30 琥珀、60 柠黄、120 松绿、210 群青、270 紫藤、330 桃红…)。跨桶落定时色名标签换字——旧字 translateY(0→-10px) + opacity→0、新字自 +10px 入,`--t-fast --glide`;同时盘面一道 sheen 高光斜扫(overlay translateX -120%→120%,`--t-slow --glide`,opacity 峰值 0.25);释放时 thumb scale 1.15→1(`--t-fast --pop`)。试听中改色相不打断音频(hue 不参与合成),纯视觉热换。

**趣味**:每个色相都有名字——拖过 210° 时标签翻出「群青」,像在旋一只颜料罗盘;落桶那道掠过漆面的高光只有 0.25 透明度,仪式感与克制并存。

**中断**:sheen 播放中再次拖动→sheen 80ms 内 opacity 归零取消,标签直接跳最新桶名(最新值优先,不排队)。

**降级**:无 sheen、无 pop,标签瞬换;拖拽仍 1:1 跟手。

**验收**:拖至 210°:采样中央 canvas 像素断言 hue∈[205,215],aria-valuenow=210 且 aria-valuetext 含「群青」;单次跨桶 sheen 触发计数===1;Shift+→ 自 213° 落至 225°;reduced-motion 下 sheen 元素零动画帧。

### 5.3 掷骰问天(种子骰子)

**触发**:种子显示为 6 位等宽数字(000000–999999),旁置骰子 IconButton,点击掷骰;点击数字本身进入等宽 Input 手动输入(非法字符即时拒绝)。

**动效**:确定性揭示——t=0 立即算出最终种子并写入 data-seed,**动画只是戏**。骰子抛掷 translateY(0→-14px→0) + rotate 0→360°,`--t-slow --glide`;6 位数字列做老虎机滚动(各列 translateY 每 60ms 循环 -100%,JS 微时序豁免),自 240ms 起从左到右每 45ms 落定一位,每位以 `--t-fast --pop` 弹停,全程 ≤600ms。试听中掷骰:旧种子响到全部数字落定,随即 engine.load({...新seed},{autoplay:true}) 热换(20ms 淡出)。

**趣味**:骰子落地的歪斜角从 {-8°,-3°,4°,9°} 里取 seed%4——同一个种子连骰子都歪得一模一样,把「确定性」这个产品壁垒开成了骰子身上的玩笑。

**中断**:滚动中再点骰子=立刻重掷(数字继续滚、计时与最终值重置为新种子,不禁用按钮不排队);滚动中点数字进手动输入→动画即刻取消并显示当前 data-seed。

**降级**:无抛掷无滚动,数字瞬换,经 aria-live=polite 播报「种子 483902」。

**验收**:mock Math.random:点击后 t=0 断言 data-seed===期望值(先于动画结束);同一 seed 两次生成的 analyser 频谱哈希相等(接 M3 确定性断言);300ms 内双击骰子→最终显示等于第二次种子且仅发生一次引擎热换;手输 "12ab" 被拒;骰子落地 rotate 终值===seed%4 对应角;reduced-motion 断言数字列零 transform。

### 5.4 时长卷尺(Duration Slider)

**触发**:组件库 Slider,范围 0:30–3:00,step 15s,默认 1:00,aria-valuetext 形如「1分30秒」。

**动效**:thumb 有 15s 刻度磁吸——释放点距刻度 ±3s 内即吸附,吸附瞬间 thumb scale 1→1.12→1(`--t-fast --pop`);读数 mm:ss 翻牌,仅变化位滚动(旧字 translateY 0→-100%、新字 +100%→0,`--t-fast --glide`);预览盘外圈「卷尺弧」按 dur/180 比例伸缩(canvas 描画,280ms `--glide` 插值,canvas 内部时序)。试听中改时长:热应用 track.dur;若 getTime() ≥ 新 dur,走自然结束流程(onEnded 回调、按钮还原)。

**趣味**:时长不是抽象数字——盘边那条卷尺弧真的变长变短:3 分钟绕盘一整圈,30 秒只是一小段尾巴,长度被看见了。

**中断**:快速连拖不排队,变化位与卷尺弧均直接重定向最新值。

**降级**:无翻牌无 pop,读数瞬换,卷尺弧直接跳至目标长度。

**验收**:键盘 →:aria-valuenow +15;设 0:45 保存后断言 localStorage 该曲 dur===45;快速拖拽后 pointerup,读数===slider value(无残留旧位);试听至 50s 时改 dur=45→500ms 内 engine.isPlaying()===false 且按钮还原;reduced-motion 断言数字位零动画。

### 5.5 即听即得(实时试听)

**触发**:预览盘下 64px 圆形播放 Button。

**动效**:点击→store 的 forgePreviewStart action→试听引擎 load({seed,mood,dur,hue},{autoplay:true});同时主播放暂停、迷你条 opacity→0.5 并挂「工坊试听中」Badge(`--t-fast` ease)。图标 morph:播放/暂停两形交叉 opacity + scale 0.6↔1,`--t-fast --pop`。试听期间的脉动(共享单 rAF,数据经 1.2 总线口径的工坊实例采样):① 预览盘 scale = 1 + E×0.035,E 取 bin 0–3 低频均值经 EMA 0.8 平滑,transform-only;② 盘外 24 根频谱短刻(canvas,着当前 hue,映射 bin 4–100);③ 播放按钮 rotate ±1.5° 随低频微晃;进度以 canvas 细弧显示。自动停止规则:a) 播满 dur 自然结束→onEnded→图标还原(`--pop`),全部脉动 `--t-slow --glide` 衰减回 1;b) 离开工坊视图→150ms 音频淡出停止;c) 标签页隐藏→暂停(visibilitychange),回来不自动续播;d) 保存成功→停止并交棒给 5.6。停止试听不自动恢复主播放(拒绝突袭出声)。

**趣味**:连播放按钮自己都在跟着低音轻轻点头(±1.5°)——它先替你确认:这一炉,有货。

**中断**:再点=暂停(引擎 20ms 淡出)、图标反向 morph、脉动同规则衰减;暂停后再点自 pausedAt 续播;参数热换行为见各控件条目。

**降级**:无盘呼吸/无刻动画/无按钮晃,改为静态细进度弧 + mm:ss 读数,图标瞬换。

**验收**:点播放后 500ms 内 getByteFrequencyData 求和 >200(非静音);切至曲库视图 200ms 内 isPlaying()===false;dur=30 试听到底,onEnded 后按钮态还原;试听开始时主播放 playing===false 且迷你条含 Badge;visibilitychange 隐藏后 isPlaying()===false;脉动期间全页 rAF 回调注册数===1(共享循环断言)。

### 5.6 压盘入库(保存时刻)

**触发**:命名 Input(上限 24 字,实时字数)+「保存」Button。

**动效**:校验:空/纯空白名→阻止保存,Input 进 error 态(aria-invalid),translateX 0→-4→4→-2→2→0 摇头(`--t-med`)+ 错误文案「给它起个名字」自下 4px 淡入(`--t-fast`);再输入任意字符即清除。合法保存(store.trackForge 写入 sona.v1.tracks,id='u'+ts):① 压盘:预览盘 scale 1→0.92→1(`--t-slow --spring`)+ 独立圆环涟漪 scale 1→1.35、opacity 0.4→0(`--t-slow --glide`),像压制一张唱片;② 飞行:28px 迷你封面(当前 hue 渐变)自盘心以 fixed 层 FLIP 飞向导航「曲库」项,translate + scale→0.15 复合 `--t-slow --glide`,末 120ms opacity→0;③ 接住:曲库导航项 scale 1→1.18→1(`--t-med --spring`),Badge 计数翻牌 +1;④ Toast「已入库 · 我的创作」走 1.5 规范(入场 `--t-med --spring` / 退场 `--t-fast --glide`,3200ms 自动消失)。若曲库「我的创作」列表恰在屏上,新行自顶端 translateY(-8px) + opacity 入列(`--t-med --glide`)。

**趣味**:保存是一次「压盘」——盘面被 --spring 压下去又弹起,一圈涟漪散开,一张 28px 小唱片划着长弧飞进曲库,导航图标接住时轻轻一颤。全程零彩带、零表情包,庆祝停在「高级」这一档。

**中断**:点击即禁用按钮至写入完成(幂等,双击只产一曲);飞行中跳转视图→fixed 层照常完成后自毁,目标图标已卸载则 `--t-fast` 淡出取消;localStorage 写失败→跳过全部庆祝,Toast 明示「本次更改不会被保存」。

**降级**:无压盘/涟漪/飞行,仅 Toast(淡入淡出)+ Badge 瞬时 +1。

**验收**:空名保存:aria-invalid=true、错误文案可见、sona.v1.tracks 长度不变;合法保存:新条目 {seed,mood,dur,hue,title(已trim)} 与表单全等;飞行元素 ≤700ms 后不在 DOM;双击保存仅 +1 条;mock setItem 抛异常→无任何庆祝动画且 Toast 含「不会被保存」;reduced-motion 断言无 fixed 飞行元素被创建。

### 5.7 三首之约(免费层上限)

**触发**:免费层(flags.js)已存 3 首时点击保存。

**动效**:不摇头不报错——保存按钮轻沉 translateY 2px(`--t-fast` ease)随即弹出 Modal:panel translateY(28px) + scale 0.96→1(`--t-slow --spring`),遮罩 opacity 入场 `--t-med` ease。内容全盘诚实:标题「工坊已满 · 3/3」;架上横排 3 张 44px 小唱片 = 用户已存三曲的真实 hue 渐变,错峰漂浮 translateY ±2px(3s ease-in-out 循环,stagger 400ms),hover 单张 rotate 4°(`--t-fast --pop`);正文明说免费层含 3 首创作 + 2 歌单,「升级(演示)」按钮旁小字注明「演示项目,不会收费,数据只存在这台浏览器」。三个出口平权:主按钮「升级(演示)」→翻 flag、关 Modal、自动完成刚才那次保存;每张唱片旁「删除腾位」→该行 translateX(-12px) + opacity→0 出列(`--t-fast --glide`)、余行 FLIP 上移补位(`--t-med --glide`),计数变 2/3 并出现「继续保存」主按钮(表单参数全程保留,一键完成原保存);「先不了」/ Esc / 遮罩点击均关(反向 `--t-med --glide`),焦点还给保存按钮,仅保存动作再触发、绝不主动纠缠。

**趣味**:上限不是一堵墙,是一个摆着你三张唱片的小架子——每张都是你亲手调的颜色,还在轻轻漂;「演示、不收费、数据在本机」写在按钮旁边,诚实本身就是魅力。

**中断**:Modal 入场中按 Esc→立即转出场动画。

**降级**:无漂浮无 tilt,Modal 仅 opacity `--t-fade`。

**验收**:预置 3 条 userTracks 后第 4 次保存:Modal 可见、tracks 仍===3;架上唱片数===3 且各盘 hue 与存储值一致;点「升级(演示)」→flag 翻转、保存完成、tracks===4;「删除腾位」后「继续保存」出现,点击后新曲参数===弹窗前表单值;Esc 关闭后 document.activeElement===保存按钮;axe 扫描 Modal 焦点圈闭无违例。

### 5.8 回炉重造(编辑/再生成)

**触发**:曲库「我的创作」行 Dropdown→「编辑」。

**动效**:入场:该行 28px 封面自列表位置 FLIP 飞回工坊预览盘(`--t-slow --glide`,5.6 入库飞行的逆放),盘面 scale 0.9→1 `--spring` 接住(`--t-med`);表单预填 {seed,mood,dur,hue,name},标题变「编辑 ·〈名〉」;「重掷」即 5.3 同一交互。差异标记:任一控件当前值≠已存值时其标签旁亮 4px 圆点(opacity 入场 `--t-fast`);预览盘下缘浮出原 hue 的 2px「残影细环」(opacity 0.3)供对照,点击残影环→色相沿色环 `--t-med --glide` 扫回原值;≥1 圆点时显示「还原全部」文字按钮(一键回四参)。提交双路:「保存修改」同 id 覆写(保 createdAt、写 updatedAt,不占名额;无差异时 disabled)/「另存新曲」新 id(走 5.7 计数)。保存修改的庆祝降半档:小压盘 scale 1→0.96→1(`--t-med --spring`),无飞行;列表在屏时原行高亮 opacity 0→1→0(两段 `--t-med`,共 560ms)。

**趣味**:残影细环是原来的颜色,一直安静地躺在新颜色下面——点它一下,色相沿色环「游」回出发点,一句无声的「后悔药在这」。

**中断**:带未存差异切换视图或改编他曲→Modal「丢弃修改?」(保留/丢弃,Esc=保留);试听中提交→音频 150ms 淡出后再压盘;飞回动画中即拖动任何控件→动画照常完成、输入即刻生效(动画层与表单层分离)。

**降级**:无飞回、还原瞬时无扫动、圆点静态、行高亮改为静态 2s 边框。

**验收**:编辑 u123 改 hue 后「保存修改」:id 不变、hue 更新、updatedAt 存在、tracks 计数不变;「另存新曲」:新 id、计数 +1;改三参后点「还原全部」→四参与存储值全等、圆点消失、「保存修改」回 disabled;无差异时「保存修改」disabled;带差异切视图→Modal 出现且选「保留」停留原页;reduced-motion 断言无 FLIP 飞行元素。

---

## 六、静水流深 — prefers-reduced-motion 全量映射表

实现:媒体查询 + JS 侧 matchMedia('(prefers-reduced-motion: reduce)') 单例并监听 change(运行时切换即时生效,免刷新);机制为**令牌覆盖**——RM 下 `--t-fast/--t-med/--t-slow`→0.01ms,另设仅 RM 使用的 `--t-fade`:120ms 供保留的 opacity 类使用;**禁止一刀切 `*{animation:none}`**(会误杀必要淡入)。RM 不是「关掉」而是平行设计:当前歌词行仍在呼吸(透明度),×2 吐司计数、指尖泼夜的主题翻转的「机智」全部幸存——节奏还在,只是没人在房间里跳舞。

| # | 效果 | RM 替代 |
| --- | --- | --- |
| 1 | 重力歌词粒子聚合/行间流变/低频冲击波 | 粒子引擎彻底不初始化;静态歌词行,当前行 opacity 0.5→1(--t-fade)高亮,上下行小字号低透明度伴随 |
| 2 | 封面低频呼吸/节拍脉动/心跳光环脉动 | 静态渐变材质;进度环保留(信息性) |
| 3 | 频谱可视化(短刻/电平柱) | 隐藏或静态图标(纯装饰,aria-hidden);播放中行用静态音符图标 + aria-label |
| 4 | 列表/网格错峰入场 | 容器整体 --t-fade 淡入,无位移无 stagger |
| 5 | Card 悬停抬升 | 仅阴影变化 |
| 6 | 按压 pop 回弹(全部 press) | brightness(0.92) --t-fade 颜色反馈,零 transform |
| 7 | Toast 入/出/叠 | opacity --t-fade,堆叠瞬移;计时、去重与 ×2 计数逻辑不变 |
| 8 | Modal/Dropdown/迷你条 spring 入场 | opacity --t-fade |
| 9 | Tabs/情绪药丸指示器滑动 | 瞬移 + 新位置 --t-fade 淡入 |
| 10 | Slider thumb 放大/磁吸 pop/张力 lerp | 描边加粗替代放大;填充精确贴指尖;tooltip 保留(信息性) |
| 11 | Switch 行程 | 瞬移 + 颜色 --t-fade |
| 12 | 主题径向揭幕/图标天体行程 | --t-fade 颜色交叉、图标直切 |
| 13 | 视图滑动/封面 FLIP/共享元素变形 | --t-fade 交叉淡入;焦点规则原样保留 |
| 14 | Skeleton shimmer | 静态 surface-2 色块 |
| 15 | 拖拽排序/划动移除 | 功能完整保留:1:1 跟手无倾斜无缩放,兄弟行瞬时重排,移除即时消失 |
| 16 | 工坊飞行/压盘/涟漪/骰子/sheen/翻牌/漂浮 | 全部移除;数值瞬换并经 aria-live 播报;Badge 瞬时 +1;拖拽仍 1:1 跟手 |
| 17 | 迷你条发丝线逐帧跟踪与低频辉光 | 无辉光;位置每 1000ms 离散步进(信息性运动保留) |
| 18 | 进度条/音量数值前进 | **原样保留**(信息性运动,非装饰) |
| 19 | aria-live 播报与全部计时逻辑 | 不变 |

**中断**:会话中途开启 RM → 在途动画跳至终态,粒子 canvas 移除、静态歌词接管,不留半冻结帧。

**验收**:Playwright emulateMedia reduce:遍历全部视图与交互态,断言 document.getAnimations() 无任何 transform 动画条目、opacity 动画均 ≤150ms;正在播放页断言无 canvas 元素且当前歌词行以文本节点存在、播放 10s 后高亮行随时间戳推进;会话中途切换 RM(CDP 模拟)→ 1s 内粒子 canvas 从 DOM 消失、无控制台错误;进度条仍随 getTime() 前进。

---

## 七、一颗心跳 — 性能红线

### 7.1 红线清单

- **单心跳**:全应用唯一 rAF 调度器(沿用 GRAVITY ROOM scheduler:dtEma 平滑帧时、dtBase 取首 60 帧最小值作设备基线);歌词粒子、频谱绘制、任何 JS 驱动动效一律注册为 ticker;visibilitychange→hidden 时 stop();元素离屏(IntersectionObserver rootMargin 80px)或数值收敛(增量 <0.05)时该 ticker 睡眠。
- **canvas 预算**:全应用同时最多 **2 个活跃 canvas**(正在播放页=歌词粒子 + 频谱;工坊=合并后的预览盘 canvas,色相环按需重绘不计);粒子总量 ≤1200,DPR clamp ≤2。
- **信号预算**:analyser 频谱数据每帧只读 1 次,经 store 分发(见 1.2),禁止组件各自 getByteFrequencyData。
- **降级阶梯(统一版)**:watchdog——dtEma > max(19ms, 1.25×dtBase) 连续 60 帧 → degrade+1:先裁星尘(240→120→0),星尘裁尽后字形粒子密度 ×0.65(下限 220),用等距抽稀原地拔除、不重建不闪屏;dtEma < 1.1×dtBase 连续 300 帧 → degrade−1 回升;degrade=3 时粒子整体关停,歌词自动落入 RM 静态方案(auto-RM)。降级发生于播放中时,字形连续性必须保持(抽稀不重排存活粒子)。
- **编排并发**:DOM 编排并发上限 2(如视图转场 + Toast),超出的错峰编排坍缩为纯淡入。
- **泄漏红线**:视图切换后 ticker 数量必须回到基线(卸载即注销);30 分钟长播 WebAudio 节点数恒定(TECH.md §7)。
- **CI 红线**:stylelint 白名单(transform/opacity/三项具名豁免)外的 transition/animation-property 直接 fail;令牌审计规则见 1.1。

**趣味**:先量体温再判发烧——基线取自设备自己的前 60 帧,30Hz 的省电屏不会被冤枉成卡顿;降级像高明的扒手,悄悄抽走每三个粒子中的一个,没有任何一帧看得见「掉档」发生。

**中断**:降级与回升只在帧边界发生,任何在途动画不被打断;RM 下调度器仅为进度等信息性更新保留,装饰性 ticker 从不注册。

**验收**:E2E:稳态下 hook requestAnimationFrame 断言每帧恰 1 次回调(转场瞬时除外);CDP 6× CPU 节流 → 2s 内粒子计数降至 ≤ 原值×0.65,且降级前后连续两帧截图中字形轮廓 SSIM >0.9(无闪屏重建);切换视图 20 轮 → scheduler.tickers.size 回到初值;隐藏 Tab → rAF 停发;30 分钟播放脚本断言音频节点数恒定;向样式表注入 transition: width 断言 stylelint CI 失败。

---

*本文档为 SONA 动效唯一事实源;与各区域早期草稿冲突处,以本文档为准。任何新增动效先过 1.1 决定表,再挂 7.1 红线,最后补 6 的 RM 映射行——三关全过才算规格完整。*

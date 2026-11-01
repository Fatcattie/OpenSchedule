---
id: design-system-deep-dive
title: Design System Deep Dive — Shipped-Product Token Craft
domain: design-systems
category: design-systems
difficulty: advanced
tags: [tokens, typography, color, components, motion, elevation, layout, accessibility, anti-ai-slop, DESIGN.md]
quality_score: 82
last_updated: 2026-06-22
---
# Design System Deep Dive — Shipped-Product Token Craft

> 这是给 UIUX 阶段的**进阶**方法论，把"哪些 token、哪个字阶、哪条缓动"从口号变成**照抄的具体值**。
> 综合了大量上线产品设计系统里**反复出现的工程动作**——只保留**可复用的技术与参数**，不绑定任何具体来源。
> 与 `anti-ai-slop.md`（反面清单 + 自评门）互补：那篇讲"别做什么"，本篇讲"**正向的体系怎么搭**"。
>
> 一句话原则：**先 commit 一个具名方向 + 1–3 个真实参照，再把每个 token 都问"为什么是它"。**
> 精品与 generic 的差距，全在 token 背后的"为什么"。
>
> **关于"真实参照"这条指令**（给底座的通用做法，不是替你点名）：
> 为当前项目**在它自己的领域里**挑 1–3 个**可识别的真实产品**当锚点，每个只借**一个具体动作**
> （如"信息密度借 A、排版工艺借 B、表面/depth 借 C"），写出**要借的那个动作**而非泛泛"现代感"。
> 参照必须是**目标领域内**的产品（做支付就看支付，做开发工具就看开发工具），由你按项目现挑——
> 本文档只给你**可复用的技术词表**，不替你指定参照。

---

## 1. Token 架构：三层，组件只引语义层

成熟系统都是**三层 token**，组件**永不**直接写原始值：

```
Primitive（原始）   --blue-600: #2563eb            原子调色板，不带语义
Semantic（语义）    --color-primary: var(--blue-600)   意图："这是主操作色"
Component（组件）   --button-bg: var(--color-primary)  用法："按钮背景用主色"
```

- **铁律**：组件只引用 `--color-*` / `--space-*` / `--text-*` 这类**语义/组件 token**，从不写裸 hex 或引用 primitive。
  改一个 primitive，所有引用它的语义 token 自动更新——这就是"theme once, propagate everywhere"。
- **深色模式 = 只覆盖语义层**：`@media (prefers-color-scheme: dark)` 里重定义 `--color-bg / --color-surface / --color-text / --color-border / --color-shadow`，**不动 primitive**。
- **命名按"角色/状态"分段**，不按数字号：`{category}-{role}-{state}`（如 `button-primary-pressed`、`surface-elevated`、`hairline-strong`）。
  状态变体**各自独立成 token**（`-pressed / -active / -disabled / -focused / -featured`），不要埋在伪类或散文里——这样"全状态集"是显式契约。
- **中性灰从同一个 ink 锚点派生**：用透明度分层（同一深色 ink 在 83% / 82% / 40% / 4% / 3% 上叠）而非各写一个独立 hex——天然协调、改色不破层级。
- Token 不只有颜色。一套完整 token 至少覆盖 **8 个类别**：
  `color · typography(size/weight/line-height/tracking) · spacing · radius · border/hairline · elevation/shadow · z-index(语义命名) · motion(duration/easing)`。
  缺哪类，前端就会就地硬编码——那正是漂移的起点。

---

## 2. Color：一个主色面 + 一个手术刀 accent

- **60-30-10 分布**：~60% 中性面 / ~30% 次要面与文本 / ~10% 主色；**accent 占视口 ≤3%**，只给最高优先 CTA + 链接强调 + focus。
  "一个 band 里只有一个填充按钮"是反复出现的硬规矩——`--color-primary` 是 CTA / 链接 / focus 色，**不是正文色**。
  单 accent 模型最常见：整套系统就一个品牌色用在每个 CTA + wordmark + 焦点，**稀缺即识别度**。
  多 accent（4–8 色）只活在**产品截图 / 插画 / 分类标签**里，**永不**做按钮表面。
- **永不纯黑纯白**：正文用"近黑带品牌温度"（如深海军蓝 `#0d253d` 而非 `#000`），底色用近白。
  - 近黑常用区间（按品牌冷暖偏 ±2–10 hex）：`#010102`（带极淡蓝的近黑）、`#07080a`、`#0a0a0a`、`#0b0b0b`、`#0f0f0f`、`#131313`、`#171717`、`#181818`。
  - 近白常用区间：`#fcfdff`（微冷）、`#fafafa`、`#f7f8f8`、`#fffefb`、`#f6f9fc`（微冷）；编辑/品质气质用暖奶白 `#faf9f5 / #f7f7f4 / #fffaf0`（但要**有意为之**，不是默认）。
  纯 `#000/#fff` 是 generic tell。
- **中性色带温度**：中性灰向品牌色相偏 `+0.005~0.015` chroma（OKLCH 思维），别用纯灰 `#808080`；
  追求工程/精密气质时反过来用**纯无彩灰**（`#0b0b0b → #212121 → #353535 → #b9b9b9`）——温暖与纯灰是两种**有意**的选择，别随机混。
- **语义角色**（最少 6 个，各带 default/hover/active）：
  `bg · surface · text · text-secondary · primary(+hover) · accent · border/hairline · error · success · warning · info`。
- **文本 token 按"强调度"命名，不按灰阶号**：`ink → body-strong → body → muted → muted-soft`（强调度）远胜 `gray-700/600/500`（机械灰号）——
  前者表达意图、改色不破层级。表面 token 则按"抬升级"命名：`canvas → surface-1 → surface-2 → surface-3`。
- **每个暗色面预配 `on-dark` 文本 token**（`on-dark / on-dark-soft / on-primary`）——把"暗面上用什么字色"提前解好，对比天然达标。
  CTA 的 `on-primary` **显式定义**（白或深 ink），别靠对比度心算。
- **语义色永不当操作色**：涨跌的 `green/red`、状态色、error/success/warning 只用于**校验/状态/数据可视化**，**绝不**做 CTA 填充。
  金融/数据场景的涨跌色常**只用作文字色**（如涨 `#0ecb81` / 跌 `#f6465d`），不做大面积填充。
- **featured 用"表面反相"而非彩色丝带**：亮底页上把"推荐"那张卡翻成深色面（或淡色品牌 tint 底 + 2px 品牌色描边），不需要彩色 ribbon/badge。
- **dark-mode 极性翻转**是成套动作：`canvas↔ink` 文本互换、表面阶梯反向、按钮 `深底白字↔白底深字`、
  边框 `浅灰描边 → rgba(255,255,255,0.06) 半透明`、链接色按底色换亮度（亮底 `#376cd5` → 暗底 `#3b9eff`）。
- **渐变只做氛围/媒介，不做 UI 填充**：氛围用低透明度径向 orb（`radial-gradient(circle, rgba(255,89,0,0.22) 0%, transparent 600px)`，6–22% 透明度，贴在 section 顶部），
  品牌 lift 交给"mesh / 背景图 / 真实摄影"，按钮和卡片用纯色。
- **禁 AI 紫**：OKLCH **色相 270–320 且 chroma ≥ 0.09** 作主色/强调色（`#6366f1 #7c3aed #8b5cf6 #4f46e5 #a855f7` 及邻近色）、`#667eea→#764ba2` 渐变——头号 AI 指纹。**改用**产品自己拥有的一个色相，并把 `on-` 前景对比度算出来。
- **禁"奶油米色带"当万能友好信号**：OKLCH `L 0.84–0.97 · C<0.06 · hue 40–100`，以及 `--paper/--cream/--sand/--linen` 这种命名本身就是 tell（暖奶白只在**明确的编辑/品质定位**下用）。
- **对比度**：正文 ≥4.5:1、大字/UI ≥3:1。禁 gray-on-gray。

---

## 3. Typography：字阶大跳 + 战略字距 = 身份

排版是**最廉价也最强**的差异化杠杆。反复出现的签名动作：thin 字重（300）display 配负字距做"编辑密度"，
oversize display（80px+）配激进负字距（-3px 量级）做"工程致密块"。

- **字阶用比例，不随手取值**：data-dense 用 1.2，通用 1.25，营销/cinematic 可到 1.333+。
  建 `--text-xs … --text-3xl`（至少 7 级）；**标题与正文对比拉开**。常见区间：
  - hero/display：48–96px（cinematic/品牌可上 110–136px）。
  - section head：32–60px；title：18–32px；body：14–18px；caption/micro：10–14px。
  - display-to-body **大跳**：3:1 到 6–8:1（"上面是广告牌，下面是目录"），中间档（28–36px）刻意稀疏。
- **战略 letter-spacing（tracking）**——这是真实系统的签名动作，**字号越大收得越多**（近似线性）：
  - **display 收紧（负字距）**：
    `96px → -2~-2.5px` · `80px → -1.6~-2px` · `64px → -1.4~-1.9px` · `56px → -1.1~-1.7px` ·
    `48px → -0.96~-1.4px` · `40px → -1.0px` · `36px → -0.4~-1.1px` · `32px → -0.3~-0.96px` · `28px → -0.6px` · `24px → -0.3~-0.5px`。
    极致致密会到 4% of size（如 80px → -3px）。
  - **eyebrow / ALL-CAPS 放开（正字距）**：`+0.05em ~ +0.12em`（约 `+0.4px ~ +2.5px`）——正字距把 eyebrow 标成"分类层/console label"，与负字距 display 形成对撞。
  - **正文 0**（编辑气质偶尔 `+0.15~0.24px`，但绝不负）。
- **字重**：一个页面 ≤3 个字重；标准就 **3–4 个**（如 `400/500/600/700`），别拉 100–900 全家桶。
  标题与正文字重差 `≥200`（如 display 300 vs UI 500，或 body 400 vs heading 700）。
  **thin-weight display（300/400）配较重 body（500/600）= "whisper-shout" 对撞**，是高频签名。mono 永远 400（除非显式标重）。
- **line-height**：display 0.95–1.2（全大写/超大字下限 0.95，做"致密块"），heading 1.15–1.3，正文 1.4–1.55，长文/营销 1.6–2.0。
  标题 line-height 常**小于字号**（48px 上用 0.96 lh = 46px 视觉行高）。
- **font-feature-settings 当签名（强差异化杠杆）**：在 `body` 上全局开一个 stylistic set
  （`ss01 / ss02 / ss03 / cv01 …`，换掉单层 `a/g` 等字形），默认 Inter 一旦开了 stylistic set 就"不再是模板 Inter"。
  辅以 `calt`（上下文替代）、`liga`（连字）、`kern`（字偶距）。
  数字/金额/统计单元格用 `tnum`（tabular-nums，对齐 + 暗示"数据/金融 DNA"）。feature flag **按字号档**开，不必全局。
- **字体选择**：先写**三个具象气质词**（"warm and mechanical and opinionated"，不是"modern"），再据此选字。
  - **单家族模型**：一个家族靠 size/weight/case 撑起全层级（适合工程/极简）。
  - **display + body 对比配对**（高对比衬线 display + 几何 sans body；或 grotesk + mono）做编辑/品质气质。
  - **mono 只给代码**：保持一个 mono 家族（如 JetBrains/Geist/SF Mono），代码块横向滚动不换行，**永不**用在散文或 UI label。
  - **fallback 链 5–6 级**：`Brand → Inter → system-ui → -apple-system → sans-serif`；多语种要补 CJK/Arabic/Cyrillic 等。
  - **reflex-reject 默认禁用**（除非品牌 brief 点名）：`Inter / Roboto / Open Sans / Lato / Montserrat / Poppins / Nunito / Space Grotesk / Playfair`。
    自建/专有字体不可分发时，记下**开源替身**（display 用 Inter@300+ss01+负字距 或 Geist Sans；mono 用 JetBrains/Geist Mono）。

---

## 4. Elevation & Depth：阴影表达 z 轴，不是统一糊一层

真实系统**很少**用厚 drop-shadow。主流深度体系有三套，按底色选：

- **亮色面（分级阴影 + 多层堆叠）**：贴地卡极轻，浮层更深，按下变浅；同层一致。常见配方：
  - 极轻 hairline halo：`0 0 0 1px rgba(0,0,0,0.04)` 或 `0 1px 2px rgba(0,0,0,0.04)`。
  - 标准卡：`0 2px 8px rgba(0,0,0,0.06)` 或 `0 4px 12px rgba(0,0,0,0.04)`。
  - 浮层/弹窗：`0 8px 24px rgba(0,0,0,0.08~0.25)` 到 `0 25px 50px -12px rgba(0,0,0,0.25)`。
  - **多层堆叠求"纸感柔光"**（不是单条厚阴影）：把 2–5 条偏移叠起来、透明度递减——
    如 `0 1px 1px #00000005, 0 2px 2px #0000000a, 0 8px 24px rgba(0,0,0,.08)`；
    featured 卡可叠到五层（`0 84px 24px transparent, 0 54px 22px rgba(0,0,0,.01), 0 30px 18px rgba(0,0,0,.04), 0 13px 13px rgba(0,0,0,.08), 0 3px 7px rgba(0,0,0,.09)`）。
  氛围/品牌 lift 交给"渐变 mesh / 背景图 / 真实摄影"而非字面阴影。
- **暗色面（surface ladder + 1px hairline 代替阴影）**：暗底上阴影几乎不可见，靠**表面提亮**和**描边**建层级。
  - 5 步阶梯（暗）：`canvas #0b0b0b → surface-1 #101111 → surface-2 #16181a → surface-3 #1f1f1f → surface-4 #272727`，**每步亮 6–10 hex**、彼此可辨又协调。
  - 5 步阶梯（亮）：`#ffffff → #fbfbf5 → #f4f4f4 → #f0f0f0 → #e5e7eb`，**每步 8–15 hex**。
  - hairline 是**结构件不是装饰**：暗底 `rgba(255,255,255,0.06)`（隐约）到 `0.14`（结构）、或 `#23252a / #353535`；亮底 `#e2e2e7 / #e4e4e7`。
  - **lifted 面板顶边加一道极淡白色高光**（`inset 0 1px 0 rgba(255,255,255,0.05~0.08)`），做出"像素渲染/微斜面"质感。
- **焦点环是一级 elevation**：`2px primary outline`（或 `2px solid + 2px offset`，或 inset `inset 0 0 0 2px`）；
  focus 色常**独立于 primary**（更高亮度的蓝），保证键盘可达可见。
- **现代精品偏好**：`1px 内/外描边 + 极轻阴影` > 厚 drop-shadow（更干净、更工程感）。半透明/毛玻璃用于建层级，不是装饰：
  glass 用 `backdrop-filter: blur(12px); background: rgba(255,255,255,0.1)`，且**暗底上少用 glass**（改用表面阶梯）。

---

## 5. Spacing / Layout / Radius：刻度化 + 节奏交替

- **间距刻度**：4px 基（最常见）或 8px 基（企业/机构常配 2/4/5/6/7px 微调档）。
  常用 `4 8 12 16 24 32 48 64 80 96 128`，token `xxs/xs/sm/md/lg/xl/xxl/section/super`。
  **never 随手取值**——每个 margin/padding 都是刻度步；grep 裸 px 应几乎为零。
- **区块节奏**：section 间距 **64–96px**（密集语境可 48–80px，cinematic/luxury 可 96–128px）；区块内组间 24–48px；组内 8–24px。
- **按钮内距**：纵 8–12px（配 line-height 让按钮高 40–48px）、横 16–28px；卡片内距 24–32px（feature 卡更大）。
- **容器**：内容栏 ~1200–1440px（密集语境 960–1200px）；长文阅读栏 60–75 字符≈640–840px。卡片栅格 `repeat(auto-fit, minmax(280px,1fr))`。
- **圆角刻度**：建 `--radius-xs…xl + pill(9999px)`。常见 `4/6/8/12/16/24/9999`。**全站按钮统一形状**：
  - 工程/紧凑 → 按钮 6–8px；消费/编辑 → pill `9999px`；luxury/精密 → 0px（锐角，badge 才 pill）。
  - **别在按钮上用 12px+ 的"半圆角矩形"**（不是惯用方言）；圆角矩形（12–20px）留给卡片。
- **节奏交替（破对称）**：别堆 3 个等布局区块。交替"全宽↔约束 / 图左↔图右 / 亮底↔暗底 / 表面反相 band"。
  **"对称读作'生成的'，非对称读作'有意的'"**——先选一个具名页面骨架再写代码，多页不要重复同一骨架。
- **栅格塌缩**：桌面 3/4/6 列 → 平板 2 列（768px）→ 移动 1 列（<640px）；pricing 4-up → 2-up → 1-up，featured 各档保持反相。
  列间 gutter 16–24px，外缘 padding 移动 16–32px / 桌面 24–48px。
- **z-index 用语义命名层级**（`--z-dropdown/--z-modal/--z-toast`），绝不 `999/9999`。

---

## 6. 组件：token 引用式定义 + 全状态

成熟系统的组件**全部用 token 名定义**（`background --color-primary, padding --space-sm --space-lg, rounded --radius-pill`），
绝不写裸值——这样组件天然随 token 变。状态变体**各自成 token 条目**（`-pressed/-disabled/-featured`），不靠伪类隐式表达。

- **每个交互组件做满 7 态**：default / hover / focus(可见焦点环) / active(按下) / disabled / loading / error。
  - 按下用 `scale(0.95~0.98)` 或更深一档色；disabled 用 hairline 底 + muted 字（**绝不** gray-on-gray，要可辨）；
    focus 用 `2px` 环（独立焦点色）。
  - 文档里**可有意省略 hover**：`default / active(pressed) / focus / disabled` 是契约，hover 交给实现——这是合理的收窄。
- **每个数据视图做满 5 态**：空 / 加载 / 错误 / 正常 / 极多——空态要有引导 CTA，不是空白。
  **不要用"骨架屏伪装最终布局"**（焦虑且拖慢感知）；要么渐进渲染真实内容 + 懒加载，要么用明确的 spinner/进度条。
- **表单输入基线**：`canvas` 底 + `1px hairline-strong` 描边 + `radius-md` + `8px 12px` 内距 + ≥40–44px 高；
  focus 切到 `2px primary` 描边（不是发光），error 切红描边 + 淡红底，success 切绿描边。
- **建"签名组件"**：每个系统都有 1–2 个标志组件，挑一个**专属于这个产品**的组件重点打磨，它就是记忆点。高频签名形态：
  - **真实产品 UI mock**（dashboard / IDE / 终端 / agent console / 代码窗），用真实截图与语法高亮，**不是**抽象插画。
  - **pill CTA**（`9999px`，纵 8–14px 横 16–28px，单 accent 或反相 canvas 色）。
  - **code well**（暗面 + mono + `radius-lg` + 16–24px 内距 + 语法高亮）。
  - **pricing tier**（3–4 卡，featured 反相，CTA 钉在卡底）。
  - **氛围 glow / starfield / 1px timeline rail**（极低透明度，建深度不喧宾夺主）。
  - **关键词高亮 chip**（accent 底圆角包住标题里的单词，无纵向 padding）。
- **容器嵌套 ≤2–3 层**（卡中卡中卡 = 失败）；卡坐在 canvas 或显式表面 band 上，不要互相套；卡内 CTA 钉底不浮动。

---

## 7. Motion：时长分桶 + 自然缓动 + 一次编排入场

- **时长分桶**：`instant 75–150ms`（图标按压/微 hover）· `fast 150–250ms`（UI 反馈/校验）· `base 250–400ms`（导航/弹窗）· `slow 400–600ms`（hero 入场/滚动揭示）；<80ms 视为"瞬时"。
- **退场 ≈ 进场的 75%**（入场 300ms → 退场约 225ms，略快更自然）。
- **缓动**：
  - 默认 ease-out（UI 最自然）：`cubic-bezier(0.16,1,0.3,1)`（quint-out）、`(0.25,0.46,0.45,0.94)`、`(0.25,1,0.5,1)`（quart）、expo。
  - 可逆过渡用 ease-in-out：`(0.4,0,0.2,1)`。
  - **禁 bounce/elastic 过冲**（`(0.34,1.56,0.64,1)`、`(0.68,-0.55,0.27,1.55)`）作常规 UI——toy-like，仅在明确"俏皮"品牌且单点使用。
- **一次编排好的入场**（staggered reveal，每项 +50~100ms 延迟，10 项封顶 ~500ms）胜过满屏散乱微交互。
- **只动 transform/opacity**，禁 animate width/height/padding/margin/border-radius/box-shadow（触发 layout，掉帧 + CLS）；
  用 `translate3d / scale`，必要时 `will-change: transform`。
- **`@media (prefers-reduced-motion: reduce)` 块必写**——把 transition/animation 降到接近 0，关掉 parallax 与复杂动画，**绝不**覆盖系统无障碍设置。
- 动画**必须自证存在**：引导注意 / 表达空间连续 / 给反馈。纯装饰动画删掉。

---

## 8. 信息架构：证据优先于装饰

- **优先级**：真实截图 / 信任模块（客户 logo、真实证言）/ 证据点 / 任务流 **>** 装饰性 hero。
  每个 feature 配一张**真实产品 UI mock**（dashboard / 代码窗 / 终端 / agent 面板 / 真实列表），论点是"看真实产品"，不是抽象插画或 stock 图。
- **证言要真**：真实引语 + 真实头像（1:1）+ 全名 + 职位/公司，**禁**占位头像；case-study 卡链到真内容，不是"learn more"空壳。
- **真实内容**：真实文案/截图/数据。禁 Lorem ipsum、禁"Welcome to [App]"、禁编造指标（`10x faster / 99.9% / trusted by 50,000+` 无出处别写）。
- **禁占位**：`Jane Doe / John Smith / Acme / example.com`。
- **同一列表的卡片用统一 chrome**（圆角/内距/描边一致），别 2–4 种卡样式混用；编辑式列表用 1px hairline 分隔行建节奏，不靠纯留白。
- **避免模板骨架**：`Hero→Features→Pricing→FAQ→CTA` 一条龙无变化 = slop；至少加 ≥1 个非常规 section（对比表 / 交互 demo / 真实数据可视化）。
- **微文案**：表单标签用句首大写、placeholder 具象（`your@email.com` 而非 "Email address"）、错误信息指向具体字段；CTA 用具体动作（"See pricing"）而非"Click here / Learn more"。

---

## 9. 可访问性（设计阶段大胆，底线不破）

> 设计**生成时先大胆**，把无障碍强校验放到 review/quality；但对比、焦点、aria、触控这些**底线仍不可破**。

- 对比 ≥4.5:1（正文）/ ≥3:1（大字与 UI）；目标可拉到 7:1（AAA）。不只靠颜色传达状态（红错配图标/文字）。
  暗底白字（`#fff` on `#0b0b0b` ≈ 17:1）、亮底深字（`#1f1633` on `#fff` ≈ 11:1）天然过 AAA——以此为锚。
- 焦点环可见且不可删（`outline: none` 必须有替代）；键盘可达，tab 顺序跟随源序；modal trap focus、drawer 返回 focus。
  焦点色与 primary 可不同（更高亮度蓝），2px 描边或 2–4px offset。
- 语义 HTML 优先（`<button>/<a>/<form>/<input>` 而非 `<div role>`）；icon-only 按钮加 `aria-label`；
  用语义 landmark（nav/main/aside）；动态区用 live region；disabled 用 `disabled` 属性 + 视觉区分。
- 触控目标 ≥44×44px（移动端，宽松 48px），相邻可点元素间距 ≥8px；输入框高 40–56px。

---

## 10. DESIGN.md 文档结构（推荐章节顺序）

成熟系统的设计文档用**固定章节顺序 + YAML frontmatter**，让 AI 能稳定复现。frontmatter 携带 `version / name / description / colors / typography / rounded / spacing / components`：

```
## Overview          —— 一段话讲清"气质 + 一个记忆点 + 真实参照"
## Colors            —— Brand/Accent · Surface · Text · Semantic · Gradient（每色带 token 名 + hex + 用途）
## Typography        —— Font Family(含 fallback) · Hierarchy(表格:token|size|weight|line-height|tracking|use) · Principles · 开源替身说明
## Layout            —— Spacing(刻度) · Grid & Container · Whitespace 哲学 · Radius 刻度
## Elevation & Depth —— 分级表(level|treatment|use) + 深度媒介说明（阴影配方 / surface ladder / hairline / glow）
## Shapes            —— Radius 刻度表 · 图像几何(宽高比/裁切)
## Components        —— 每个组件用 token 名定义 + 全状态；标注 Signature Components
## Do's and Don'ts   —— 各 5–8 条，"Don't" 直接对应这个产品的反面
## Responsive        —— 断点表 · 触控目标 · 折叠策略 · 图像行为
## Iteration Guide   —— 7–8 条维护一致性的指令（引 token、跑 lint、变体命名）
## Self-critique      —— 6 维各打 1–5（Philosophy/Hierarchy/Execution/Specificity/Restraint/Variety），<3 必改
## Known Gaps         —— 诚实标注本文档"没定"的部分（如某些动效时长、校验态、登录后界面、字体授权）
```

**让 AI 能稳定复现的关键技巧**：
- **任何刻度用表格**（字阶 / 圆角 / 间距 / elevation），列：`token | value | use`——给模型一个"封闭词表"。
- **每个值都是 token 引用**（`{color.primary}` / `var(--space-lg)`），组件里**永不**写裸值；hex 一律小写 6 位，不写 3 位简写/rgb。
- **状态变体各自成条目**（`button-primary` / `button-primary-pressed` / `button-primary-disabled`），让全状态集显式。
- **Do's and Don'ts 各 5–8 条**，把品味变成可勾选规则；"Don't" 要正对这个产品的反面（如"display 不超 600 字重""按钮不用 pill"）。
- **`## Known Gaps` 诚实划界**：写清哪些没定，模型就不会瞎编值——比硬凑一个 generic 默认更好。
- **组件状态可有意省略 hover**：default/active(pressed)/focus/disabled 是契约，hover 交给实现——AI 文档里这是合理的收窄。

---

## 11. 生成顺序（每步定了再下一步）

1. **Design Read（一句话）**：什么页面 / 给谁 / 什么气质（3 个具象词）/ 选哪个家族 + 一行 AVOID + **在本领域挑 1–3 个真实参照、各借一个具体动作**。
2. **锁 token 表**：OKLCH/hex 调色板 → 语义 token；字体（display+body+可选 mono）+ 字阶 + 字距；图标库（单一）；间距/圆角/阴影/动效刻度。
3. **布局骨架**（可先 ASCII 线框）+ 动效规格 + 1 个签名组件。
4. **才写实现**，只引用已锁 token；组件做满 7 态、数据视图做满 5 态。

**终极判据（thumbnail test）**：把成品缩成缩略图，应一眼认出是"这个产品"，而非"又一个 AI 页面"。认不出 = 你交了模板，重做。

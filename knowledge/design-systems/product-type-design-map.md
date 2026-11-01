---
id: product-type-design-map
title: 产品类型 → 设计推荐表
domain: design-systems
category: design-systems
tags: [palette, typography, product-type, design-systems, tokens, contrast]
quality_score: 76
last_updated: 2026-07-14
---
# 产品类型 → 设计推荐表（concrete palette + 字体对，照抄起步）

> 别从空白页开始猜。先按产品类型查这张表拿到**具体起步 token + 字体对 + 落地结构 + 必避反模式**，再结合所选档位(`anti-ai-slop.md` 的家族)细化。
> **先读 `01-register.md` 定 register**：`brand`(落地/营销/作品集)与 `product`(应用/后台/工具)吃的是两套规则，用错那套会让产品 UI 更难用。

## 用法
1. 按需求匹配最接近的产品类型行。
2. 取它的 Primary / Accent / Background / Foreground 作为 `--color-*` token 起点（写进 `:root`，组件里只用 `var()`）。
3. **每个 surface 必须配一个 `on-` 前景**：`--color-bg`/`--color-on-bg`、`--color-primary`/`--color-on-primary`……表里的 Foreground 就是 `--color-on-bg`。
4. 取字体对作为 display×body（标题/正文对比轴）。`product` register 行：正文用中性 UI 字体是**正确**的，别硬塞展示字体。
5. 落地结构与必避项作为硬约束。

## 推荐表

表内每一行都已用 WCAG 算过：Foreground↔Background ≥ 4.5:1（正文），Primary/Accent↔Background ≥ 3:1（UI/大字）。改色后**重算**，别靠眼睛。

| 产品类型 | register | 主风格 | Primary | Accent | Background | Foreground(on-bg) | 字体对(display / body) | 落地结构 | 必避 |
|---|---|---|---|---|---|---|---|---|---|
| SaaS(通用) | brand+product | 玻璃+扁平 | `#2563EB` | `#B45309` | `#F8FAFC` | `#0F172A` | Geist / Inter | Hero+Features+CTA | 过度动效、默认深色 |
| 微 SaaS / indie | brand | 扁平+活力 | `#0F766E` | `#B45309` | `#F6F8F7` | `#14201D` | Space Grotesk / DM Sans | Minimal+Demo | 静态无演示、移动端差 |
| 电商 | brand | 鲜明块面 | `#047857` | `#C2410C` | `#ECFDF5` | `#0B2A1F` | Clash Display / Inter | 商品 showcase | 无深度的纯扁平、文字堆砌 |
| 电商-奢侈 | brand | premium-luxury | `#1C1917` | `#8A6C34` | `#FAFAF9` | `#1C1917` | Playfair / Inter | 大图+留白 | 鲜艳/廉价实心按钮 |
| B2B 服务 | brand | 信任+极简 | `#0F172A` | `#0369A1` | `#F8FAFC` | `#0F172A` | Söhne / Inter | 信任模块+案例 | 花哨、第二强调色 |
| 金融仪表盘 | product | 数据密+深色 | `#38BDF8` | `#22C55E` | `#020617` | `#E2E8F0` | Inter / Inter | 数据看板 | 涨跌只用色不用符号 |
| 分析后台 | product | 数据密+热力 | `#1E40AF` | `#B45309` | `#F8FAFC` | `#0F172A` | Inter / Inter | 表格+图表 | 小字、gray-on-gray |
| 医疗健康 | brand+product | 柔和+可达 | `#0E7490` | `#047857` | `#ECFEFF` | `#0B2530` | Lora / Raleway | 信任+预约 | AI 紫粉渐变、低对比 |
| 教育 | brand+product | 柔和+微交互 | `#0E7490` | `#C2410C` | `#F0F7FA` | `#132A33` | Fredoka / Nunito | 课程+进度 | 冷峻严肃、密集 |
| 创意机构 | brand | brutalist-bold+motion | `#E6FF00` | `#FF2D2D` | `#0A0A0A` | `#FAFAFA` | Archivo Expanded / Inter Tight | 作品流 | 圆角柔和、居中弱字 |
| 作品集 | brand | motion+极简 | `#18181B` | `#1D4ED8` | `#FAFAFA` | `#18181B` | Clash Display / Inter | 项目网格 | 千篇一律模板 |
| 游戏 | brand | 3D+赛博 | `#00E5FF` | `#F43F5E` | `#0B0E1A` | `#E6F1FF` | Orbitron / Rajdhani | 沉浸 hero | 平淡无能量 |
| 金融科技/Crypto | brand+product | glass-aurora+深色 | `#5E8BFF` | `#36E0C8` | `#07080D` | `#E9EDF7` | General Sans / Inter | 实时数据+信任 | 满屏紫渐变、夸大收益 |
| 约会/社交 | brand | 活力+motion | `#D6244A` | `#9D2A6B` | `#FFF0F4` | `#2B1017` | Cabinet Grotesk / Inter | 卡片流 | 冷淡、低饱和 |
| 餐饮/美食 | brand | 暖色+motion | `#C2410C` | `#8A6410` | `#FFF8F0` | `#2A1A0C` | Recoleta / Inter | 大图诱食 | 冷色、无食物图 |
| 健身 | brand | 活力+深色 OLED | `#FF6B35` | `#00D4FF` | `#0A0A0A` | `#F5F5F5` | Druk / Inter | 强动感 hero | 柔弱、低对比 |
| 房产 | brand | 玻璃+极简 | `#0369A1` | `#8A6C34` | `#FCFCFB` | `#14181C` | Canela / Inter | 大图+地图 | 廉价、密集 |
| 旅行 | brand | aurora+motion | `#0369A1` | `#B45309` | `#F0F9FF` | `#0C2436` | Tiempos / Inter | 目的地大图 | 灰暗无憧憬感 |
| 音乐流媒体 | product | 深色 OLED+专辑色 | `#1DB954` | `#F5C518` | `#121212` | `#E8E8E8` | Inter / Inter | 沉浸播放（强调色可按封面动态取样，但仍须过对比） | 浅底、低对比 |
| 开发者工具/IDE | product | tech-utility/terminal | `#E0E0E0` | `#4AF626` | `#0A0A0A` | `#E0E0E0` | Berkeley Mono / Inter | 暗色+蓝焦点 | 花哨、圆润可爱 |
| AI/大模型产品 | brand+product | glass-aurora | `#5E8BFF` | `#36E0C8` | `#07080D` | `#E9EDF7` | General Sans / Inter | 对话/生成展示 | AI 紫主色、满屏渐变 |

## 字体对速查（按气质）
- 古典优雅(奢侈)：Playfair/Canela × Inter
- 现代专业(SaaS)：Geist/Poppins × Inter
- 科技初创(dev/AI)：Space Grotesk/General Sans × DM Sans
- 极简瑞士(后台)：Inter × Inter（`product` register 下这是**正确**选择，不是偷懒）
- 活泼创意(儿童/教育)：Fredoka/Cabinet × Nunito
- 大胆宣言(机构/文化)：Archivo Expanded/Druk × Source Sans
- 康养平和(健康)：Lora × Raleway
- 编辑经典(出版)：Cormorant/Tiempos × Libre Baskerville

## 图标
每个产品**声明一个**图标库 + **一种**描边粗细，全站不混用；禁 emoji 当图标；禁手搓装饰性 SVG。具体选哪个库是每个 pack / 每个产品自己的决定，不是全局默认。

---
**注（硬禁令 + 正向目标）**：OKLCH 色相 270–320 且 chroma ≥ 0.09 的紫/靛（`#6366F1 / #4F46E5 / #8B5CF6 / #7C3AED / #A855F7` 及邻近色）是公认的 "AI-slop 紫"——**不要**用它当主色/强调色/hero 渐变，除非需求原文明确要紫色。
**改用**：上表里已经算过对比度的电蓝 + 青绿(glass-aurora)来表达"AI/未来感"；要"高级"就用 premium-luxury 的金；要"硬核"就用 brutalist 的电光黄。

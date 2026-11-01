---
id: brutalist-bold
title: Brutalist Bold
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [brutalist, swiss, editorial, mono, high-contrast, oversized-type, design-systems, palette, patterns]
register: [brand]
icon-library: Tabler
icon-stroke: 2
quality_score: 72
last_updated: 2026-07-14
---
# Brutalist Bold

> 瑞士国际主义 / 数字野兽派：巨型排版、单色高对比、硬边、网格驱动、近乎零圆角。强烈、自信、有态度。

## When to use

创意机构、作品集、时尚/文化/音乐、艺术展、宣言式落地页、开发者硬核工具的"反精致"品牌。要"被记住"胜过"友好"的产品。**不适合**：需要亲和力的消费/教育/医疗、数据密集后台。

## Color palette

```css
:root {
  /* Surfaces + paired foregrounds — hard edges, zero softness, still AA-legible */
  --color-bg: oklch(14.5% 0 0);                  /* #0a0a0a */
  --color-on-bg: oklch(98.5% 0 0);
  --color-surface: oklch(19.1% 0 0);
  --color-on-surface: oklch(98.5% 0 0);
  --color-card: oklch(22.6% 0 0);
  --color-on-card: oklch(90.7% 0 0);
  --color-muted: oklch(17.8% 0 0);
  --color-on-muted: oklch(71.5% 0 0);

  --color-primary: oklch(94.9% 0.218 116.7);     /* 单一刺眼信号色：电光黄 */
  --color-on-primary: oklch(14.5% 0 0);
  --color-primary-hover: oklch(97.0% 0.180 116.7);
  --color-accent: oklch(64.5% 0.241 27.4);       /* 危险红，仅用于最强调 */
  --color-on-accent: oklch(14.8% 0.061 29.2);

  --color-success: oklch(81.0% 0.214 151.8);
  --color-on-success: oklch(23.4% 0.054 154.8);
  --color-warning: oklch(81.2% 0.170 76.4);
  --color-on-warning: oklch(24.2% 0.050 83.0);
  --color-error: oklch(64.5% 0.241 27.4);
  --color-on-error: oklch(14.8% 0.061 29.2);

  --color-border: oklch(26.0% 0 0);
  --color-border-strong: oklch(98.5% 0 0);       /* 硬边：1-2px */

  /* Type scale — brand register: 巨型排版 */
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.25rem; --text-xl: 2rem; --text-2xl: 3rem;
  --text-3xl: 4rem; --text-display: clamp(4rem, 11vw, 15rem);

  /* Spacing — 4pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
  --space-24: 96px;

  --radius-sm: 0px; --radius-md: 0px; --radius-lg: 0px; --radius-full: 0px;  /* 野兽派：拒绝圆角 */

  --duration-fast: 80ms;
  --duration-normal: 160ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);   /* 硬切，不弹 */
}

@media (prefers-color-scheme: light) {
  :root {
    --color-bg: oklch(96.1% 0.003 106.4); --color-on-bg: oklch(14.5% 0 0);
    --color-surface: oklch(100% 0 0); --color-on-surface: oklch(14.5% 0 0);
    --color-card: oklch(100% 0 0); --color-on-card: oklch(32.1% 0 0);
    --color-muted: oklch(92.4% 0.004 106.5); --color-on-muted: oklch(37.1% 0 0);
    --color-primary: oklch(46.7% 0.303 266.3);   /* 浅色下换电光蓝 */
    --color-on-primary: oklch(100% 0 0);
    --color-accent: oklch(51.6% 0.202 28.2); --color-on-accent: oklch(100% 0 0);
    --color-success: oklch(46.4% 0.115 154.2); --color-on-success: oklch(100% 0 0);
    --color-warning: oklch(47.1% 0.099 76.3); --color-on-warning: oklch(100% 0 0);
    --color-error: oklch(51.6% 0.202 28.2); --color-on-error: oklch(100% 0 0);
    --color-border-strong: oklch(14.5% 0 0);
  }
}
```

## Typography

- **Display**: `"Archivo Expanded", "Anton", "Helvetica Now Display", Helvetica, Arial, sans-serif`, weight 800–900
- **Body**: `"Inter Tight", Helvetica, Arial, sans-serif`（此档允许 Helvetica 家族——它是瑞士风的正统）
- **Mono / 数字**: `"JetBrains Mono", "Space Mono", monospace`

| Level | Size | Weight | Line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| mega | clamp(4rem, 11vw, 15rem) | 900 | 0.85 | -0.04em | 满屏巨标题，UPPERCASE |
| display | 4rem (64px) | 800 | 0.9 | -0.03em | Hero |
| h1 | 2.5rem (40px) | 800 | 0.95 | -0.02em | Section，常 UPPERCASE |
| h2 | 1.5rem (24px) | 700 | 1.1 | -0.01em | Subsection |
| body | 1rem (16px) | 400 | 1.5 | 0 | 正文 |
| label | 0.75rem (12px) | 700 | 1.1 | 0.08em | 标签，UPPERCASE + mono |

## Layout

- 暴露的网格：可见的列线/基线，模块化排布，刻意的不对称。
- 满铺色块分区；大留白 + 大字块对撞。
- 内容硬左对齐为主（非居中）；编号区块用 mono 数字 `01 / 02 / 03`。

## Component patterns

### Hero
- 巨型 UPPERCASE 标题（mega 级），一句话副标，方形（零圆角）实心按钮。
- 背景纯色块；可叠一条 1px 全宽分隔线。

### Card
- 硬边框（1-2px 实线 `--color-border-strong`），零圆角，零阴影；hover 时整卡反色（背景↔前景互换）。

### Button
- 方角、实心、`--color-primary`；hover：瞬时反色或位移 2px + 出现硬投影 `4px 4px 0 var(--color-text)`。

## Motion

- `--transition: 120ms steps(1)` 或 `cubic-bezier(0.2,0,0,1)`——干脆、机械，不要缓动 bounce。
- 入场用硬切/位移，不要柔和 fade；尊重 `prefers-reduced-motion`。

## Do

- 一个页面只用 1 个信号色，且面积极小（CTA、关键数字）。
- 巨字 + 硬边 + 网格三件套；mono 数字。
- UPPERCASE 标题与标签，字距收紧（标题）/放开（标签）。

## Don't

- 圆角、柔和阴影、渐变、紫色——与本档冲突。
- 居中、柔弱小字、卡片堆叠的"友好"布局（那是 soft-warm）。
- 超过 2 种信号色；emoji。

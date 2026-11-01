---
id: glass-aurora
title: Glass Aurora
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [glassmorphism, aurora, frosted, depth, ai, modern, gradient-controlled, design-systems, palette, patterns]
register: [brand]
icon-library: Lucide
icon-stroke: 1.5
quality_score: 72
last_updated: 2026-07-14
---
# Glass Aurora

> 克制的玻璃拟态 + 极光氛围：磨砂半透明层、深邃暗背景上一抹受控的极光渐变、清晰的 z 轴层级。现代、有科技感、不廉价。

## When to use

AI / 大模型产品、现代消费工具、creator 工具、做得高级的 web3/crypto、需要"未来感"的发布页。**关键**：极光是**氛围**不是 hero 主体；一旦满屏渐变就变 AI-slop。**不适合**：数据密集后台、严肃金融、儿童教育。

## Color palette

```css
:root {
  /* Surfaces + paired foregrounds — 玻璃层叠在实底 token 之上，前景永远配对 */
  --color-bg: oklch(13.6% 0.012 274.6);          /* 近黑带蓝 */
  --color-on-bg: oklch(97.3% 0.007 268.5);
  --color-surface: oklch(19.3% 0.017 273.8);     /* 玻璃层的实底回退（backdrop-filter 不可用时） */
  --color-on-surface: oklch(97.3% 0.007 268.5);
  --color-card: oklch(23.2% 0.020 271.8);
  --color-on-card: oklch(91.6% 0.016 270.0);
  --color-muted: oklch(17.0% 0.015 272.3);
  --color-on-muted: oklch(71.3% 0.033 269.7);

  --color-primary: oklch(66.2% 0.179 265.8);     /* 克制的电蓝 — 蓝，不是 AI 紫 */
  --color-on-primary: oklch(14.9% 0.041 261.8);
  --color-primary-hover: oklch(72.0% 0.160 265.8);
  --color-accent: oklch(81.8% 0.137 180.7);      /* 青绿点缀 */
  --color-on-accent: oklch(23.5% 0.039 183.5);

  --color-success: oklch(81.8% 0.137 180.7);
  --color-on-success: oklch(23.5% 0.039 183.5);
  --color-warning: oklch(86.2% 0.135 81.0);
  --color-on-warning: oklch(24.2% 0.047 81.2);
  --color-error: oklch(69.5% 0.196 18.5);
  --color-on-error: oklch(19.6% 0.065 20.5);

  /* 玻璃 */
  --color-glass: oklch(100% 0 0 / 0.04);
  --color-glass-strong: oklch(100% 0 0 / 0.08);
  --color-glass-border: oklch(100% 0 0 / 0.12);  /* 1px 反光描边 */
  --color-border: oklch(100% 0 0 / 0.08);
  --blur: 16px;

  /* 极光：极低饱和、大模糊、固定在背景，绝不做成 hero 主色块 */
  --aurora: radial-gradient(60% 50% at 20% 0%, oklch(66.2% 0.179 265.8 / 0.18), transparent 70%),
            radial-gradient(50% 40% at 90% 10%, oklch(81.8% 0.137 180.7 / 0.12), transparent 70%);

  /* Type scale — brand register */
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.25rem; --text-xl: 1.625rem; --text-2xl: 2.25rem;
  --text-3xl: 3rem; --text-display: 4.5rem;

  /* Spacing — 4pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
  --space-24: 96px;

  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-full: 9999px;

  --duration-fast: 150ms;
  --duration-normal: 240ms;
  --duration-reveal: 600ms;
  --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-color-scheme: light) {
  :root {
    --color-bg: oklch(97.6% 0.007 268.5); --color-on-bg: oklch(18.4% 0.040 271.0);
    --color-surface: oklch(100% 0 0); --color-on-surface: oklch(18.4% 0.040 271.0);
    --color-card: oklch(100% 0 0); --color-on-card: oklch(37.7% 0.044 273.7);
    --color-muted: oklch(94.9% 0.013 266.7); --color-on-muted: oklch(42.5% 0.042 274.0);
    --color-primary: oklch(48.0% 0.191 266.5); --color-on-primary: oklch(100% 0 0);
    --color-accent: oklch(47.4% 0.085 180.5); --color-on-accent: oklch(100% 0 0);
    --color-success: oklch(47.4% 0.085 180.5); --color-on-success: oklch(100% 0 0);
    --color-warning: oklch(51.2% 0.108 75.1); --color-on-warning: oklch(100% 0 0);
    --color-error: oklch(53.7% 0.190 21.0); --color-on-error: oklch(100% 0 0);
    --color-glass: oklch(100% 0 0 / 0.7);
    --color-glass-border: oklch(18.4% 0.040 271.0 / 0.08);
    --aurora: radial-gradient(60% 50% at 20% 0%, oklch(48.0% 0.191 266.5 / 0.10), transparent 70%);
  }
}
```

## Typography

- **Display / Headlines**: `"General Sans", "Geist", system-ui, sans-serif`, weight 600
- **Body**: `"Inter", system-ui, sans-serif`（此档正文允许 Inter，但标题必须用更有性格的字）
- **Mono**: `"Geist Mono", monospace` — 用于数据/代码

| Level | Size | Weight | Line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| display | 3.5rem (56px) | 600 | 1.05 | -0.02em | Hero |
| h1 | 2.25rem (36px) | 600 | 1.1 | -0.015em | Section |
| h2 | 1.5rem (24px) | 600 | 1.2 | -0.01em | Subsection |
| body-lg | 1.125rem (18px) | 400 | 1.6 | 0 | Lead |
| body | 1rem (16px) | 400 | 1.6 | 0 | 正文 |
| caption | 0.8125rem (13px) | 500 | 1.4 | 0.02em | 标签 |

## Layout

- 深背景 + 固定的 `--aurora` 氛围层（`position: fixed; filter: blur(40px)`，不随滚动喧宾）。
- 内容用磨砂玻璃卡浮在其上，建立清晰 z 层级。
- 居中适度但配非对称强调；不要满屏等高卡。

## Component patterns

### Glass card
- `background: var(--color-surface); backdrop-filter: blur(var(--blur)); border: 1px solid var(--color-glass-border); border-radius: var(--radius);`
- 顶部 1px 高光（`box-shadow: inset 0 1px 0 rgba(255,255,255,0.15)`）。

### Hero
- 标题 + 副标 + 主 CTA；背景是 `--aurora`（低饱和、大模糊），**不是**实心紫渐变块。
- CTA：实心 `--color-primary`，hover 微亮 + 轻微上浮。

### Button / Input
- 玻璃或实心两种；focus 用 `--color-primary` 2px 环 + 轻微外发光（克制）。

## Motion

- `--ease: cubic-bezier(0.16, 1, 0.3, 1)`；时长 200/300ms；卡片 hover 上浮 2-4px + 高光增强。
- 入场 staggered fade-up（`translateY(12px)`）；尊重 `prefers-reduced-motion`。

## Do

- 极光：低饱和、大模糊、固定背景、面积克制——只做氛围。
- 玻璃层要有清晰的 1px 反光描边和层级；深色为主。
- 主色 + 一个青绿点缀，其余中性。

## Don't

- 满屏鲜艳渐变 / 紫→粉 hero（这正是要避免的 AI-slop）。
- 玻璃叠太多层导致可读性差、对比不足。
- 在亮背景上乱用低透明玻璃（对比塌掉）。

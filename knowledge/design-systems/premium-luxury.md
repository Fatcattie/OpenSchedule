---
id: premium-luxury
title: Premium Luxury
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [luxury, premium, refined, elegant, serif, dark, single-accent, generous-space, design-systems, palette, patterns]
register: [brand]
icon-library: Heroicons
icon-stroke: 1
quality_score: 72
last_updated: 2026-07-14
last_note: high-end refined aesthetic
---
# Premium Luxury

> 高端、精致、克制：近黑底 + 单一精炼金属/宝石色、大量呼吸留白、优雅的衬线/无衬线对比、慢而顺滑的动效。"$150k 机构感"——少即是贵。

## When to use

奢侈品牌、高端金融/私行/财富、汽车/腕表/珠宝、高端 SaaS / 企业旗舰、会员制产品、精品内容。**核心**：克制是奢华的本质——任何"多"都减分。**不适合**：大众消费打折促销、儿童、数据密集后台。

## Color palette

```css
:root {
  /* Surfaces + paired foregrounds — 克制是奢华的本质 */
  --color-bg: oklch(15.0% 0.002 286.1);
  --color-on-bg: oklch(96.5% 0.006 84.6);        /* 暖白，非纯白 */
  --color-surface: oklch(18.8% 0.006 285.8);
  --color-on-surface: oklch(96.5% 0.006 84.6);
  --color-card: oklch(22.4% 0.008 285.8);
  --color-on-card: oklch(88.6% 0.012 84.6);
  --color-muted: oklch(17.9% 0.006 285.8);
  --color-on-muted: oklch(70.8% 0.012 76.6);

  --color-primary: oklch(74.8% 0.089 84.2);      /* 单一精炼金 —— 唯一强调，面积极小 */
  --color-on-primary: oklch(19.5% 0.024 84.0);
  --color-primary-hover: oklch(80.0% 0.080 84.2);
  --color-accent: oklch(74.8% 0.089 84.2);       /* 不引入第二强调色 */
  --color-on-accent: oklch(19.5% 0.024 84.0);

  --color-success: oklch(71.7% 0.065 139.3);
  --color-on-success: oklch(19.9% 0.038 140.1);
  --color-warning: oklch(75.5% 0.103 82.1);
  --color-on-warning: oklch(22.4% 0.042 87.2);
  --color-error: oklch(66.3% 0.123 25.2);
  --color-on-error: oklch(20.0% 0.054 28.7);

  --color-border: oklch(26.5% 0.006 285.8);
  --color-border-accent: oklch(74.8% 0.089 84.2 / 0.4);

  /* Type scale — 衬线标题 × 无衬线正文的对比 */
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.25rem; --text-xl: 1.625rem; --text-2xl: 2.25rem;
  --text-3xl: 3.25rem; --text-display: 5rem;

  /* Spacing — 4pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
  --space-24: 96px;

  --radius-sm: 2px; --radius-md: 4px; --radius-lg: 4px; --radius-full: 9999px;  /* 极小圆角，克制 */

  --duration-fast: 200ms;
  --duration-normal: 400ms;
  --duration-reveal: 900ms;                       /* 慢而顺滑 */
  --ease-standard: cubic-bezier(0.22, 1, 0.36, 1);

  --shadow-soft: 0 24px 60px rgb(0 0 0 / 0.5);
}

@media (prefers-color-scheme: light) {
  :root {
    --color-bg: oklch(97.9% 0.007 88.6);         /* 暖象牙白（非奶油 AI 米色——极低饱和的真象牙 + 金强调区分） */
    --color-on-bg: oklch(21.0% 0.008 84.6);
    --color-surface: oklch(100% 0 0); --color-on-surface: oklch(21.0% 0.008 84.6);
    --color-card: oklch(100% 0 0); --color-on-card: oklch(35.4% 0.017 82.3);
    --color-muted: oklch(94.9% 0.012 91.5); --color-on-muted: oklch(41.1% 0.017 84.6);
    --color-primary: oklch(54.9% 0.083 81.1);    /* 浅底下加深金以保对比 */
    --color-on-primary: oklch(100% 0 0);
    --color-accent: oklch(54.9% 0.083 81.1); --color-on-accent: oklch(100% 0 0);
    --color-success: oklch(48.2% 0.091 141.4); --color-on-success: oklch(100% 0 0);
    --color-warning: oklch(49.2% 0.096 80.3); --color-on-warning: oklch(100% 0 0);
    --color-error: oklch(51.8% 0.135 26.8); --color-on-error: oklch(100% 0 0);
    --color-border: oklch(90.5% 0.010 88.6);
  }
}
```

## Typography

- **Display / Headlines**: `"Canela", "Ogg", "Tiempos Headline", Georgia, serif`（精致衬线建立高级感）weight 400–500
- **Body / UI**: `"Söhne", "Suisse Int'l", "Neue Haas Grotesk", system-ui, sans-serif`, weight 400
- 衬线标题 × 无衬线正文的对比，是奢华版式的标志。

| Level | Size | Weight | Line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| display | 4rem (64px) | 400 | 1.05 | -0.01em | Hero（衬线，细 weight 反而更贵） |
| h1 | 2.5rem (40px) | 500 | 1.15 | -0.005em | Section（衬线） |
| h2 | 1.5rem (24px) | 500 | 1.25 | 0 | Subsection |
| body-lg | 1.25rem (20px) | 400 | 1.7 | 0 | Lead（无衬线） |
| body | 1rem (16px) | 400 | 1.7 | 0 | 正文 |
| overline | 0.75rem (12px) | 500 | 1.2 | 0.18em | 标签，ALL CAPS，宽字距 |

## Layout

- 大量负空间；少而精的元素；严格对齐与基线网格。
- 居中或经典栅格皆可，但**密度低**——一屏只讲一件事。
- 全幅高质量影像（产品/材质特写）配极简文字。

## Component patterns

### Hero
- 衬线大标题（细 weight）+ 一行副标 + 一个克制的描边/文字按钮（非实心大色块）。
- 背景：纯深色或极细的材质纹理；金色仅出现在一处。

### Card
- 极小圆角、`--shadow-soft` 极柔阴影或 1px `--color-border`；可用"双层内描边"（concentric border）增加精工感。
- hover：极轻微上浮 + 边框转金，动作慢（500-700ms）。

### Button
- 首选描边/幽灵按钮或细金线；实心仅留给唯一主 CTA。圆角小。

## Motion

- `--ease: cubic-bezier(0.32, 0.72, 0, 1)`；时长 **500–700ms**（慢即贵）；退场 ≈75%。
- 入场：缓慢 fade + 轻微上移 + 轻微 blur 收敛；尊重 `prefers-reduced-motion`。

## Do

- 单一金/宝石强调色，面积极小（一屏 1-2 处）。
- 衬线标题 × 无衬线正文；细字重；宽字距 ALL CAPS 标签。
- 慷慨留白 + 慢动效 + 高质量影像。

## Don't

- 多强调色、饱和色、渐变、紫色。
- 拥挤密集、小留白、廉价的实心大色块按钮。
- 快/弹跳动效（与"贵"相反）；emoji。

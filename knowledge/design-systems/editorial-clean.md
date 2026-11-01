---
id: editorial-clean
title: Editorial Clean
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [clean, color, component, design-systems, editorial, motion, palette, patterns]
register: [brand, product]
icon-library: Heroicons
icon-stroke: 1.5
quality_score: 70
last_updated: 2026-07-14
---
# Editorial Clean

> Magazine-like, serif-accent headings, photography-driven.

## When to use

Content sites, blogs, portfolios, documentation, news/media products. Products where reading experience is the primary value.

## Color palette

```css
:root {
  /* Surfaces + paired foregrounds */
  --color-bg: oklch(99.4% 0.003 84.6);           /* warm near-white, not a templated cream */
  --color-on-bg: oklch(21.8% 0 0);
  --color-surface: oklch(100% 0 0);
  --color-on-surface: oklch(21.8% 0 0);
  --color-card: oklch(100% 0 0);
  --color-on-card: oklch(35.0% 0.009 80.7);
  --color-muted: oklch(97.0% 0.007 88.6);
  --color-on-muted: oklch(45.4% 0.014 84.6);

  --color-primary: oklch(49.5% 0.157 29.5);      /* ink red */
  --color-on-primary: oklch(100% 0 0);
  --color-primary-hover: oklch(44.5% 0.150 29.5);
  --color-accent: oklch(35.6% 0.039 249.0);      /* slate blue */
  --color-on-accent: oklch(100% 0 0);

  --color-success: oklch(52.5% 0.123 152.7);
  --color-on-success: oklch(100% 0 0);
  --color-warning: oklch(54.5% 0.116 70.2);
  --color-on-warning: oklch(100% 0 0);
  --color-error: oklch(54.3% 0.174 29.7);
  --color-on-error: oklch(100% 0 0);

  --color-border: oklch(91.0% 0.008 84.6);
  --color-border-hover: oklch(85.0% 0.010 84.6);
  --color-border-focus: oklch(49.5% 0.157 29.5);

  /* Type scale — reading-first: a real display step, calm body steps */
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1.0625rem;
  --text-lg: 1.25rem; --text-xl: 1.5rem; --text-2xl: 2rem;
  --text-3xl: 2.75rem; --text-display: 4rem;

  /* Spacing — 4pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
  --space-24: 96px;

  --radius-sm: 2px; --radius-md: 4px; --radius-lg: 6px; --radius-full: 9999px;

  --duration-fast: 140ms;
  --duration-normal: 220ms;
  --ease-standard: cubic-bezier(0.2, 0, 0.2, 1);

  --shadow-sm: 0 1px 3px rgb(0 0 0 / 0.04);
  --shadow-md: 0 4px 12px rgb(0 0 0 / 0.06);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: oklch(19.2% 0.004 84.6); --color-on-bg: oklch(93.8% 0.012 84.6);
    --color-surface: oklch(23.9% 0.006 91.6); --color-on-surface: oklch(93.8% 0.012 84.6);
    --color-card: oklch(27.8% 0.006 78.2); --color-on-card: oklch(86.8% 0.013 82.4);
    --color-muted: oklch(21.4% 0.004 84.6); --color-on-muted: oklch(71.5% 0.013 75.3);
    --color-primary: oklch(71.6% 0.128 32.2); --color-on-primary: oklch(20.9% 0.047 33.9);
    --color-accent: oklch(76.7% 0.061 244.8); --color-on-accent: oklch(22.0% 0.027 242.6);
    --color-success: oklch(75.5% 0.137 155.7); --color-on-success: oklch(23.0% 0.055 151.4);
    --color-warning: oklch(78.5% 0.122 82.1); --color-on-warning: oklch(23.8% 0.046 80.5);
    --color-error: oklch(69.6% 0.142 28.0); --color-on-error: oklch(20.4% 0.057 30.4);
    --color-border: oklch(31.0% 0.006 84.6);
  }
}
```

## Typography

- **Headings**: `"Playfair Display", "Georgia", serif`, weight 700
- **Body**: `"Source Serif 4", "Georgia", serif`, weight 400
- **UI labels**: `"Inter", system-ui, sans-serif`, weight 500

| Level | Size | Weight | Line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| display | 3rem (48px) | 700 | 1.15 | -0.02em | Hero headline |
| h1 | 2.25rem (36px) | 700 | 1.2 | -0.015em | Article title |
| h2 | 1.75rem (28px) | 700 | 1.25 | -0.01em | Section header |
| h3 | 1.25rem (20px) | 600 | 1.35 | 0 | Subheading |
| body-lg | 1.25rem (20px) | 400 | 1.7 | 0 | Article body (long-form) |
| body | 1rem (16px) | 400 | 1.6 | 0 | Default text |
| caption | 0.8125rem (13px) | 500 | 1.4 | 0.03em | Bylines, dates, tags |

## Component patterns

### Article card
- Large featured image (aspect 16:9), bottom text block
- Title in serif h3, author/date in caption sans-serif
- No border, just spacing separation. Hover: slight shadow lift.

### Pull quote
- Left border 3px `--color-primary`, italic serif, 1.25rem

### Navigation
- Minimal top bar, logo left, text links right
- Active state: underline 2px `--color-primary`, offset 4px

## Motion

- `--transition-fast: 200ms ease` — link hovers, underlines
- `--transition-normal: 300ms ease-in-out` — card hover lift

## Do

- Large reading font (18-20px body) with generous line-height (1.6-1.7).
- One serif for headings, one serif (or sans) for body. Never 3+ fonts.
- Photography over illustration. Real images over stock.
- Generous top/bottom padding on sections (80-120px).

## Don't

- Rainbow-colored category tags.
- Sidebar clutter (ads, widgets, social buttons).
- Sans-serif headings (defeats the editorial feel).
- Cards with identical thumbnail sizes in a rigid grid (vary the layout).

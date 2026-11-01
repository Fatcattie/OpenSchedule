---
id: tech-utility
title: Tech Utility
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [color, component, design-systems, motion, palette, patterns, spacing, tech]
register: [product]
icon-library: Lucide
icon-stroke: 1.5
quality_score: 70
last_updated: 2026-07-14
---
# Tech Utility

> Dense, monospace accents, dark-mode-native.

## When to use

CLI companions, code platforms, monitoring dashboards, data tools, developer-facing products. Products where information density is a feature, not a bug.

## Color palette

```css
:root {
  /* Surfaces + paired foregrounds — dark-native, density-first */
  --color-bg: oklch(17.6% 0.014 258.4);
  --color-on-bg: oklch(94.3% 0.011 243.7);
  --color-surface: oklch(22.0% 0.016 256.8);
  --color-on-surface: oklch(94.3% 0.011 243.7);
  --color-card: oklch(24.6% 0.015 256.8);
  --color-on-card: oklch(85.7% 0.014 248.0);
  --color-muted: oklch(10.4% 0.019 248.3);
  --color-on-muted: oklch(71.4% 0.018 248.1);

  --color-primary: oklch(71.5% 0.152 253.3);     /* focus blue */
  --color-on-primary: oklch(17.7% 0.034 246.5);
  --color-primary-hover: oklch(78.0% 0.130 253.3);
  --color-accent: oklch(72.7% 0.153 52.8);       /* amber — deliberately NOT a violet accent */
  --color-on-accent: oklch(20.9% 0.037 42.3);

  --color-success: oklch(69.5% 0.181 145.6);
  --color-on-success: oklch(21.9% 0.056 147.8);
  --color-warning: oklch(72.0% 0.140 79.9);
  --color-on-warning: oklch(21.7% 0.041 83.5);
  --color-error: oklch(66.5% 0.205 27.0);
  --color-on-error: oklch(19.6% 0.057 27.7);

  --color-border: oklch(32.5% 0.014 256.8);
  --color-border-hover: oklch(43.0% 0.014 256.8);
  --color-border-focus: oklch(71.5% 0.152 253.3);

  /* Type scale — product register: fixed ratio 1.125-1.2, small steps, dense rows */
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.125rem; --text-xl: 1.375rem; --text-2xl: 1.625rem;
  --text-3xl: 1.875rem;

  /* Spacing — 4pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
  --space-24: 96px;

  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px; --radius-full: 9999px;

  --duration-fast: 100ms;
  --duration-normal: 150ms;
  --ease-standard: cubic-bezier(0.2, 0, 0.2, 1);

  --shadow-sm: 0 0 0 1px var(--color-border);
  --shadow-md: 0 3px 12px rgb(1 4 9 / 0.4);
}

@media (prefers-color-scheme: light) {
  :root {
    --color-bg: oklch(100% 0 0); --color-on-bg: oklch(25.4% 0.011 254.0);
    --color-surface: oklch(97.8% 0.003 247.9); --color-on-surface: oklch(25.4% 0.011 254.0);
    --color-card: oklch(100% 0 0); --color-on-card: oklch(38.4% 0.018 254.7);
    --color-muted: oklch(96.0% 0.005 247.9); --color-on-muted: oklch(44.9% 0.018 251.3);
    --color-primary: oklch(54.0% 0.191 257.5); --color-on-primary: oklch(100% 0 0);
    --color-accent: oklch(52.1% 0.115 56.5); --color-on-accent: oklch(100% 0 0);
    --color-success: oklch(43.9% 0.118 148.1); --color-on-success: oklch(100% 0 0);
    --color-warning: oklch(46.6% 0.101 70.2); --color-on-warning: oklch(100% 0 0);
    --color-error: oklch(50.5% 0.183 26.5); --color-on-error: oklch(100% 0 0);
    --color-border: oklch(87.0% 0.008 247.9);
  }
}
```

## Typography

Product register: a familiar neutral UI face is the CORRECT choice here — the user is reading logs and metrics, not admiring letterforms.

- **UI / Body**: `Inter, ui-sans-serif, system-ui, sans-serif`, weight 400
- **Headings**: same family, weight 600 (hierarchy from weight + color, not a second face)
- **Code / Data**: `"JetBrains Mono", ui-monospace, monospace`, weight 400 — tabular figures for every column of numbers

Every row draws from the token scale (adjacent step ratio 1.125–1.2); nothing invents a size.

| Level | Token | Size | Weight | Line-height | Use |
|---|---|---|---|---|---|
| h1 | `--text-3xl` | 30px | 600 | 1.25 | Page title (compact) |
| h2 | `--text-xl` | 22px | 600 | 1.3 | Section header |
| h3 | `--text-lg` | 18px | 600 | 1.4 | Panel title |
| body | `--text-base` | 16px | 400 | 1.5 | Default text |
| body-sm | `--text-sm` | 14px | 400 | 1.45 | Table cells, metadata |
| mono | `--text-sm` | 14px | 400 | 1.5 | Code, terminal output |
| caption | `--text-xs` | 12px | 500 | 1.3 | Timestamps, status labels |

## Component patterns

### Data table
- Monospace numbers right-aligned, text left-aligned
- Alternating row bg: transparent / surface-sunken
- Sticky header, sortable columns (chevron indicator)
- Compact row height: 36px

### Status badge
- Dot (8px circle) + label. Colors: success/warning/error/neutral
- No filled backgrounds — just colored dot + text

### Code block
- `bg-surface-sunken`, monospace, line numbers in text-tertiary
- Copy button top-right, language label top-left

## Motion

- `--transition-fast: 100ms ease` — everything. Tech UIs should feel instant.
- Minimal animation. No bounces, no spring physics.

## Do

- Smaller base font (14px). Dense but legible.
- Monospace for any data: timestamps, IDs, metrics, code.
- Dark mode as the PRIMARY mode (light is the override).
- Subtle borders over shadows. 1px borders everywhere.
- Tabular data in actual tables, not cards.

## Don't

- Large hero sections with marketing copy.
- Rounded card corners > 8px (keep it sharp).
- Colorful illustrations or decorative elements.
- More than 2 status colors visible at once per panel.

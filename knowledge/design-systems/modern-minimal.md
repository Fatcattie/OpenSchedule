---
id: modern-minimal
title: Modern Minimal
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [borders, color, component, design-systems, minimal, modern, palette, patterns]
register: [product]
icon-library: Lucide
icon-stroke: 1.5
quality_score: 70
last_updated: 2026-07-14
---
# Modern Minimal

> Precise, geometric, whitespace-first.

## When to use

**Register: product.** SaaS products, developer tools, dashboards, productivity apps. Products where information density matters but visual noise must stay low. Read `01-register.md` first: the product register's rules apply here, and every brand-only rule (display type, page-load choreography, background depth) is OFF.

## Color palette

Every surface role ships a paired `on-` foreground; every declared pair clears WCAG AA (4.5:1 body). Colors are OKLCH — perceptually uniform, so `L` is the only knob you need to turn to derive a hover/muted variant.

```css
:root {
  /* Surfaces + their paired foregrounds */
  --color-bg: oklch(98.5% 0 0); --color-on-bg: oklch(21.0% 0.006 285.9);
  --color-surface: oklch(100% 0 0); --color-on-surface: oklch(21.0% 0.006 285.9);
  --color-card: oklch(100% 0 0); --color-on-card: oklch(37.0% 0.012 285.8);
  --color-muted: oklch(96.7% 0 0); --color-on-muted: oklch(44.2% 0.015 285.8);

  /* Brand + one restrained accent (never AI-purple) */
  --color-primary: oklch(48.8% 0.217 264.4); --color-on-primary: oklch(100% 0 0);
  --color-primary-hover: oklch(43.8% 0.200 264.4);
  --color-accent: oklch(51.1% 0.086 186.4); --color-on-accent: oklch(100% 0 0);

  /* Status */
  --color-success: oklch(52.7% 0.137 150.1); --color-on-success: oklch(100% 0 0);
  --color-warning: oklch(55.5% 0.146 49.0); --color-on-warning: oklch(100% 0 0);
  --color-error: oklch(53.5% 0.203 27.6); --color-on-error: oklch(100% 0 0);

  /* Border */
  --color-border: oklch(92.0% 0.004 286.3);
  --color-border-hover: oklch(87.0% 0.006 286.3);
  --color-border-focus: oklch(48.8% 0.217 264.4);

  /* Type scale — product register: fixed ratio ~1.2 */
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem; --text-lg: 1.125rem;
  --text-xl: 1.375rem; --text-2xl: 1.625rem; --text-3xl: 2rem;

  /* Spacing — 4pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px;

  /* Radius */
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-full: 9999px;

  /* Motion */
  --duration-fast: 120ms; --duration-normal: 180ms;
  --ease-standard: cubic-bezier(0.2, 0, 0.2, 1);

  /* Shadow */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: oklch(14.1% 0.004 285.8);       /* #09090b */
    --color-on-bg: oklch(98.5% 0 0);
    --color-surface: oklch(21.0% 0.006 285.9); --color-on-surface: oklch(98.5% 0 0);
    --color-card: oklch(27.4% 0.005 286.0); --color-on-card: oklch(92.0% 0.004 286.3);
    --color-muted: oklch(21.0% 0.006 285.9); --color-on-muted: oklch(71.2% 0.013 286.1);
    --color-primary: oklch(71.4% 0.143 254.6); --color-on-primary: oklch(18.3% 0.031 263.4);
    --color-accent: oklch(78.5% 0.133 181.9); --color-on-accent: oklch(22.5% 0.036 182.4);
    --color-success: oklch(80.0% 0.182 151.7); --color-on-success: oklch(26.6% 0.063 152.9);
    --color-warning: oklch(83.7% 0.164 84.4); --color-on-warning: oklch(23.5% 0.047 73.4);
    --color-error: oklch(71.1% 0.166 22.2); --color-on-error: oklch(19.9% 0.061 24.7);
    --color-border: oklch(27.4% 0.005 286.0);
    --color-border-hover: oklch(37.0% 0.012 285.8);
  }
}
```

## Typography

Product register: a familiar neutral UI face is CORRECT here — the user is reading data, not admiring the letterforms. Do not import a display face for a dashboard.

- **UI / Body**: `Inter, ui-sans-serif, system-ui, sans-serif`, weight 400
- **Headings**: same family, weight 600 (hierarchy comes from weight + color, not a second face)
- **Code / numerics**: `JetBrains Mono, ui-monospace, monospace`, weight 400 — tabular figures for any column of numbers

Fixed scale, adjacent step ratio ~1.2 (never a 3x display jump — that is the brand register):

| Level | Token | Size | Weight | Line-height | Tracking | Use |
|---|---|---|---|---|---|---|
| h1 | `--text-3xl` | 32px | 600 | 1.25 | -0.02em | Page title |
| h2 | `--text-2xl` | 26px | 600 | 1.3 | -0.015em | Section header |
| h3 | `--text-xl` | 22px | 600 | 1.35 | -0.01em | Card title |
| body | `--text-base` | 16px | 400 | 1.5 | 0 | Default text |
| body-sm | `--text-sm` | 14px | 400 | 1.5 | 0 | Table cells, secondary |
| caption | `--text-xs` | 12px | 500 | 1.4 | 0.02em | Labels, badges |

## Component patterns

### Buttons
- Primary: `background: var(--color-primary); color: var(--color-on-primary)`; hover → `--color-primary-hover`; disabled opacity 0.5
- Secondary: transparent fill, `--color-border`, text `--color-primary`; hover fill `--color-muted`
- Ghost: no border; hover fill `--color-muted`
- Height: 32px (sm), 36px (md), 40px (lg) — product register: compact hit targets beat airy ones
- Padding: 12px horizontal (sm), 16px (md), 20px (lg)
- Font: `--text-sm` weight 500

### Cards
- `background: var(--color-card); color: var(--color-on-card); border: 1px solid var(--color-border); border-radius: var(--radius-lg)`
- Hover: `--shadow-md` + `--color-border-hover`
- Padding: 16px (compact), 20px (default) — never both a 1px hairline border AND a wide (≥16px blur) shadow; pick one elevation language

### Inputs
- Height: 36px
- `background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md)`
- Focus: `--color-border-focus` + a 2px focus ring at 2px offset
- Error: `--color-error` border + an `--color-on-error`-legible message

## Motion

Product register: motion CONFIRMS an action, it never announces the page. No mount/entrance animation, no staggered reveal, no scroll-triggered choreography — that is the brand register.

- `--duration-fast: 120ms` + `--ease-standard` — hover, focus, press
- `--duration-normal: 180ms` + `--ease-standard` — expand/collapse, popover, drawer
- Never animate `width` / `height` / `padding` / `margin` (they force layout) — animate `transform` and `opacity`.

## Do

- Let whitespace do the work between GROUPS (16–24px); keep rows dense (8–12px).
- One accent color, used at most 2x per screen.
- Subtle borders over heavy shadows.
- Monochrome icons from ONE library at ONE stroke weight (this pack: Lucide, stroke 1.5).

## Don't

- Purple/pink gradient hero backgrounds → commit to `--color-primary` as a solid.
- More than 2 font weights per page → carry hierarchy with size + color instead.
- Shadows heavier than `--shadow-md` on cards → let the border carry elevation.
- A mount/entrance animation on a dashboard route → motion only on interaction.

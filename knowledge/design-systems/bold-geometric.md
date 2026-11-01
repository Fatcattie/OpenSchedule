---
id: bold-geometric
title: Bold Geometric
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [bold, color, component, design-systems, geometric, layout, palette, patterns]
register: [brand]
icon-library: Tabler
icon-stroke: 2
quality_score: 70
last_updated: 2026-07-14
---
# Bold Geometric

> High contrast, oversized type, asymmetric layouts.

## When to use

Creative agencies, product launches, marketing landing pages, portfolios, brand showcase sites. Products where visual impact matters more than utility density.

## Color palette

```css
:root {
  /* Surfaces + paired foregrounds — every pair clears WCAG AA */
  --color-bg: oklch(14.5% 0.002 286.1);          /* off-black, never pure #000 */
  --color-on-bg: oklch(100% 0 0);
  --color-surface: oklch(19.2% 0.004 286.0);
  --color-on-surface: oklch(100% 0 0);
  --color-card: oklch(22.8% 0.006 285.9);
  --color-on-card: oklch(91.4% 0.004 286.3);
  --color-muted: oklch(17.9% 0.004 286.0);
  --color-on-muted: oklch(68.8% 0.009 286.2);

  /* One dominant + one sharp accent (brand register: commit) */
  --color-primary: oklch(70.5% 0.193 39.2);      /* signal orange */
  --color-on-primary: oklch(19.2% 0.048 45.8);
  --color-primary-hover: oklch(76.0% 0.170 39.2);
  --color-accent: oklch(77.5% 0.151 171.7);      /* electric teal */
  --color-on-accent: oklch(23.8% 0.041 176.1);

  --color-success: oklch(77.5% 0.151 171.7);
  --color-on-success: oklch(23.8% 0.041 176.1);
  --color-warning: oklch(82.7% 0.171 80.5);
  --color-on-warning: oklch(24.4% 0.050 85.4);
  --color-error: oklch(69.1% 0.199 23.9);
  --color-on-error: oklch(19.7% 0.063 25.1);

  --color-border: oklch(24.0% 0.005 286.0);
  --color-border-hover: oklch(37.0% 0.006 286.1);
  --color-border-focus: oklch(70.5% 0.193 39.2);

  /* Type scale — brand register: dramatic jumps carry the hierarchy */
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.25rem; --text-xl: 1.75rem; --text-2xl: 2.5rem;
  --text-3xl: 3.75rem; --text-display: 6rem;

  /* Spacing — 4pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
  --space-24: 96px;

  --radius-sm: 0px; --radius-md: 2px; --radius-lg: 4px; --radius-full: 9999px;

  --duration-fast: 150ms;
  --duration-normal: 260ms;
  --duration-reveal: 700ms;
  --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);

  --shadow-glow: 0 0 40px oklch(70.5% 0.193 39.2 / 0.15);
}

@media (prefers-color-scheme: light) {
  :root {
    --color-bg: oklch(97.6% 0.003 106.4); --color-on-bg: oklch(14.5% 0.002 286.1);
    --color-surface: oklch(100% 0 0); --color-on-surface: oklch(14.5% 0.002 286.1);
    --color-card: oklch(100% 0 0); --color-on-card: oklch(35.0% 0.005 286.1);
    --color-muted: oklch(94.9% 0.003 106.5); --color-on-muted: oklch(42.2% 0.007 286.1);
    --color-primary: oklch(55.3% 0.174 38.4); --color-on-primary: oklch(100% 0 0);
    --color-accent: oklch(47.2% 0.088 174.6); --color-on-accent: oklch(100% 0 0);
    --color-success: oklch(47.2% 0.088 174.6); --color-on-success: oklch(100% 0 0);
    --color-warning: oklch(50.8% 0.108 73.3); --color-on-warning: oklch(100% 0 0);
    --color-error: oklch(52.6% 0.190 26.8); --color-on-error: oklch(100% 0 0);
    --color-border: oklch(88.0% 0.003 106.4);
    --shadow-glow: none;
  }
}
```

## Typography

- **Display / Headlines**: `"Clash Display", "Space Grotesk", system-ui, sans-serif`, weight 700
- **Body**: `"Space Grotesk", "DM Sans", system-ui, sans-serif`, weight 400

| Level | Size | Weight | Line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| display | 5rem (80px) | 700 | 0.95 | -0.04em | Hero headline (one line) |
| h1 | 3rem (48px) | 700 | 1.05 | -0.03em | Section headline |
| h2 | 2rem (32px) | 600 | 1.15 | -0.02em | Subsection |
| h3 | 1.25rem (20px) | 600 | 1.3 | -0.01em | Card title |
| body-lg | 1.25rem (20px) | 400 | 1.6 | 0 | Lead paragraph |
| body | 1rem (16px) | 400 | 1.6 | 0 | Default text |
| overline | 0.75rem (12px) | 700 | 1.2 | 0.15em | Section label, ALL CAPS |

## Layout

- Asymmetric grids (60/40 or 70/30 splits, not 50/50)
- Full-bleed sections alternating with constrained content
- Max content width: 1200px, but hero/feature sections go edge-to-edge
- Stagger elements vertically for visual tension

## Component patterns

### Hero
- Oversized headline (80px+), short subtitle, single CTA
- Dark bg with subtle gradient or texture (NOT purple/pink)
- CTA: pill button with glow shadow on hover

### Feature section
- Large visual (mockup/screenshot) on one side, text on the other
- Asymmetric split. Text side has overline label + h1 + body paragraph
- Alternate left/right for rhythm

### Stats / social proof
- Large numbers (48px+ mono or display font)
- Minimal labels below (caption weight)
- 3-column grid, generous gap

## Motion

- `--transition-fast: 200ms cubic-bezier(0.16, 1, 0.3, 1)` — hover
- `--transition-reveal: 600ms cubic-bezier(0.16, 1, 0.3, 1)` — scroll-triggered entrance
- Scroll-triggered fade-up for sections (offset: 40px, staggered 100ms)

## Do

- One BOLD move per section (oversized type OR dramatic image OR striking color — pick one).
- Negative space as a power tool. Let elements breathe.
- Dark mode as primary. Light as secondary.
- Monochrome palette + ONE accent color (max 2 accent appearances per screen).
- Overline labels in ALL CAPS with wide letter-spacing.

## Don't

- Multiple competing focal points in one viewport.
- Gradient backgrounds (use solid darks or subtle textures).
- Small, timid typography. If you're not going big, use Modern Minimal instead.
- Centered text blocks wider than 600px (they become hard to read).
- More than 3 type sizes visible at once per viewport.

---
id: soft-warm
title: Soft Warm
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [borders, color, component, design-systems, palette, patterns, radius, soft]
register: [brand, product]
icon-library: Lucide
icon-stroke: 1.75
quality_score: 70
last_updated: 2026-07-14
---
# Soft Warm

> Rounded, approachable, warm tones.

## When to use

Consumer apps, education, wellness, onboarding flows, community products. Products where friendliness and accessibility matter more than information density.

## Color palette

```css
:root {
  /* Surfaces + paired foregrounds */
  --color-bg: oklch(99.0% 0.009 78.3);
  --color-on-bg: oklch(32.9% 0.011 91.7);
  --color-surface: oklch(100% 0 0);
  --color-on-surface: oklch(32.9% 0.011 91.7);
  --color-card: oklch(100% 0 0);
  --color-on-card: oklch(44.6% 0.013 89.8);
  --color-muted: oklch(97.2% 0.011 76.6);
  --color-on-muted: oklch(47.5% 0.012 87.5);

  --color-primary: oklch(56.2% 0.180 25.1);      /* warm coral-red */
  --color-on-primary: oklch(100% 0 0);
  --color-primary-hover: oklch(50.5% 0.170 25.1);
  --color-accent: oklch(51.6% 0.103 238.7);      /* calm blue */
  --color-on-accent: oklch(100% 0 0);

  --color-success: oklch(51.9% 0.105 154.7);
  --color-on-success: oklch(100% 0 0);
  --color-warning: oklch(52.9% 0.104 80.9);
  --color-on-warning: oklch(100% 0 0);
  --color-error: oklch(56.2% 0.180 25.1);
  --color-on-error: oklch(100% 0 0);

  --color-border: oklch(92.5% 0.008 84.6);
  --color-border-hover: oklch(88.5% 0.010 84.6);
  --color-border-focus: oklch(56.2% 0.180 25.1);

  /* Type scale — approachable but disciplined (ratio ~1.22) */
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.125rem; --text-xl: 1.375rem; --text-2xl: 1.75rem;
  --text-3xl: 2.25rem; --text-display: 3rem;

  /* Spacing — 4pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
  --space-24: 96px;

  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-full: 9999px;

  --duration-fast: 150ms;
  --duration-normal: 220ms;
  --ease-standard: cubic-bezier(0.2, 0, 0.2, 1);

  --shadow-sm: 0 1px 4px rgb(55 53 47 / 0.06);
  --shadow-md: 0 4px 16px rgb(55 53 47 / 0.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: oklch(20.9% 0.004 84.6); --color-on-bg: oklch(96.2% 0.009 84.6);
    --color-surface: oklch(25.2% 0.004 84.6); --color-on-surface: oklch(96.2% 0.009 84.6);
    --color-card: oklch(28.9% 0.006 91.6); --color-on-card: oklch(88.6% 0.012 84.6);
    --color-muted: oklch(23.5% 0.004 84.6); --color-on-muted: oklch(72.0% 0.014 82.4);
    --color-primary: oklch(72.7% 0.140 21.1); --color-on-primary: oklch(20.9% 0.059 23.8);
    --color-accent: oklch(77.7% 0.090 235.4); --color-on-accent: oklch(23.1% 0.041 235.8);
    --color-success: oklch(76.2% 0.125 154.0); --color-on-success: oklch(25.2% 0.059 153.0);
    --color-warning: oklch(81.2% 0.117 84.1); --color-on-warning: oklch(24.5% 0.047 83.7);
    --color-error: oklch(72.7% 0.140 21.1); --color-on-error: oklch(20.9% 0.059 23.8);
    --color-border: oklch(32.0% 0.005 84.6);
  }
}
```

## Typography

- **Headings**: `"DM Sans", "Nunito", system-ui, sans-serif`, weight 700
- **Body**: `"DM Sans", "Nunito", system-ui, sans-serif`, weight 400

| Level | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| h1 | 2rem (32px) | 700 | 1.25 | Page title |
| h2 | 1.5rem (24px) | 700 | 1.3 | Section header |
| h3 | 1.125rem (18px) | 600 | 1.4 | Card title |
| body | 1rem (16px) | 400 | 1.6 | Default text |
| body-sm | 0.875rem (14px) | 400 | 1.5 | Secondary text |
| caption | 0.75rem (12px) | 600 | 1.4 | Labels |

## Component patterns

### Card
- `bg-surface radius-lg shadow-sm`, 24px padding
- Hover: translate-y -2px + shadow-md (gentle lift)
- Colorful left accent stripe (4px, rounded) optional

### Button
- Primary: `bg-primary text-white radius-full`, 44px height
- Hover: scale 1.02 + darken 5%
- Pill-shaped for primary CTAs

### Avatar
- Circular, border 2px white, pastel background for initials
- Size: 32px (sm), 40px (md), 56px (lg)

### Toast/notification
- Rounded, gentle shadow, slide-in from bottom
- Icon + text, dismiss on swipe

## Motion

- `--transition-fast: 180ms cubic-bezier(0.2, 0, 0, 1)` — hover
- `--transition-normal: 300ms cubic-bezier(0.2, 0, 0, 1)` — expand
- `--transition-bounce: 500ms cubic-bezier(0.34, 1.56, 0.64, 1)` — celebratory moments

## Do

- Rounded everything. 12px+ radius gives warmth.
- Pastel accent colors for backgrounds (muted tints of primary/accent).
- Playful micro-interactions (button press scale, check animation).
- Friendly copy ("You're all set!" not "Operation successful").
- Illustration style over photography when possible.

## Don't

- Sharp corners on interactive elements.
- Dense data tables (use cards or lists instead).
- Dark, moody color schemes.
- Corporate / formal tone in UI copy.
- Monospace fonts anywhere in the UI.

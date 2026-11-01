---
id: 00-craft-rules
title: Craft Rules — Universal Visual Quality Standards
domain: design-systems
category: design-systems
difficulty: intermediate
tags: [auto-checked, cardinal, catch, craft, design-systems, governance, reviewer, rules, register]
quality_score: 74
last_updated: 2026-07-14
---
# Craft Rules — Universal Visual Quality Standards

> **Read `01-register.md` first.** Rules below are tagged with the register they
> apply to. A rule tagged `[brand]` applied to a dashboard makes the product WORSE;
> a rule tagged `[product]` applied to a landing page makes it forgettable.
> Untagged = `[both]` — always on.
> P0 = hard blocker (must fix before the preview gate).
> P1 = should fix (quality suffers noticeably).
> P2 = polish.

## Trigger

Read before writing any UI code, authoring `design-tokens.{json,css}`, or reviewing a UI diff.

## P0 — Cardinal Sins (auto-checked by governance)

1. **One icon library, one stroke weight.** Declare it in the UIUX doc (e.g. Lucide @ 1.5).
   Never mix two libraries in one UI, never use emoji as a functional icon, never
   hand-roll a decorative SVG. *Which* library is a per-pack / per-product choice —
   there is no global default, because a single mandated library is itself a sameness driver.
2. **No hardcoded colors.** Every `color` / `background` / `border-color` / `box-shadow`
   comes from a token. Surface tokens ship a paired `on-` foreground.
3. **No AI-purple as primary or accent** (OKLCH hue 270–320 at chroma ≥ 0.09), unless
   the requirement text explicitly asks for purple. → Commit to a hue the product owns.
4. **No Lorem ipsum.** → Write the real, representative content.
5. **No "Welcome to [App]" hero heading.** → Write the specific value proposition.
6. **No invented metrics** ("10x faster", "99.9% uptime") without a source. → Cite a real
   number or drop the claim.
7. **Contrast is measured, not eyeballed.** Every declared (surface, on-surface) pair:
   ≥ 4.5:1 body, ≥ 3:1 large/UI. A failing pair is a defect, not a taste question.

## P1 — Soft Tells (reviewer should catch)

1. `[brand]` **Template skeleton without variation.** *Tell:* every section is the same
   card-grid. → Alternate layouts, vary section heights, add ≥1 unconventional section.
2. **Accent overuse.** *Tell:* >2 accent-colored elements visible in one viewport.
   → Cap at 2; the accent's power is its scarcity.
3. **Placeholder CDN images.** *Tell:* `placehold.co` / `unsplash.com/random` in source.
   → Mark `<!-- TODO: replace -->` or ship the real asset.
4. **Raw hex outside `:root`.** *Tell:* ≥ 3 unique hex literals in components.
   → Move them into tokens.
5. **Type drift from the locked system.** *Tell:* a font-family in code that the UIUX doc
   never declared. → Use only the locked families.
6. **Identical card content.** *Tell:* 3+ cards with the same placeholder text.
   → Vary the content; it is the fastest AI tell to spot.
7. **Missing component states.** *Tell:* a button with no `:focus-visible`, an input with
   no error state, an async list with no loading/empty state. → Every interactive element
   ships hover + focus-visible + active + disabled; every async surface ships
   loading + empty + error.
8. `[product]` **Marketing type in an app.** *Tell:* ≥3 font sizes on an app route whose
   max/min ratio ≥ 2.0. → Fixed rem scale at ratio 1.125–1.2; carry hierarchy with weight
   and color.
9. `[product]` **Page-load choreography in an app.** *Tell:* mount/entrance animation or
   staggered reveal on a dashboard route. → Motion only confirms a user action (≤150ms).

## P2 — Polish

1. **Dark mode.** If the UIUX doc defines dark tokens, wire `prefers-color-scheme`
   (and redefine every `on-` pair, not only the surfaces).
2. **Loading states.** Skeletons for async content, not blank space.
3. **Empty states.** "No items yet" + the next action, not a blank table.
4. **Micro-interactions.** Press feedback, hover lift, toggle transition.
5. `[brand]` **Entrance reveal.** ONE orchestrated page-load reveal — subtle fade-up, never
   bouncy/spring. `[product]`: none.
6. **Focus ring.** 2px solid primary, 2px offset, visible on keyboard navigation.

## Typography Craft

- **Letter-spacing:** ALL CAPS ≥ 0.06em · display (≥32px) −0.01 to −0.02em · body 0 ·
  caption 0.02–0.03em. Never below −0.04em (crushed).
- **Weights:** at most 3 per page. `[product]` 400/500/600. `[brand]` extremes are a tool.
- **Type scale:** `[product]` fixed rem scale, adjacent step ratio 1.125–1.2.
  `[brand]` a dramatic display:body jump (≥2.5x) is the point.
- **Line length:** 50–75 characters for body — enforce with `max-width`.
- **Line-height:** ≥ 1.4 for body (never below 1.3 — cramped). Never ship text under 12px.
- **Max typefaces:** 2 (headings + body); a third mono is allowed for code/data.
  `[product]` a single familiar neutral face for BOTH is correct, not lazy.

## Color Craft

- **Distribution:** neutrals 70–90%, accent 5–10%, semantic 0–5%.
- **Contrast minimums:** 4.5:1 body (WCAG AA), 3:1 large (≥24px, or bold ≥18.5px) and UI.
- **One decisive accent.** If both `--color-primary` and `--color-accent` exist, only one is
  visible per viewport.
- `[product]` **Restraint is the FLOOR.** Color is a semantic signal (status, selection,
  danger), not decoration. `[brand]` a committed palette is the point.

## Layout Craft

- `[brand]` **Rhythm alternation.** *Tell:* 3 stacked identical-layout sections.
  → Alternate full-width ↔ constrained, image-left ↔ image-right, light ↔ dark.
- **Vertical spacing progression.** `[brand]` sections 80–120px, groups 32–48px, items 16–24px.
  `[product]` groups 16–24px, rows 8–12px — density is a feature.
- `[brand]` **One bold move per section.** Oversized type OR dramatic image OR striking color.
  Three competing flourishes = noise.
- **Elevation language:** pick ONE. *Tell:* a 1px hairline border AND a ≥16px-blur shadow on
  the same element. → Border-led or shadow-led, never both.
- **Radius:** `[product]` 4–12px on cards/inputs. *Tell:* radius ≥ 24px on product chrome
  reads as a toy. `[brand]` free, as long as it is consistent.

## Completion criteria

- [ ] Register declared, and every `[brand]`-tagged rule skipped if the register is `product` (and vice versa).
- [ ] Icon library + stroke weight named once; grep the source: zero emoji, zero second library.
- [ ] Zero raw hex/font-family/radius/font-size literals outside the token file.
- [ ] Every (surface, on-surface) pair measured against WCAG and passing.
- [ ] Every interactive element has 4 states; every async surface has 3.

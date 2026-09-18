# Sword Art Online — P4G-Inspired Design System

Status: active design contract  
Applies to: all product UI, motion, and brand extensions in this workspace  
Implementation sources: `app/design-tokens.css`, `app/brand.css`, `app/components/BrandLockup.tsx`, and `app/globals.css`
Evidence source: `docs/moodboard/p4g/`

## 1. Design position

This product borrows the *design logic* of Persona 4 Golden without copying its logo, characters, illustrations, or proprietary interface assets. The target is an original “daily operations broadcast” identity: a bright local-TV signal, a teenage magazine collage, and a tactical task HUD sharing one screen.

The hierarchy is:

1. Usable task planner.
2. High-energy broadcast personality.
3. Decorative texture and spectacle.

If a decorative choice slows scanning, hides state, reduces contrast, or makes a control feel unreliable, usability wins.

## 2. Research synthesis

The following are design observations inferred from official Atlus and Sega promotional pages, logos, key art, and gameplay screenshots—not claims of an official Atlus style specification.

- **Yellow is the world, not merely an accent.** It creates immediate franchise-level recognition and lets black/white UI blocks read like cut paper or broadcast captions.
- **Black and white establish structure.** Thick outlines, hard shadows, and solid black rails make the bright palette controllable instead of childish.
- **Secondary colors behave like TV color bars outside the wordmark.** Orange, green, red, blue, and violet belong to background bands, illustration, category semantics, or a tiny signal detail. The title face itself stays overwhelmingly black, white, and yellow.
- **The composition feels assembled live.** Rotations, offsets, irregular crops, sticker-like badges, silhouettes, circles, dots, and diagonal bands create momentum.
- **The logo is not assembled from independent pieces.** Across the supplied references, primary and secondary title lines share one typographic family, one visual center, one slant, and one coherent outlined silhouette.
- **Depth is structural.** The letter face, ink outline, rear extrusion, and yellow keyline repeat along a single displacement vector; perspective belongs to the complete wordmark plane.
- **Television is both story motif and UI metaphor.** Screens, scanlines, signal noise, frames, channel labels, and sudden transitions support the Midnight Channel premise described by Sega.
- **Everyday life and supernatural investigation coexist.** Calendars, school-life choices, character relationships, and combat share equal importance in the official product presentation. For this planner, that maps naturally to friendly daily scheduling wrapped in a mission-oriented HUD.

Primary visual references:

- [Persona 4 Golden — official Atlus site](https://persona.atlus.com/p4g/sp/index.html?lang=en)
- [Persona 4 Golden — official Japanese P4G site](https://p-atlus.jp/p4g/v/)
- [Persona 4 Golden — Sega product page and gameplay screenshots](https://www.sega.jp/game/detail/remaster-p4g/)
- [Persona 4 Golden Remaster — official Japanese site](https://p-ch.jp/remaster/p4g/)

Workspace evidence:

- `docs/moodboard/p4g/README.md` documents the eight user-provided references and the specific constraint each one supports.

## 3. Core principles

### Signal first

One primary message must dominate each viewport: the current page, the current mission state, or the requested action. Use the yellow/black contrast for that message; keep secondary information quieter.

### Controlled collision

Overlap and angular offsets are welcome in brand marks, banners, navigation, and feedback. Form controls, paragraphs, tables, and dense task content must remain aligned to predictable grids.

### Bold, then precise

Large labels may be loud and compressed. Supporting copy, dates, and Chinese text must be calm and highly legible. Express personality in the container before distorting the content.

### Broadcast, not broken

TV noise and glitch effects should imply a signal transition. They must never make the product appear frozen, corrupt, or unsafe.

## 4. Visual tokens

The source of truth is `app/design-tokens.css`. Components should consume semantic variables rather than repeat hex values.

### Color roles

| Token | Value | Role |
| --- | --- | --- |
| `--color-signal` | `#f7e21b` | Primary world color, active state, focus and celebratory signal |
| `--color-signal-hot` | `#ffef54` | Hover and bright highlight |
| `--color-signal-deep` | `#d9bd00` | Yellow shadow or subdued yellow edge |
| `--color-ink` | `#11120f` | Text, structural blocks, outlines, hard shadows |
| `--color-paper` | `#fffdf2` | Warm reading surface; preferred over cold white |
| `--color-orange` | `#ef8c22` | Urgency, broadcast stripe, energetic secondary accent |
| `--color-green` | `#58a849` | Success, life/schedule cues, balancing accent |
| `--color-red` | `#ec4337` | Destructive or critical state only |
| `--color-blue` | `#2f7ce0` | Informational category or cool contrast |
| `--color-violet` | `#7d4bd6` | Personal/reflective category |

Rules:

- Let yellow occupy 45–70% of the broad background field in day mode.
- Let ink and paper carry most component surfaces and text.
- Limit a component to one supporting accent unless it is explicitly a broadcast/color-bar motif.
- Never use red as generic decoration near destructive controls.
- Maintain WCAG AA contrast for normal text. Yellow text should normally sit on ink; ink text may sit on yellow.

### Typography

- **CJK foundation:** `--font-cjk`; keep one ordered Simplified Chinese fallback chain across the product so the same glyph does not change style between pages or components.
- **Logo:** `--font-logo`; one high-contrast, heavy serif family across every title line. Perspective and italic energy come from the shared wordmark plane, not from mixing unrelated typefaces.
- **Display:** `--font-display`; very heavy and slightly condensed. Use for page banners, results, and large counts outside the logo.
- **Interface:** `--font-ui`; condensed, high-weight, tabular where useful. Use for buttons, status, chips, dates, and metadata.
- **Body:** `--font-body`; normal proportions. Use for task descriptions, instructions, and longer Chinese copy.
- Uppercase English labels may use `.08em–.16em` tracking. Do not apply wide tracking to Chinese body text.
- Archive descriptions always use `--font-body` with normal letter spacing and a relaxed line height; headers, status blocks, and compact metadata use `--font-ui`.
- Never mix serif and sans-serif faces inside the primary wordmark. Small operational metadata may use `--font-ui`, but it must remain subordinate.

### Browser identity icon

- The canonical bookmark/favicon artwork is `app/icon.png`, with cache-busted browser assets at `public/sao-tv-icon-v4-192.png` and `public/sao-tv-icon-v4-512.png`: a full-bleed yellow field carrying one black retro CRT television silhouette with a generous outer safe area. The web app manifest marks both assets as maskable so installed-app chrome does not add a white framing tile.
- Preserve the TV body, antennas, controls, and screen as one readable mark with generous outer safe space. It must remain identifiable at 16 × 16 pixels.
- The icon is separate from the in-page wordmark and must not contain title text, characters, rainbow stripes, or official Persona assets.

### Line, cut, and shadow

- Standard control border: `--line-medium`.
- Hero/badge border: `--line-heavy`.
- Standard hard shadow: `--shadow-pop`; prominent feedback: `--shadow-loud`.
- Prefer polygon cut tokens (`--cut-soft`, `--cut-loud`) and small rotations over rounded “SaaS card” corners.
- Apply rotation to an outer wrapper. Counter-rotate long text when necessary so reading remains level.
- A logo requires real layered depth: face → ink stroke → ink extrusion → yellow rear keyline. A single flat shadow is insufficient.

### Texture recipes

Use texture on large empty surfaces or decorative pseudo-elements—not behind dense body copy.

**Houndstooth/check signal:** two offset 45-degree gradients at a 12–18px tile size, usually at 8–18% opacity.

**Halftone:** `radial-gradient(circle, currentColor 0 2px, transparent 2.5px)` at 10–18px spacing.

**CRT scanline:** a repeating horizontal gradient with one translucent line every 4–6px. Maximum opacity is 10% on light surfaces and 14% on dark surfaces.

**Signal noise:** fine, non-animated noise at low opacity. Avoid rapid random movement; it harms readability and may trigger vestibular discomfort.

## 5. Layout and composition

### Page frame

- Keep the task surface above decorative effects with a clear z-index layer.
- Use a stable grid for board columns, table data, forms, and calendars.
- Reserve the highest visual energy for the top identity area, active navigation, and momentary feedback.
- A diagonal edge may break the grid visually, but the underlying hit area must remain rectangular and at least 44×44px on touch layouts.

### Angular cutouts

- Soft cut: 2–4% corner displacement for cards and filters.
- Loud cut: 6–10% displacement for banners, brand blocks, results, and major navigation.
- Do not stack clip paths on interactive children; clip the wrapper so focus rings and hit targets remain reliable.

### Responsive behavior

- Desktop may use overlap, side-by-side badges, and 1–3° rotation.
- Narrow screens should preserve the identity by scaling a single lockup unit, not reflowing each decorative piece independently.
- Dense horizontal content such as archive tables may scroll; primary actions and dialogs must not require horizontal scrolling.
- Decorative patterns should simplify or reduce opacity below 760px.

## 6. Logo geometry harness

The wordmark is governed by hard constraints rather than mood alone:

1. **One plane:** all title lines are descendants of `.brand-plane` and receive `--logo-plane` once.
2. **One vanishing direction:** the complete mark uses a shared perspective/rotation/skew transform. Individual words do not rotate independently.
3. **One extrusion vector:** `--logo-depth-x` and `--logo-depth-y` define the displacement for every title line.
4. **One face system:** every title uses `.logo-face`, `--font-logo`, paper fill, ink stroke, ink extrusion, and a yellow rear keyline.
5. **Limited palette:** the logo may use only ink, paper, and signal yellow. Supporting spectrum colors are forbidden in `app/brand.css`.
6. **Unified silhouette:** title lines overlap and lock together. They must not appear as detached cards, labels, or independently colored tiles.
7. **Responsive integrity:** mobile scales the complete lockup as a unit; it never reflows or restacks individual title fragments.

`npm run design:check` verifies the reference set, markup structure, shared perspective/depth tokens, palette restriction, and removal of fragmented legacy classes. The check is intentionally part of `npm run lint`.

## 7. Component language

### Brand lockup

The current lockup is defined by `app/components/BrandLockup.tsx` and `app/brand.css`.

- `SWORD ART` is one primary face rather than two independently styled tiles.
- `ONLINE` uses the same face, outline, depth direction, and spatial plane at a smaller hierarchy.
- The full mark leans upward in one perspective system and extrudes down-right along one vector.
- Paper letter faces, ink outlines/extrusion, and a signal-yellow rear keyline form the complete depth stack.
- `04` and operational metadata are subordinate registration details, not competing logo fragments.
- Keep the accessible name on the `h1`; decorative fragments remain hidden from assistive technology.

Do not place the lockup on a busy photograph, recolor individual letters arbitrarily, remove its hard outlines, or reproduce the official P4G logo geometry.

### Page banner

- One oversized index badge, one English title, one short Chinese subtitle.
- Black structure with a yellow active edge.
- Titles may be skewed; subtitles stay level.

### Mission card

- White/paper reading surface with an ink border.
- One category stripe and a compact priority badge.
- High priority may increase border/shadow energy; it must not rely on color alone.
- Keep title and status scan order consistent across board and archive views.
- Do not recolor the complete card surface by workflow status. Pending, In Progress, and Completed retain the same paper/ink/category-color construction; motion, labels, timestamps, and a completed strike-through carry state.
- Daily-board mission cards use one fixed standard height with reserved two-line title and description slots. A scheduled-start countdown is an absolutely positioned compact instrument overlay in the description zone: it is removed from layout flow and must never increase card height. Each board column shows five cards by default; additional cards remain behind the explicit reveal control.
- Completed cards remain draggable across workflow columns so an accidental completion can be corrected. Completion changes the card's state treatment, never its ability to move.

### Badge and chip

- Use solid blocks, hard borders, and short copy.
- Recommended order: icon/mark → label → value.
- Status, priority, and type need distinct shapes or labels in addition to color.

### Menu and selection window

- Active choices may translate 6–12px and gain a yellow slab or ink shadow.
- Menu rows should feel like broadcast lower-thirds: wide, flat, angled, and quickly readable.
- Selection dialogs may be theatrical at entry, but option grids remain regular and keyboard navigable.
- Archive filters use the shared custom selection menu instead of native browser dropdown chrome. Their trigger and option layer follow the ink/paper/yellow structure, angular cut, hard shadow, visible focus, outside-click close, and `Escape` close behavior.
- Status remains structurally neutral. Type and priority colors may appear only as narrow option rails or compact signals; they must not recolor the complete filter surface.
- The filter trigger's yellow separator sits clearly left of the chevron rather than touching its glyph or the clipped outer edge.
- Archive-table scrollbars are deliberate controls: square ink tracks, a high-contrast yellow drag thumb, hard borders, and distinct hover/active feedback. Avoid rounded operating-system-neutral styling on this surface.

### Daily flow window

- On desktop, the daily-flow axis is explicitly date-relative: selected-day `00:00–02:00` appears at the top, selected-day `02:00–07:00` is a compressed OFF band, selected-day `07:00–24:00` is the main field, and next-day `00:00–02:00` is at the bottom. The adjacent agenda must scroll internally when its task list exceeds that height; list growth must never stretch the time map or create blank space beneath it.
- On narrow screens, the two modules may stack inside one fixed viewport-height window, while each module preserves a bounded working height.
- DAILY FLOW remains open underneath its task detail. Closing, cancelling, saving, or deleting that detail returns to the same day flow; navigating to any application tab clears the complete dialog stack.
- Time-distribution geometry is status-driven. Completed uses its real start-to-complete interval. In Progress grows from its real start to the current clock and melts directly out of the task block as one continuous, solid task-type-color mass. The attachment edge never moves, scales, changes color, or reveals a seam; animation is limited to the lower contour, where irregular wave troughs and connected near-drips propagate left to right. A separate ink silhouette sits behind the spill to expose a black comic outline only along its sides and underside. Never add gloss gradients, moving overlay sheets, yellow status fill, or any motion that can make the spill detach from the block. Pending with a planned start uses one fixed readable start marker and ignores deadline width; Pending without a start but with a deadline uses a separate deadline-warning marker.
- Concurrent windows automatically receive separate lanes. The compressed OFF band preserves selected-day midnight-to-morning tasks at the top. Within one DAILY FLOW window, each In Progress or Completed interval is one continuous block even when it crosses midnight; never split it at `00:00`. On the following selected date, the same cross-day interval resumes from the top with an explicit continuation treatment.
- Task-block labels are all-or-nothing. When available height or lane width cannot contain the complete time/title treatment, hide that treatment and retain an accessible label on the interactive block; never show vertically clipped half-text.
- Timeline rules and lane rules use the same date-relative coordinate system. Grid strokes must remain continuous across the compressed band boundary rather than producing a stitched or broken-line illusion.

### Form controls

- Inputs stay level, rectangular, and high contrast.
- Use yellow focus shadows plus a visible outline; never remove focus indication.
- Avoid decorative CRT distortion, scanlines, or clipped text inside editable fields.

### Feedback and HUD moments

- “Mission Start/Clear” feedback may temporarily take over the viewport.
- Keep takeover feedback under one second for routine actions.
- Toasts must use `role="status"` and should not block the next action.

## 8. Motion and micro-interactions

Use the durations and easing variables from `app/design-tokens.css`.

- Hover/press: 120–180ms, 2–4px translation, hard-shadow compression.
- Standard entry: 240–360ms, one overshoot at most.
- Page transition: 360–520ms, directional and consistent with navigation order.
- Glitch: one or two displaced frames, 80–160ms total. Reserve for route changes, errors, or major result feedback.
- Pop-in: scale from 0.85–0.95 with a small rotation; do not spring repeatedly.
- CRT flash: a single luminance sweep under 200ms. Never flicker continuously.
- The broad background uses one original black CRT television silhouette where the former circular turntable motif lived. A restrained spectrum strip may travel through or behind its screen as a signal accent; the TV itself remains black/ink.
- Refreshing the first navigation tab may play one short broadcast-ident intro with a readable progress bar. Refreshing another tab restores that tab without replaying the intro.
- The current tab is a session-scoped interface preference, not planner data; store it in `sessionStorage`, never in the SQLite task payload or the legacy `localStorage` migration keys.

Every animation must have a meaningful static end state. Respect `prefers-reduced-motion`; remove transforms and flashes rather than merely slowing them down.

## 9. Implementation architecture

### Current structure

- `app/design-tokens.css`: semantic visual primitives; edit here when changing the system.
- `app/components/BrandLockup.tsx`: accessible wordmark structure and the single shared brand plane.
- `app/brand.css`: brand geometry only; it intentionally loads after the large legacy stylesheet.
- `app/globals.css`: application shell, layouts, existing components, theme, and motion. It must not contain `.brand-*` or `.logo-*` selectors.
- `app/page.tsx`: current UI and state. New repeated visual patterns should become components rather than additional inline markup.
- `docs/moodboard/p4g/`: internal evidence set. Never import these copyrighted references into the running application.
- `scripts/check-design-harness.mjs`: static enforcement for the wordmark contract.

### Scaling path

When the next two or three shared components are added, introduce:

```text
app/
  components/
    SignalBadge.tsx
    AngularPanel.tsx
    MissionCard.tsx
  styles/
    components.css
```

Component APIs should expose meaning, not raw decoration. Prefer `tone="warning"`, `energy="loud"`, and `cut="soft"` over `yellow`, `rotate={-3}`, or arbitrary class strings.

Tailwind may continue to provide utility parsing, but the design contract remains CSS-variable-first. Do not duplicate the palette in a JavaScript config unless a library requires literal values; if it does, document how the values stay synchronized.

## 10. Accessibility and usability guardrails

- Minimum touch target: 44×44px.
- Maintain visible focus for every interactive element.
- Never communicate state by color alone.
- Keep CRT/noise layers `pointer-events:none` and `aria-hidden`.
- Do not animate large background fields indefinitely at high contrast.
- Test day and night themes independently; a token that works on yellow may fail on charcoal.
- Keep Chinese task text at a comfortable body size even when English labels are condensed.

## 11. Review checklist

Before merging a visual change, confirm:

- Is the main action or state identifiable in two seconds?
- Does yellow have a clear purpose rather than appearing everywhere equally?
- Are supporting accents limited and semantically stable?
- Are text and hit areas level even when their containers are angled?
- Does the component still work without texture and motion?
- Is focus visible, contrast sufficient, and state non-color-dependent?
- Does it work in both themes and at narrow/mobile width?
- Does the result feel like an original broadcast-planner identity rather than a copied Persona asset?
- Do all logo words share the exact same plane, family, outline, depth vector, and limited palette?
- Does the logo read as one three-dimensional silhouette rather than several decorated rectangles?

Then run `npm run design:check`, `npm run lint`, `npm run build`, and browser-check the affected desktop and mobile layouts.

## 12. Personal signal channel

`SIGNAL ROOM / 心愿放送室` extends the local broadcast identity with an ink masthead, a single yellow ON AIR station card, and level paper reading/editing surfaces. Goals and messages share the visual system but use separate editorial channels. Goal cards retain the configured task-type text; mood remains user-authored. The homepage `目标雷达` is a read-only reminder, with deadline proximity expressed as text rather than a fabricated progress percentage.

The all-page news ticker uses an ink/yellow warning stripe, a constant right-to-left crawl, quiet hide/restore controls, explicit pause, and pause on hover/focus. It stays outside page transitions and below menus/dialogs. A bottom content inset prevents controls from disappearing behind it. Reduced motion removes automatic scrolling; the full feed remains manually scrollable. New channel transitions follow existing navigation direction. Narrow screens stack the editor above its library, and night mode uses charcoal reading surfaces with warm paper text.

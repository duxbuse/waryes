# Stellar Siege — UI Style Guide

Reference mockup: `web/public/1.html`

This document defines the visual language for all Stellar Siege UI. Every screen, panel, and component must follow these rules to maintain a cohesive **grimdark Gothic + military sci-fi** aesthetic.

---

## 1. Design Philosophy

**"Imperial Excess meets Battle-Bridge Pragmatism"**

The UI is a clash of two worlds:
- **Gothic Horror**: Ornate gold flourishes, serif fonts, decorative symbols, cathedral-inspired framing
- **Military Sci-Fi**: Monospace readouts, scan lines, glitch corruption, holographic displays, targeting reticles

Every element should feel like it belongs on a warship bridge that was built inside a cathedral. Nothing is plain. Labels have flourishes. Borders have corners. Panels have watermarks. The aesthetic is **maximalist** — dripping with decorative detail.

---

## 2. Color Palette

All colors are defined as CSS custom properties on `:root`.

### Primary Palette

| Variable | Hex | Usage |
|----------|-----|-------|
| `--steel-dark` | `#1a1a20` | Deepest backgrounds, panel bases |
| `--steel-mid` | `#2a2a30` | Panel backgrounds, card bodies |
| `--steel-light` | `#3a3a42` | Elevated surfaces, button backgrounds |
| `--steel-highlight` | `#4a4a55` | Borders, dividers |
| `--steel-bright` | `#5a5a68` | Tertiary text, muted labels |

### Accent Colors

| Variable | Hex | Usage |
|----------|-----|-------|
| `--blue-primary` | `#00aaff` | Interactive elements, links, selected states |
| `--blue-glow` | `#00ccff` | Hover states, emphasis |
| `--blue-dim` | `#005588` | Inactive/background blue accents |
| `--amber` | `#ff8800` | Warnings, costs, resource values |
| `--amber-light` | `#ffaa00` | Amber hover states |
| `--amber-dim` | `#885500` | Amber backgrounds |
| `--red` | `#ff2200` | Danger, attack, enemy team |
| `--cyan` | `#00ffcc` | Stat values, holographic readouts |

### Gothic Gold (Flourishes & Decoration)

| Variable | Hex | Usage |
|----------|-----|-------|
| `--gold` | `#c4a44a` | Primary flourish color, labels, decorative text |
| `--gold-light` | `#d4b85a` | Gold hover states |
| `--gold-bright` | `#e8d080` | Intense gold highlights |
| `--gold-dim` | `#8a7030` | Subtle flourishes, background decoration |

### Warp Corruption

| Variable | Hex | Usage |
|----------|-----|-------|
| `--warp-purple` | `#8800ff` | Destructive/quit actions, corruption effects |
| `--warp-pink` | `#ff00aa` | Glitch ghost layer |
| `--warp-green` | `#00ff88` | Eldritch accents |

### Color Rules
- **Gold** is for decoration and labels — never for interactive primary actions
- **Blue** is for interactive elements and data readouts
- **Amber** is for warnings, costs, and resource values
- **Red** is only for danger, enemies, and attack actions
- **Backgrounds** always use the steel palette — never pure black or white
- **Text glows** use `text-shadow: 0 0 Npx rgba(color, 0.2-0.5)` to match their color

---

## 3. Typography

### Font Stack

| Variable | Font | Fallback | Usage |
|----------|------|----------|-------|
| `--font-heading` | `Cinzel` | `serif` | Panel headers, labels, card names, button text |
| `--font-body` | `Crimson Pro` | `serif` | Body text, descriptions, paragraphs |
| `--font-mono` | `Share Tech Mono` | `monospace` | Numbers, stat values, timestamps, readouts |

**Title font**: `Playfair Display SC` — used exclusively for the game title "STELLAR SIEGE". This ornate high-contrast small-caps serif creates a pompous, imperial decree feeling. Title color is `--gold`.

### Google Fonts Import
```
Cinzel:wght@400;700;900
Playfair Display SC:wght@400;700;900
Crimson Pro:wght@300;400;600;700
Share Tech Mono
```

### Typography Rules
- **All labels** use `--font-heading` with `text-transform: uppercase` and `letter-spacing: 2-4px`
- **All numbers/values** use `--font-mono`
- **Body text** uses `--font-body` at 15px base
- **Never** use system fonts (Arial, Segoe UI, sans-serif) — they break the Gothic atmosphere
- **Panel headers**: Cinzel, 12px, weight 700, gold color, uppercase, letter-spacing 4px
- **Stat labels**: Cinzel, 8px, weight 700, gold color, uppercase, letter-spacing 2px
- **Stat values**: Share Tech Mono, 11-12px, cyan color with glow
- **Button text**: Cinzel, 8-14px, weight 700, uppercase, letter-spacing 2-4px

---

## 4. Flourish System

**Every label, title, and key text element must have decorative flourishes.** This is the defining characteristic of the UI.

### Flourish Symbols

| Symbol | Name | Usage |
|--------|------|-------|
| `⚜` | Fleur-de-lis | Major headings, primary buttons, trait dividers |
| `✦` | Four-pointed star | Panel headers, card names, unit names, standard buttons |
| `◆` | Diamond | HUD labels, small decorative accents |
| `◈` | Diamond with dot | Cost/value prefixes |
| `›` | Chevron | Stat row prefixes, list item markers |
| `✠` | Cross | Gothic dividers, religious motifs |
| `⟨ ⟩` | Angle brackets | Wrapping stat values |
| `╔ ╗ ╚ ╝` | Box-drawing | Card/panel corner ornaments |
| `┌─ ─┘` | Box-drawing | HUD cell corner brackets |
| `[ ]` | Brackets | Category/classification badges |

### Flourish Placement Rules

**Panel headers** (`::before` / `::after`):
```css
.panel-header .title::before, .panel-header .title::after {
  content: '✦';
  font-size: 8px;
  color: var(--gold-dim);
  text-shadow: 0 0 4px rgba(196, 164, 74, 0.3);
}
```

**Card names / Unit names** (`::before` / `::after`):
```css
.card-name::before, .card-name::after {
  content: '⚜';
  font-size: 8px;
  color: var(--gold-dim);
}
```

**Stat labels** (`::after` dash):
```css
.stat-label::after {
  content: '—';
  font-size: 6px;
  color: var(--gold-dim);
  opacity: 0.4;
}
```

**Stat values** (angle bracket wrapping):
```css
.stat-value::before { content: '⟨'; }
.stat-value::after { content: '⟩'; }
```

**HUD labels** (diamond flanking):
```css
.hud-label::before, .hud-label::after {
  content: '◆';
  font-size: 5px;
  color: var(--blue-dim);
}
```

**Buttons** (inline `<span>` elements since `::before`/`::after` are used for hover effects):
```html
<button class="menu-btn">
  <span class="btn-flourish">✦</span> BUTTON TEXT <span class="btn-flourish">✦</span>
</button>
```

**Action buttons** (`::before` / `::after` stars):
```css
.act-btn::before { content: '✦'; font-size: 5px; opacity: 0.5; }
.act-btn::after { content: '✦'; font-size: 5px; opacity: 0.5; }
```

**Category badges** (bracket wrapping):
```css
.card-category::before { content: '[ '; opacity: 0.4; }
.card-category::after { content: ' ]'; opacity: 0.4; }
```

### Flourish Color Rules
- Flourish symbols are **always gold** (`--gold-dim` for subtle, `--gold` for prominent)
- Flourishes always have a matching `text-shadow` glow: `0 0 4px rgba(196, 164, 74, 0.3)`
- On hover, flourishes brighten: color shifts to `--gold`, shadow intensifies
- Flourish opacity ranges from 0.4 (subtle) to 0.7 (prominent)

---

## 5. Panel & Card Framing

### Panel Structure
Every panel follows this structure:
```
┌─ Panel ──────────────────────────────┐
│ [Corner Flourish TL]    [Corner TR]  │
│                                      │
│  ┌─ Panel Header ──────────────┐     │
│  │ ✦ SECTION TITLE ✦          │     │
│  └─────────────────────────────┘     │
│  ── ◆ ── filigree rule ── ◆ ──      │
│                                      │
│  [Content Area]                      │
│  [Panel Watermark: faint symbol]     │
│                                      │
│ [Corner BL]             [Corner BR]  │
│ [Flying Buttress L]  [Buttress R]    │
│           [Gothic Arch]              │
└──────────────────────────────────────┘
```

### Corner Flourishes
- 32px size, 2px thick lines
- Double-line effect via `box-shadow`
- Diamond accent dot (`.diamond` child element) at the corner intersection
- Gold color at 0.35 opacity

### Gothic Arch
- 100px wide, 16px tall radial gradient arch at bottom center of panels
- Centered `✦` star accent via `::after`

### Flying Buttresses
- Vertical gold lines on left/right edges of panels
- 2px wide, 84% height
- Node dots at midpoint via `::before`

### Filigree Rules
- Placed after panel headers as a decorative separator
- Structure: `line — diamond — cross — diamond — line`
- Gold color at low opacity

### Panel Watermarks
- Large (120px) faint decorative symbols behind panel content
- Centered, very low opacity (0.04)
- Different symbol per panel section (e.g., `✠`, `⚔`, `⚙`, `☠`)

### Ornate Double Border
- Inner border: panel's own `border` property
- Outer border: `::before` pseudo-element at 4px offset with matching border

### Card Corners
- Use box-drawing characters: `╔ ╗ ╚ ╝`
- 12px font size, gold color with glow
- Trailing gradient lines extending from each corner

---

## 6. Decorative Dividers

### Gothic Divider (between major sections)
```
━━━━━━━━━ ✠ ━━━━━━━━━
```
- Gold lines with centered cross symbol
- Symbol has glow: `text-shadow: 0 0 8px rgba(196, 164, 74, 0.5)`

### Organ Pipe Divider
- 9 vertical bars of varying heights (24-42px)
- Flanked by `✦` symbols
- Gold color at low opacity
- Used between major page sections

### Filigree Rule (within panels)
- Thin horizontal line with diamond and cross accents
- Placed after panel headers

### Dotted Separator
- `· · · · · · ·` pattern in gold at 6px
- Used above stat grids

---

## 7. Animation & Effects

### Glitch System (Title Only)
The game title uses a dual-layer RGB split glitch:
- **Ghost layers**: `::before` (blood crimson `#cc2020`) and `::after` (pale bone `#ffe0a0`)
- **Clip-path slicing**: Jagged polygon masks on each ghost layer
- **Animation cycle**: 3.5s loop with two bursts — major (70-82%) and minor (88-96%)
- **Displacement**: Up to 12px translate, 8deg skew
- **Body glitch**: `hue-rotate`, `brightness`, `invert`, `scaleY` variations
- **Scan-line overlay**: `repeating-linear-gradient` of thin gold lines that flickers during glitch
- **mix-blend-mode: screen** on ghost layers

### Warp Flicker (Panel Borders)
- Subtle periodic color shift on panel borders
- `hue-rotate` and `brightness` bursts every 6-8s
- Only on panels marked with `.warp-flicker-border`

### Card Boot Animation
- Cards fade in with `translateY(18px)` and `brightness(2.5)` flash
- Staggered delays per card (0.13s increments)

### Holographic Scan Line
- Slow vertical sweep across unit cards
- `linear-gradient` moving top-to-bottom in 4.5s loop

### Bar Energy Flow
- Animated shine sweeping across health/morale/ammo bars
- `translateX(-100%)` to `translateX(250%)` in 2.2s

### Button Hover Effects
- **Menu buttons**: Chevron sweep pattern (`::before`), glow bar intensify (`::after`), `scale(1.03)`, `box-shadow` bloom
- **Action buttons**: Border color shift to gold, text glow intensify
- **Flourish spans**: `scale(1.3)` and brighter gold on parent hover

### Hover Rule
- All interactive elements must have a visible hover state
- Hover transitions: `all 0.2s-0.3s ease`
- Hover should intensify existing styling (brighter glow, stronger shadow) — never introduce new colors

---

## 8. Background Layers

The background uses three stacked full-screen canvases:

### Layer 1: Starfield + Planet (z-index: lowest)
- **Stars**: 310 total across 3 parallax layers with twinkling
- **Planet**: Slow orbital drift (3% screen radius), Saturn-like rings (5-band, back/front split), atmosphere glow, cloud bands, terminator shadow, ring shadow on surface
- **Deep space gradient**: Dark radial gradient from `#090914` center

### Layer 2: Particle Effects
- 35 floating particles in blue, amber, gold, cyan
- Slow drift with subtle fade in/out

### Layer 3: Overlays (CSS)
- Scan-line overlay: `repeating-linear-gradient` of 2px lines
- Noise texture: SVG `feTurbulence` filter at very low opacity
- Vignette: Radial gradient darkening edges

---

## 9. Component Patterns

### Buttons

**Menu Buttons** (large, primary navigation):
- Cinzel font, 14px, weight 700, letter-spacing 4px
- Clip-path angled edges: `polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)`
- Flanking flourish `<span>` elements (`⚜` for primary, `✦` for standard, `☠` for destructive)
- Steel gradient background
- Left glow bar (`::after`)

**Action Buttons** (small, in-panel):
- Cinzel font, 8px, weight 700, letter-spacing 2px
- Hexagonal clip-path: `polygon(5px 0, calc(100%-5px) 0, 100% 50%, calc(100%-5px) 100%, 5px 100%, 0 50%)`
- `✦` flanking via `::before`/`::after`
- Gold text color, gold border
- Attack variant: red text and red border

### Form Controls

**Toggles**: Custom switch with steel track, blue/amber active fill
**Sliders**: Custom range with steel track, filled portion in blue, gold thumb
**Dropdowns**: Steel background, gold border, Cinzel font for label

### Stat Displays

**Stat Rows** (2-column grid):
- `›` chevron prefix on each row
- Label: Cinzel, gold, with `—` dash suffix
- Value: Share Tech Mono, cyan, wrapped in `⟨ ⟩`
- Subtle gold bottom border between rows

**Health/Status Bars**:
- Steel track with 1px border
- Color-coded fill with animated energy flow shine
- Gold label prefix with `›` chevron

### Cards (Unit/Deck)

- Steel gradient background with gold inner border (`::before` at 3px inset)
- Ornate box-drawing corner characters (`╔ ╗ ╚ ╝`) with trailing gradient lines
- Card header with `— ✦ —` separator beneath
- Holographic scan line animation
- Boot animation (fade + brightness flash)

---

## 10. Spacing & Layout

- **Section gaps**: 50-60px between major sections (with organ pipe dividers)
- **Panel padding**: 16-24px
- **Panel gaps**: 10-14px between adjacent panels
- **Card grid gaps**: 14px
- **Stat row padding**: 3-4px vertical
- **Button padding**: 5-13px vertical, 3-24px horizontal
- **Max content width**: 960px centered
- **Letter-spacing**: 2-4px on labels, 11-18px on titles

---

## 11. Responsive Rules

- At `max-width: 600px`: Title shrinks to 30px, letter-spacing to 6px
- Card grids collapse to single column
- Panel grids stack vertically
- Flourish sizes remain the same (they're already small)

---

## 12. Anti-Patterns (DO NOT)

- **No plain text labels** — every label needs at least one flourish symbol
- **No system fonts** — always use the three specified Google Fonts
- **No flat borders** — use gold-tinted borders with corner accents
- **No solid color backgrounds** — use gradients (even subtle ones)
- **No elements without hover states** — every interactive element responds
- **No bright colors on dark backgrounds without glow** — text should always have matching `text-shadow`
- **No bare panels** — every panel needs corner flourishes, filigree, and watermark
- **No generic buttons** — all buttons need clip-path shaping and flourish symbols
- **No raw numbers** — stat values should be wrapped in decorative brackets

---

## 13. Quick Reference: Adding a New Panel

```css
.my-panel {
  background: linear-gradient(135deg, var(--steel-mid), var(--steel-dark));
  border: 1px solid var(--steel-highlight);
  position: relative;
}

/* Ornate double border */
.my-panel::before {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid rgba(196, 164, 74, 0.12);
  pointer-events: none;
}
```

```html
<div class="my-panel">
  <!-- Corner flourishes -->
  <div class="corner-flourish tl"><div class="diamond"></div></div>
  <div class="corner-flourish tr"><div class="diamond"></div></div>
  <div class="corner-flourish bl"><div class="diamond"></div></div>
  <div class="corner-flourish br"><div class="diamond"></div></div>

  <!-- Header with flourishes -->
  <div class="panel-header">
    <span class="title">✦ PANEL NAME ✦</span>
  </div>

  <!-- Filigree separator -->
  <div class="filigree-rule">
    <div class="fili-line"></div>
    <div class="fili-diamond"></div>
    <div class="fili-cross">✠</div>
    <div class="fili-diamond"></div>
    <div class="fili-line"></div>
  </div>

  <!-- Watermark -->
  <div class="panel-watermark">✠</div>

  <!-- Content here -->
</div>
```

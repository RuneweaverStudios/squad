# CSS Theming Approach and OKLCH Color System

This document provides comprehensive documentation for the SQUAD IDE's custom CSS theming strategy, specifically detailing the OKLCH color system implementation, guidelines for component styling, color selection principles, and best practices for maintaining visual consistency across the application.

## Table of Contents

1. [Overview](#overview)
2. [OKLCH Color Space Fundamentals](#oklch-color-space-fundamentals)
3. [Theme Architecture](#theme-architecture)
4. [Color Variable System](#color-variable-system)
5. [Component Styling Guidelines](#component-styling-guidelines)
6. [Animation Colors](#animation-colors)
7. [Status Colors Configuration](#status-colors-configuration)
8. [Best Practices](#best-practices)
9. [Common Patterns](#common-patterns)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The SQUAD IDE uses a layered theming approach:

1. **Tailwind CSS v4** - Core utility framework with `@import "tailwindcss"` syntax
2. **DaisyUI** - Component library providing 32+ themes via `@plugin "daisyui"`
3. **Custom SQUAD Theme** - Industrial dark theme with OKLCH color definitions
4. **Status Colors** - Centralized visual configuration in TypeScript for programmatic access

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Tailwind CSS v4 | Utility-first CSS |
| Components | DaisyUI | Pre-built UI components |
| Theme Engine | CSS Custom Properties | Dynamic theming |
| Color Space | OKLCH | Perceptually uniform colors |
| State Management | TypeScript config | Status/state visuals |

---

## OKLCH Color Space Fundamentals

### What is OKLCH?

OKLCH (Oklab Lightness Chroma Hue) is a **perceptually uniform color space** that provides more intuitive color manipulation than RGB or HSL.

```
oklch(L C H / A)
      │ │ │   └─ Alpha (opacity): 0-1 or percentage
      │ │ └───── Hue: 0-360 (color wheel angle)
      │ └─────── Chroma: 0-0.4+ (color saturation/vibrancy)
      └───────── Lightness: 0-1 (0 = black, 1 = white)
```

### Why OKLCH?

| Benefit | Description |
|---------|-------------|
| **Perceptual Uniformity** | Equal numeric changes produce equal visual changes |
| **Predictable Lightness** | L=0.5 looks 50% bright regardless of hue |
| **Better Gradients** | No muddy middle colors in transitions |
| **Consistent Contrast** | Same L value = same perceived brightness |
| **CSS Native** | Supported in all modern browsers |

### OKLCH vs HSL Comparison

```css
/* HSL: Yellow appears brighter than blue at same L */
color: hsl(60 100% 50%);   /* Yellow - very bright */
color: hsl(240 100% 50%);  /* Blue - appears darker */

/* OKLCH: Same L value = same perceived brightness */
color: oklch(0.70 0.18 85);   /* Yellow */
color: oklch(0.70 0.18 240);  /* Blue - equally bright */
```

### OKLCH Value Ranges

| Component | Range | Common Values | Notes |
|-----------|-------|---------------|-------|
| **L** (Lightness) | 0 - 1 | 0.15-0.25 (dark bg), 0.65-0.85 (text) | 0 = black, 1 = white |
| **C** (Chroma) | 0 - 0.4+ | 0.02-0.05 (muted), 0.15-0.25 (vibrant) | 0 = gray, higher = more saturated |
| **H** (Hue) | 0 - 360 | See hue wheel below | Color identity |
| **A** (Alpha) | 0 - 1 | 0.08-0.15 (tints), 0.3-0.5 (overlays) | Opacity |

### Hue Wheel Reference

```
     Hue    Color         Example Use Case
     ───    ─────         ────────────────
      0°    Red           Errors, critical
     25°    Red-Orange    Warnings (error-adjacent)
     45°    Orange        Attention, needs-input
     70°    Amber/Gold    Working state, emphasis
     85°    Yellow        Ready-for-review
    100°    Lime          Transition (amber→green)
    145°    Green         Success, completed
    175°    Teal          Completing, secondary success
    200°    Cyan          Info, starting, accents
    220°    Light Blue    Info highlights
    240°    Blue          Primary, working state
    250°    Slate Blue    Neutral, base colors
    270°    Purple        Hierarchy, epics
    280°    Violet        Secondary, compacting
    300°    Magenta       Epic, special
    330°    Pink          Style, accent
```

---

## Theme Architecture

### File Structure

```
ide/
├── src/
│   ├── app.css                     # Main theme definitions
│   ├── lib/
│   │   ├── config/
│   │   │   └── statusColors.ts     # Programmatic status visuals
│   │   ├── utils/
│   │   │   └── themeManager.ts     # Theme switching utilities
│   │   └── components/
│   │       └── ThemeSelector.svelte # Theme picker UI
│   └── routes/
│       └── +layout.svelte          # Theme initialization
└── tailwind.config.js              # (Legacy, mostly ignored in v4)
```

### Theme Loading (Tailwind v4)

```css
/* src/app.css */
@import "tailwindcss";

/* Custom SQUAD theme MUST come before @plugin */
[data-theme='squad'] {
  /* Theme definitions here */
}

@plugin "daisyui" {
  themes:
    squad --default,  /* Custom theme first, set as default */
    light,
    dark,
    /* ... other DaisyUI themes */
    nord,
    sunset;
}
```

**Critical**: In Tailwind v4, you MUST use `@import "tailwindcss"` NOT `@tailwind base/components/utilities`.

---

## Color Variable System

### Base Color Variables

The SQUAD theme defines semantic color variables using OKLCH:

```css
[data-theme='squad'] {
  color-scheme: dark;

  /* ─── Base Colors (backgrounds, surfaces) ─── */
  --color-base-100: oklch(22% 0.01 250);   /* Main background */
  --color-base-200: oklch(18% 0.015 250);  /* Slightly darker */
  --color-base-300: oklch(14% 0.02 250);   /* Darkest */
  --color-base-content: oklch(85% 0.02 250); /* Text on base */

  /* ─── Neutral (UI chrome) ─── */
  --color-neutral: oklch(16% 0.01 250);
  --color-neutral-content: oklch(85% 0.02 250);

  /* ─── Primary (brand accent) ─── */
  --color-primary: oklch(70% 0.18 240);
  --color-primary-content: oklch(15% 0.02 250);

  /* ─── Secondary (complement) ─── */
  --color-secondary: oklch(50% 0.10 280);
  --color-secondary-content: oklch(90% 0.02 280);

  /* ─── Accent (highlight) ─── */
  --color-accent: oklch(75% 0.15 200);
  --color-accent-content: oklch(15% 0.02 200);

  /* ─── Semantic Colors ─── */
  --color-info: oklch(70% 0.15 220);
  --color-success: oklch(65% 0.20 145);
  --color-warning: oklch(75% 0.15 85);
  --color-error: oklch(65% 0.22 25);
}
```

### Animation Color Variables

For animations that use `color-mix()`, dedicated variables ensure consistency:

```css
[data-theme='squad'] {
  /* ─── Primary Blue (entrance, radar, links) ─── */
  --anim-primary: oklch(0.70 0.18 240);
  --anim-primary-bright: oklch(0.80 0.18 240);
  --anim-primary-dim: oklch(0.60 0.15 240);

  /* ─── Success Green (starting, completion) ─── */
  --anim-success: oklch(0.65 0.20 145);
  --anim-success-bright: oklch(0.70 0.22 145);
  --anim-success-dim: oklch(0.55 0.18 145);

  /* ─── Warning Amber (working, attention) ─── */
  --anim-warning: oklch(0.75 0.15 85);
  --anim-warning-bright: oklch(0.80 0.18 85);
  --anim-warning-gold: oklch(0.75 0.20 85);

  /* ─── Error Red (exit, critical) ─── */
  --anim-error: oklch(0.70 0.20 25);
  --anim-error-dim: oklch(0.65 0.18 25);

  /* ─── Info Cyan (agent, highlights) ─── */
  --anim-info: oklch(0.70 0.18 200);
  --anim-info-bright: oklch(0.85 0.18 200);
  --anim-info-highlight: oklch(0.70 0.18 220);

  /* ─── Secondary Purple (shimmer, epic) ─── */
  --anim-secondary: oklch(0.60 0.18 280);
  --anim-secondary-bright: oklch(0.70 0.20 280);
  --anim-secondary-dim: oklch(0.50 0.15 280);

  /* ─── Base/Neutral (hover, backgrounds) ─── */
  --anim-base-hover: oklch(0.30 0.02 250);
  --anim-base-row: oklch(0.22 0.02 250);

  /* ─── Shimmer Effects ─── */
  --anim-shimmer-highlight: oklch(0.85 0.18 200);
  --anim-shimmer-bright: oklch(0.95 0.05 200);
  --anim-shimmer-slow: oklch(0.80 0.15 280);

  /* ─── State Transitions ─── */
  --anim-transition-mid: oklch(0.80 0.18 100);
  --anim-transition-mid-border: oklch(0.80 0.20 115);
}
```

### Variable Naming Convention

| Prefix | Purpose | Example |
|--------|---------|---------|
| `--color-*` | DaisyUI semantic colors | `--color-primary` |
| `--anim-*` | Animation-specific colors | `--anim-success-bright` |
| `*-content` | Text color on that background | `--color-primary-content` |
| `*-bright` | Lighter/more vibrant variant | `--anim-warning-bright` |
| `*-dim` | Darker/muted variant | `--anim-primary-dim` |

---

## Component Styling Guidelines

### Using OKLCH in Components

#### Svelte Component Styles

```svelte
<style>
  .my-component {
    /* Direct OKLCH usage */
    background: oklch(0.22 0.01 250);
    color: oklch(0.85 0.02 250);

    /* With alpha for overlays */
    border: 1px solid oklch(0.70 0.18 240 / 0.5);

    /* Reference theme variables */
    background: var(--color-base-200);
  }
</style>
```

#### Using color-mix() for Transparency

```css
/* Mixing with transparent for overlays */
background: color-mix(in oklch, var(--anim-primary) 30%, transparent);
box-shadow: 0 0 20px color-mix(in oklch, var(--anim-success) 40%, transparent);

/* Gradient with mixed colors */
background: linear-gradient(90deg,
  color-mix(in oklch, var(--anim-warning) 15%, transparent),
  transparent
);
```

### Status Colors (TypeScript)

For programmatic access to colors (status badges, dynamic styling), use `statusColors.ts`:

```typescript
import { getSessionStateVisual, SESSION_STATE_VISUALS } from '$lib/config/statusColors';

// Get visual config for a session state
const visual = getSessionStateVisual('working');

// Use in inline styles
<div style="
  background: {visual.bgTint};
  border-left: 3px solid {visual.accent};
">
```

### Industrial Theme Utility Classes

Pre-defined utility classes for consistent styling:

```css
/* Industrial hover effect */
.industrial-hover {
  transition: all 0.2s ease;
}
.industrial-hover:hover {
  background-color: var(--anim-base-hover);
  color: var(--anim-primary-bright);
}

/* Industrial select/input styling */
.industrial-select { /* ... */ }
.industrial-input { /* ... */ }
.industrial-label { /* ... */ }

/* Row highlighting */
.industrial-row:hover {
  background-color: var(--anim-base-row) !important;
  border-left-color: var(--anim-primary) !important;
}
```

---

## Animation Colors

### Why Animation Colors Exist

CSS animations using `color-mix()` cannot use Tailwind utility classes. They must use:
- CSS custom properties (`var(--anim-*)`)
- Direct OKLCH values

### Animation Variable Categories

| Category | Variables | Use Case |
|----------|-----------|----------|
| **Primary** | `--anim-primary`, `*-bright`, `*-dim` | Links, entrance, radar |
| **Success** | `--anim-success`, `*-bright`, `*-dim` | Task start, completion |
| **Warning** | `--anim-warning`, `*-bright`, `*-gold` | Working state, attention |
| **Error** | `--anim-error`, `*-dim` | Exit animations, errors |
| **Info** | `--anim-info`, `*-bright`, `*-highlight` | Agent animations |
| **Secondary** | `--anim-secondary`, `*-bright`, `*-dim` | Shimmer, epic states |
| **Base** | `--anim-base-hover`, `--anim-base-row` | Hover states |

### Animation Keyframes Using color-mix

```css
@keyframes task-entrance {
  0% {
    opacity: 0;
    background-color: color-mix(in oklch, var(--anim-primary) 30%, transparent);
    box-shadow: 0 0 20px color-mix(in oklch, var(--anim-primary) 40%, transparent);
  }
  100% {
    opacity: 1;
    background-color: transparent;
    box-shadow: none;
  }
}

@keyframes working-to-completed {
  0% {
    /* Amber working state */
    background: linear-gradient(90deg,
      color-mix(in oklch, var(--anim-warning) 15%, transparent),
      transparent
    );
  }
  60% {
    /* Transition to green */
    background: linear-gradient(90deg,
      color-mix(in oklch, var(--anim-success) 25%, transparent),
      transparent
    );
  }
  100% {
    /* Final completed state */
    background: linear-gradient(90deg,
      color-mix(in oklch, var(--anim-success-dim) 15%, transparent),
      transparent
    );
  }
}
```

### Why These Can't Use Tailwind

1. **@keyframes** don't support class-based styling
2. **color-mix()** creates dynamic transparency
3. **Theme variables** provide runtime theming
4. **OKLCH space** ensures perceptual consistency

---

## Status Colors Configuration

### Architecture

`src/lib/config/statusColors.ts` provides:

1. **Type definitions** for visual configs
2. **Constant mappings** (state → visual properties)
3. **Helper functions** for lookups with fallbacks

### Session State Visuals

```typescript
export interface SessionStateVisual {
  // Display
  label: string;           // "🔧 WORKING"
  shortLabel: string;      // "Working"
  iconType: string;        // 'gear' | 'rocket' | etc.
  description: string;     // Tooltip text

  // Badge colors (StatusActionBadge)
  bgColor: string;         // oklch(0.55 0.15 250 / 0.3)
  textColor: string;       // oklch(0.90 0.12 250)
  borderColor: string;     // oklch(0.55 0.15 250 / 0.5)
  pulse?: boolean;         // Animate with pulse

  // Card colors (SessionCard)
  accent: string;          // oklch(0.70 0.18 250)
  bgTint: string;          // oklch(0.70 0.18 250 / 0.08)
  glow: string;            // oklch(0.70 0.18 250 / 0.4)

  // SVG icon path
  icon: string;
}
```

### Session States and Colors

| State | Hue | Accent | Purpose |
|-------|-----|--------|---------|
| `starting` | 200 (cyan) | Blue-cyan | Agent initializing |
| `working` | 250 (blue) | Blue | Active coding |
| `compacting` | 280 (violet) | Purple | Context compression |
| `needs-input` | 45 (orange) | Amber-orange | Waiting for user |
| `ready-for-review` | 85 (yellow) | Yellow-amber | Code complete |
| `completing` | 175 (teal) | Teal-green | Running /squad:complete |
| `completed` | 145 (green) | Green | Task done |
| `auto-proceeding` | 160 (lime) | Green-cyan | Spawning next |
| `idle` | 250 (slate) | Gray-blue | No task |

### Issue Type Colors

| Type | Hue | Description |
|------|-----|-------------|
| `bug` | 25 | Red-orange for problems |
| `feature` | 145 | Green for new functionality |
| `task` | 250 | Blue for general work |
| `chore` | 250 (low C) | Muted slate for maintenance |
| `epic` | 300 | Purple for large initiatives |
| `docs` | 200 | Cyan for documentation |
| `refactor` | 85 | Amber for restructuring |
| `test` | 180 | Teal for testing |
| `style` | 330 | Pink for visual changes |
| `perf` | 70 | Yellow for performance |

### Agent Status Colors

| Status | Hue | Visual |
|--------|-----|--------|
| `working` | 240 | Electric blue with spin |
| `live` | 145 | Vibrant green with dots |
| `active` | 70 | Warm amber with pulse |
| `idle` | 250 (low C) | Muted slate |
| `connecting` | 220 | Soft blue with ring |
| `disconnected` | 55 | Warning orange |
| `offline` | 25 | Dim red |

---

## Best Practices

### Color Selection Principles

1. **Use semantic meaning**
   - Green (145°) = Success, positive
   - Red (25°) = Error, negative
   - Amber (70-85°) = Warning, attention
   - Blue (200-250°) = Info, primary

2. **Maintain consistent lightness**
   - Vibrant accents: L = 0.65-0.75
   - Muted backgrounds: L = 0.14-0.22
   - Text content: L = 0.80-0.90

3. **Use chroma for emphasis**
   - High chroma (0.18-0.25): Active states, accents
   - Low chroma (0.02-0.08): Backgrounds, neutrals

4. **Apply alpha for layering**
   - 0.05-0.10: Subtle tints
   - 0.15-0.30: Visible overlays
   - 0.40-0.60: Strong emphasis

### When to Use Each Color System

| Need | Use | Example |
|------|-----|---------|
| DaisyUI components | `class="badge-success"` | Status badges |
| Inline dynamic styles | `statusColors.ts` | Session cards |
| CSS animations | `var(--anim-*)` | Keyframe effects |
| Custom components | OKLCH values | Unique styling |

### Avoiding Common Mistakes

```css
/* ❌ Wrong: Tailwind class in animation */
@keyframes wrong {
  0% { @apply bg-success/30; }  /* Won't work! */
}

/* ✅ Correct: CSS variable with color-mix */
@keyframes correct {
  0% { background: color-mix(in oklch, var(--anim-success) 30%, transparent); }
}

/* ❌ Wrong: Hardcoded RGB in theme */
.component { background: rgb(50, 50, 80); }

/* ✅ Correct: OKLCH with theme variable */
.component { background: var(--color-base-200); }
```

### Accessibility Considerations

1. **Contrast ratios**
   - Text on backgrounds: Minimum 4.5:1
   - OKLCH makes this easier to achieve consistently

2. **Color blindness**
   - Don't rely on color alone
   - Use icons, labels, and patterns

3. **Reduced motion**
   - All animations respect `prefers-reduced-motion`
   - Defined in `app.css` with `@media` query

---

## Common Patterns

### Gradient Backgrounds

```css
/* Horizontal fade for row highlighting */
background: linear-gradient(90deg,
  color-mix(in oklch, var(--anim-warning) 15%, transparent),
  transparent
);

/* Radial glow for badges */
box-shadow: 0 0 20px color-mix(in oklch, var(--anim-info) 40%, transparent);
```

### State Transitions

```css
/* Smooth color transition */
transition: background-color 0.2s ease, border-color 0.2s ease;

/* With animation class */
.task-completed {
  animation: task-completed 1.2s ease-out forwards;
}
```

### Dormant States

For states that become inactive, use lower chroma and lightness:

```typescript
// Active state
accent: 'oklch(0.70 0.18 250)',

// Dormant variant (muted)
dormantAccent: 'oklch(0.50 0.05 250)',
```

### Row Gradients (hasRowGradient Pattern)

When using gradients on table rows, prevent cell-by-cell gradient restart:

```svelte
{@const hasRowGradient = isCompleted || isActive}

<tr style="background: {hasRowGradient ? 'linear-gradient(...)' : ''}">
  <td style="background: {hasRowGradient ? 'transparent' : 'inherit'}">
    <!-- Cell content -->
  </td>
</tr>
```

---

## Troubleshooting

### Colors Not Appearing

1. **Check Tailwind v4 syntax**
   ```css
   /* Must use @import, not @tailwind directives */
   @import "tailwindcss";
   ```

2. **Verify theme is loaded**
   ```javascript
   // Check in browser console
   document.documentElement.getAttribute('data-theme')
   // Should return 'squad'
   ```

3. **Clear build cache**
   ```bash
   rm -rf .svelte-kit node_modules/.vite
   npm run dev
   ```

### Animation Not Working

1. **Check for CSS variable existence**
   ```javascript
   getComputedStyle(document.documentElement)
     .getPropertyValue('--anim-primary')
   ```

2. **Verify color-mix() support**
   - Supported in all modern browsers
   - Check browser version if issues

3. **Check animation class is applied**
   - Use browser DevTools to verify class
   - Check for specificity conflicts

### Inconsistent Colors Across Components

1. **Use centralized config**
   - Always import from `statusColors.ts`
   - Don't hardcode OKLCH values

2. **Check state derivation**
   - Ensure state name matches config key
   - Verify fallback is appropriate

### Further Reading

- [OKLCH Color Picker](https://oklch.com/) - Interactive color tool
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [DaisyUI Themes](https://daisyui.com/docs/themes/)
- [color-mix() MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix)

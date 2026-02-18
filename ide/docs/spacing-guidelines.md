# IDE Spacing Guidelines

This document establishes standardized spacing values for consistent UI component layout across the SQUAD IDE.

## Spacing Scale

Based on audit of TasksActive, TaskDetailPaneB, SessionCard, and StatusActionBadge components.

### Base Units (Tailwind / rem)

| Token | Tailwind | Value | Use Case |
|-------|----------|-------|----------|
| `xs` | `0.5` | 0.125rem (2px) | Micro spacing, badge padding |
| `sm` | `1` | 0.25rem (4px) | Tight spacing, small gaps |
| `md` | `1.5` | 0.375rem (6px) | Compact UI elements |
| `base` | `2` | 0.5rem (8px) | Standard small gaps |
| `lg` | `3` | 0.75rem (12px) | Section gaps, comfortable padding |
| `xl` | `4` | 1rem (16px) | Major sections, panel padding |
| `2xl` | `6` | 1.5rem (24px) | Large empty states |
| `3xl` | `8` | 2rem (32px) | Hero sections, empty states |

## Component-Specific Guidelines

### Badges (StatusActionBadge, task badges)

**Small badges (status, priority):**
```css
padding: 0.125rem 0.375rem;  /* xs vertical, md horizontal */
gap: 0.25rem;                /* sm */
```

**Medium badges (task type, labels):**
```css
padding: 0.25rem 0.5rem;     /* sm vertical, base horizontal */
gap: 0.375rem;               /* md */
```

**Large badges (interactive dropdowns):**
```css
padding: 0.375rem 0.75rem;   /* md vertical, lg horizontal */
gap: 0.5rem;                 /* base */
```

### Table Cells (TasksActive, TaskTable)

**Standard table cells:**
```css
padding: 0.875rem 1rem;      /* 14px vertical, 16px horizontal */
```

**Compact table cells:**
```css
padding: 0.625rem 0.75rem;   /* 10px vertical, 12px horizontal */
```

### Panel Content (TaskDetailPaneB, drawers)

**Panel header:**
```css
padding: 0.75rem 1rem;       /* lg vertical, xl horizontal */
gap: 0.5rem;                 /* base */
```

**Panel body:**
```css
padding: 0.75rem 1rem;       /* lg vertical, xl horizontal */
gap: 0.5rem;                 /* base */
```

**Panel sections:**
```css
gap: 0.75rem;                /* lg between sections */
```

**Empty states:**
```css
padding: 2rem;               /* 3xl all around */
gap: 0.75rem;                /* lg */
```

### Dropdown Menus (StatusActionBadge)

**Menu items:**
```css
padding: 0.5rem 0.75rem;     /* base vertical, lg horizontal */
gap: 0.5rem;                 /* base */
```

**Compact menu items:**
```css
padding: 0.375rem 0.75rem;   /* md vertical, lg horizontal */
gap: 0.375rem;               /* md */
```

### Buttons

**Primary/Action buttons:**
```css
padding: 0.5rem 1rem;        /* base vertical, xl horizontal */
gap: 0.5rem;                 /* base */
```

**Small/Icon buttons:**
```css
padding: 0.25rem 0.5rem;     /* sm vertical, base horizontal */
gap: 0.25rem;                /* sm */
```

### Session Cards (SessionCard)

**Card header:**
```css
gap: 0.5rem;                 /* base between elements */
margin-bottom: 0.5rem;       /* base below header */
```

**Card body sections:**
```css
gap: 0.75rem;                /* lg between major sections */
```

**Inline elements:**
```css
gap: 0.25rem to 0.5rem;      /* sm to base */
```

## Gap Usage Patterns

### Horizontal Gaps (flex items in a row)

| Context | Gap | Tailwind |
|---------|-----|----------|
| Tight icon + text | 0.25rem | `gap-1` |
| Badge elements | 0.375rem | `gap-1.5` |
| Standard items | 0.5rem | `gap-2` |
| Section items | 0.75rem | `gap-3` |
| Major sections | 1rem | `gap-4` |

### Vertical Gaps (stacked elements)

| Context | Gap | Tailwind |
|---------|-----|----------|
| List items | 0.25rem | `gap-1` |
| Form fields | 0.375rem | `gap-1.5` |
| Sections | 0.5rem-0.75rem | `gap-2` to `gap-3` |
| Major areas | 1rem | `gap-4` |

## Margin Guidelines

### Avoid arbitrary margins

Prefer `gap` on flex/grid containers over individual margins. When margins are needed:

| Context | Value |
|---------|-------|
| Section bottom | 0.5rem (`mb-2`) |
| Header bottom | 0.5rem (`mb-2`) |
| Small element indent | 0.125rem (`ml-0.5`) |
| Icon offset | 0.25rem (`ml-1`) |

## CSS vs Tailwind Decision

**Use Tailwind classes when:**
- Spacing is applied inline to individual elements
- The element is in the template (not inside `<style>`)
- Quick prototyping or simple layouts

**Use CSS custom properties when:**
- Spacing is part of a component's scoped styles
- Multiple elements share the same spacing pattern
- The value needs to be computed or animated

## Migration Notes

When normalizing existing components:

1. **Don't change working layouts** - Only standardize values that are clearly inconsistent
2. **Prefer Tailwind classes** - For new code, use Tailwind gap/padding utilities
3. **Keep CSS for complex layouts** - Table styling, pseudo-elements stay in CSS
4. **Test visual regression** - Small spacing changes can break designs

## Reference: Current Component Patterns

### StatusActionBadge.svelte
- Uses Tailwind classes for most spacing
- CSS `margin-left: 0.375rem` at line 1605

### TasksActive.svelte
- Mix of CSS and Tailwind
- Table cells: `padding: 0.875rem 1rem`
- Empty state: `padding: 4rem; gap: 0.75rem`

### TaskDetailPaneB.svelte
- Primarily CSS-based spacing
- Panel content: `padding: 0.75rem 1rem; gap: 0.5rem`
- Tabs: `padding: 0.375rem 0.75rem`

### SessionCard.svelte
- Primarily Tailwind gap classes
- Scroll offset: `scroll-margin-top: 6rem`

# EduMarket Design Tokens v1.1 (Engineering Ready)

This document defines the canonical UI token set for Web implementation and design handoff.
Source aligned with:

- `frontend/apps/web/tailwind.config.ts`
- `frontend/apps/web/app/globals.css`

## 1. Token Naming Rules

- Prefix by domain: `brand`, `intent`, `status`, `feedback`, `layout`, `radius`, `shadow`, `typography`
- For paired status tokens, always provide both `*-bg` and `*-text`
- Keep semantic meaning stable; avoid renaming by page usage

## 2. Color Tokens

### 2.1 Brand

| Token | Value | Usage |
| --- | --- | --- |
| `brand.primary` | `#6C63FF` | Brand color, active nav, action accent |
| `brand.cta` | `#FF6B73` | Primary flow CTA |
| `brand.cta-hover` | `#FF5964` | Flow CTA hover/active |

### 2.2 Intent (Button Intent)

| Token | Value | Usage |
| --- | --- | --- |
| `intent.flow` | `#FF6B73` | Checkout, create order, submit proof, login/register |
| `intent.action` | `#6C63FF` | Filter, review, publish, management actions |
| `intent.neutral` | `#FFFFFF` | Back, cancel, helper actions |
| `intent.danger` | `#EF4444` | Reject, delete, disable actions |

### 2.3 Text & Surface

| Token | Value | Usage |
| --- | --- | --- |
| `text.primary` | `#1F2937` | Headings and key data |
| `text.secondary` | `#6B7280` | Descriptions and secondary labels |
| `text.tertiary` | `#9CA3AF` | Meta and weak emphasis text |
| `surface.page` | `#F4F1FF` | Base page background |
| `surface.card` | `#FFFFFF` | Card background |
| `surface.border` | `#E5E7EB` | Standard border color |

### 2.6 DS (Account / Commerce) — `--ds-*`

Used on cart, checkout, orders, downloads, library, creator/teacher management, and admin list surfaces.  
Tailwind prefix: `ds` (e.g. `bg-ds-page`, `text-ds-heading`, `rounded-ds-card`).

| Token | CSS variable | Value | Usage |
| --- | --- | --- | --- |
| `ds.page` | `--ds-page-bg` | `#F4F5FA` | Page background (commerce flows) |
| `ds.surface` | `--ds-surface` | `#FFFFFF` | Card / panel background |
| `ds.surface-muted` | `--ds-surface-muted` | `#FAFAFC` | Subtle panels |
| `ds.surface-subtle` | `--ds-surface-subtle` | `#F7F7FB` | Flat card level (`Card` `flat`) |
| `ds.border` | `--ds-border-default` | `#E8E8F0` | Standard border |
| `ds.border-muted` | `--ds-border-muted` | `#ECECF2` | Low-emphasis divider |
| `ds.border-strong` | `--ds-border-strong` | `#DCDCE8` | Hover / emphasis border |
| `ds.text.heading` | `--ds-text-heading` | `#111827` | Section / card titles |
| `ds.text.body` | `--ds-text-body` | `#374151` | Body copy |
| `ds.text.muted` | `--ds-text-muted` | `#6B7280` | Secondary labels |
| `ds.text.subtle` | `--ds-text-subtle` | `#9CA3AF` | Meta / helper text |
| `ds.focus` | `--ds-focus-ring` | `#6C63FF` | Focus ring (same as brand primary) |
| `ds.radius.card` | `--ds-radius-card` | `20px` | **Canonical** card radius for `Card` / `SurfaceCard` |
| `ds.shadow.card` | `--ds-shadow-card` | see `globals.css` | Default card shadow |
| `ds.shadow.card-soft` | `--ds-shadow-card-soft` | see `globals.css` | Flat / soft elevation |
| `ds.shadow.card-hover` | `--ds-shadow-card-hover` | see `globals.css` | Interactive list cards |

**When to use `ds` vs `edu`:** See `docs/frontend-ui-architecture.md` §3.

### 2.4 Status

| State | BG | Text |
| --- | --- | --- |
| `draft` | `#F3F4F6` | `#4B5563` |
| `pending_review` | `#FEF3C7` | `#B45309` |
| `published` | `#ECFDF5` | `#047857` |
| `unpublished` | `#F3F4F6` | `#4B5563` |
| `pending_payment` | `#FFE4E6` | `#FF6B73` |
| `approved` | `#ECFDF5` | `#047857` |
| `rejected` | `#FEE2E2` | `#B91C1C` |
| `reviewed` | `#EDE9FE` | `#6C63FF` |

### 2.5 Feedback (Loading/Empty/Error)

| Token | Value | Usage |
| --- | --- | --- |
| `feedback.loading.text` | `#6B7280` | Loading label text |
| `feedback.loading.spinner-primary` | `#6C63FF` | Spinner active color |
| `feedback.loading.spinner-track` | `#DDEBFA` | Spinner track color |
| `feedback.empty.icon-bg` | `#EDE9FE` | Empty illustration/icon background |
| `feedback.empty.title` | `#1F2937` | Empty title text |
| `feedback.empty.description` | `#6B7280` | Empty description text |
| `feedback.empty.action` | `#6C63FF` | Empty action link/button |
| `feedback.error.bg` | `#FEF2F2` | Error panel background |
| `feedback.error.border` | `#FECACA` | Error panel border |
| `feedback.error.text` | `#B91C1C` | Error text |

## 3. Layout Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `layout.sidebar-width` | `240px` | Desktop buyer sidebar **expanded** width |
| `layout.sidebar-width-collapsed` | `72px` | Desktop buyer sidebar **collapsed** (icon rail) width |
| `layout.content-max.narrow` | `768px` | Narrow content container |
| `layout.content-max.normal` | `1024px` | Default content container |
| `layout.content-max.wide` | `1280px` | Wide content container |
| `layout.page-padding.mobile` | `16px` | Mobile page horizontal padding |
| `layout.page-padding.tablet` | `24px` | Tablet page horizontal padding |
| `layout.page-padding.desktop` | `32px` | Desktop page horizontal padding |
| `layout.section-gap.sm` | `16px` | Small section gap |
| `layout.section-gap.md` | `24px` | Medium section gap |
| `layout.section-gap.lg` | `32px` | Large section gap |
| `layout.section-gap.xl` | `48px` | Extra large section gap |

## 4. Radius & Shadow Tokens

### 4.1 Radius

| Token | Value | Usage |
| --- | --- | --- |
| `radius.card-elevated` | `32px` | Elevated card |
| `radius.card-default` | `28px` | Standard card |
| `radius.card-flat` | `24px` | Flat utility blocks |

### 4.2 Shadow

| Token | Value | Usage |
| --- | --- | --- |
| `shadow.card-elevated` | `0 18px 60px rgba(15, 23, 42, 0.10)` | High-emphasis surfaces |
| `shadow.card-default` | `0 10px 40px rgba(15, 23, 42, 0.06)` | Standard cards |
| `shadow.button-flow` | `0 8px 24px rgba(255, 107, 115, 0.28)` | Flow CTA buttons |
| `shadow.button-action` | `0 6px 20px rgba(108, 99, 255, 0.22)` | Action buttons |

## 5. Spacing Scale

Core spacing follows Tailwind scale and project aliases:

- Base scale: `4, 8, 12, 16, 20, 24, 32, 40, 48`
- Layout aliases:
  - `page-mobile = 16`
  - `page-tablet = 24`
  - `page-desktop = 32`
  - `section-sm/md/lg/xl = 16/24/32/48`

## 6. Typography Scale

| Token | Size | Line Height | Weight | Usage |
| --- | --- | --- | --- | --- |
| `type.h1` | `32px` | `40px` | 700 | Page primary heading |
| `type.h2` | `24px` | `32px` | 700 | Section heading |
| `type.h3` | `20px` | `28px` | 700 | Block heading |
| `type.title` | `16px` | `24px` | 600 | Card/header title |
| `type.body` | `14px` | `22px` | 400 | Body text |
| `type.meta` | `12px` | `18px` | 500 | Meta labels |
| `type.caption` | `11px` | `16px` | 500 | Dense helper text |

Font stack:

- Primary: `Noto Sans TC`
- Fallback: `Inter`, `ui-sans-serif`, `system-ui`

## 7. Component Specs

### 7.1 Button

- Base:
  - Radius: `16px` (`rounded-2xl`)
  - Padding: `x=20`, `y=12`
  - Font: `14px`, `600`
  - Focus: visible outline in brand primary
- Intents:
  - `flow`: background `intent.flow`, text white, shadow `shadow.button-flow`
  - `action`: background `intent.action`, text white, shadow `shadow.button-action`
  - `neutral`: white background, border `surface.border`, dark text
  - `danger`: background `intent.danger`, text white

### 7.2 Card surfaces (two primitives)

Implementation guide: `docs/frontend-ui-architecture.md` §4.

#### A. `Card` (`components/ui/Card.tsx`) — **preferred for commerce / account**

Uses **`ds`** tokens only:

| `level` | Radius | Shadow / surface |
| --- | --- | --- |
| `elevated` | `ds.radius.card` (`rounded-ds-card`) | Stronger custom shadow on `ds.surface` |
| `default` | `ds.radius.card` | `shadow-ds-card` |
| `flat` | `ds.radius.card` | `bg-ds-surface-subtle`, `shadow-ds-card-soft` |

Padding variants: `none` | `sm` (`p-4`) | `md` (`p-5`) | `lg` (`p-6 md:p-8`).

#### B. `SurfaceCard` (`components/ds/SurfaceCard.tsx`)

Same **`ds`** radius and borders; no built-in padding. Use `elevation`:

| `elevation` | Usage |
| --- | --- |
| `flat` | Toolbars, muted panels |
| `raised` | Static list containers |
| `interactive` | Hoverable row/card (`hover:shadow-ds-card-hover`) |

#### C. Legacy marketing radius (`edu` / `--radius-card-*`)

| Token | Value | Usage |
| --- | --- | --- |
| `radius.card-elevated` | `32px` | Explore / hero product cards only |
| `radius.card-default` | `28px` | Legacy marketing blocks |
| `radius.card-flat` | `24px` | Legacy flat blocks |

**Do not** use §C tokens on new cart, checkout, order, or admin surfaces.

### 7.3 Table

- Container: white background, border `surface.border`, rounded large corners
- Header row: subtle gray background (`#FAFAFA`), uppercase meta style
- Row divider: `#F3F4F6`
- Hover row: light tint (`#FAFAFF`)

### 7.4 Badge

- Shape: pill
- Font: `12px`, `600`
- Must use status token pairs (`status.*.bg`, `status.*.text`)

## 8. Figma Mapping Suggestion

Recommended variable naming:

- `color/brand/*`
- `color/intent/*`
- `color/status/<state>/(bg|text)`
- `color/feedback/*`
- `layout/*`
- `radius/*`
- `shadow/*`
- `type/*`

## 9. Migration Notes (v1.0 -> v1.1)

- Keep existing `edu.*` tokens for backward compatibility.
- New work should use semantic groups: `intent`, `status`, `feedback`, `layout`.
- **Commerce / account / admin:** use `ds.*` + `Card` / `SurfaceCard` (§2.6, §7.2A–B).
- **Explore / home merchandising:** may keep `edu.*` and legacy `--radius-card-*` (§7.2C).
- Refactor priority:
  1. Button intents (`intent` prop over legacy `variant`)
  2. Badge status mapping
  3. Empty/Loading/Error visuals
  4. Replace ad-hoc card classes with `Card` / `SurfaceCard`
  5. Primitives (`Input`, etc.): replace hardcoded hex with `ds` / semantic tokens

## 10. Related documents

- `docs/frontend-ui-architecture.md` — component layering, token choice, PR checklist
- `docs/page-token-usage-mapping-v1.1.md` — per-page intent and card level
- `docs/cart-ui-guidelines.md` — cart page pixel spec
- `docs/buyer-sidebar-ui-spec.md` — buyer desktop sidebar expand/collapse spec

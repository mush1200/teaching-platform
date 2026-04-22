# Shared UI (`packages/ui`)

Cross-platform UI components and design tokens (Tamagui).

## Tokens

- Source: `src/tokens.ts`
- Categories: `colors`, `fontSizes`, `lineHeights`, `typography`, `space`, `radius`, `shadows`

## Naming rules

- Semantic color names first (`primary`, `success`, `danger`) instead of brand-only names.
- Scale-based size naming (`xs/sm/md/lg/xl`) for typography, spacing, and radius.
- Prefer token consumption in components; avoid hardcoded values except transparent values.

## Usage example

```ts
import { designTokens } from "@teaching-platform/ui";

const gap = designTokens.space.md;
const danger = designTokens.colors.danger;
```

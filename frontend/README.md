# Frontend Monorepo

This folder is prepared as a frontend monorepo.

## Structure
- `apps/web`: Next.js web app (primary delivery target)
- `apps/mobile`: Expo mobile app (follow-up phase)
- `packages/ui`: shared Tamagui UI components and tokens
- `packages/features`: shared business flows
- `packages/api`: Swagger-aligned API layer
- `packages/config`: shared config and constants

## Commands
- `npm run dev:web`
- `npm run lint:web`
- `npm run typecheck:web`
- `npm run verify:web`

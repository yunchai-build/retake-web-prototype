# Retake Agent Guide

## Required Context

- Before any UI, styling, component, layout, animation, or design-system change, read `docs/design-system.md`.
- Treat `docs/design-system.md` as the source of truth for Retake's product identity, CSS layers, tokens, and component usage.
- Preserve the current Retake language: mobile-first, camera-forward, playful, tool-like, glass tool chrome, solid yellow brand moments, Bedstead display type, dark ink text, canvas/editor controls, stickers, and fast motion.

## Project Shape

- This is a Vite + React app.
- App entry points live in `src/main.jsx` and `src/App.jsx`.
- Shared UI primitives live in `src/components/ui`.
- Editor-specific behavior lives in `src/features/editor`.
- Route-specific styles live in `src/styles/invitee.css` and `src/styles/inviter.css`.
- Shared styling belongs in the relevant layer under `src/styles`: `tokens.css`, `base.css`, `glass.css`, `brand.css`, `controls.css`, and `overlays.css`.

## Design-System Rules

- Use semantic CSS variables from `src/styles/tokens.css` instead of raw values in new CSS.
- Prefer existing UI primitives before creating new components.
- Use `IconButton` as the base behavior primitive for icon controls.
- Use `GlassSurface` for translucent toolbars, bottom bars, floating clusters, and glass rows.
- Controls inside `GlassSurface` should use solid material.
- Use `GlassIconButton` only for standalone glass controls.
- Use `SolidIconButton` for controls inside glass containers and neutral panel controls.
- Use brand components and brand styles for yellow, high-attention Retake moments.
- Keep reusable UI in `src/components/ui`; keep product-specific behavior in feature folders.
- Avoid route CSS for reusable visual rules unless the rule is truly page layout or one-off choreography.

## Development Commands

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`

## Working Norms

- Keep changes tightly scoped to the request.
- Do not rewrite unrelated files or generated assets.
- Follow the existing component and CSS layer patterns.
- When touching UI, verify responsive behavior on mobile-sized and desktop-sized viewports.
- Before finishing, run `npm run build` when the change affects source code or styling.

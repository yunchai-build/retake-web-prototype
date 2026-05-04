# Retake Design System

Retake uses a code-first design system. Code tokens and reusable components are the short-term source of truth; Figma should mirror the stable system once the product language settles.

## Identity

- Retake is mobile-first, camera-forward, playful, and tool-like.
- Preserve the current identity: glass tool chrome, solid yellow brand moments, Bedstead display type, dark ink text, canvas/editor controls, stickers, and fast motion.
- New UI should feel like part of the editor or invite flow, not a separate marketing page.

## CSS Layers

- `tokens.css`: raw and semantic variables for color, typography, spacing, radii, glass, shadows, motion, z-indexes, and control sizing.
- `base.css`: reset styles, fonts, body defaults, form inheritance, and tap highlight behavior.
- `glass.css`: translucent material only. Use it for toolbars, icon buttons, action pills, floating controls, and glass sliders.
- `brand.css`: solid Retake brand moments. Use it for yellow cards, popups, sheets, invite cards, share/name popups, and brand buttons.
- `controls.css`: shared button and pill material classes. Use it for glass, solid, and brand control materials before adding route-specific positioning.
- `overlays.css`: shared overlay structure. Use it for scrims, confirmation dialogs, modal positioning, bottom sheets, and reusable overlay transitions.
- `invitee.css` and `inviter.css`: route-specific layout and choreography only.

## Tokens

Use semantic tokens instead of raw values in new CSS. Important tokens include:

- `--color-brand-yellow`, `--color-brand-yellow-active`, `--color-ink`, `--color-canvas`, `--color-page`
- `--surface-brand-bg`, `--surface-brand-fg`, `--surface-brand-muted`
- `--glass-bg`, `--glass-filter`, `--glass-border`, `--glass-control-bg`, `--glass-control-active`
- `--font-display`, `--text-sm`, `--text-title`, `--text-hero`
- `--radius-pill`, `--radius-button`, `--radius-card`, `--radius-canvas`
- `--motion-fast`, `--motion-medium`, `--motion-panel`, `--motion-enter`

## Components

Reusable UI belongs in `src/components/ui`. Product-specific behavior belongs in feature folders.

- Use `IconButton` as the base behavior primitive for icon controls.
- Use `GlassSurface` for translucent containers: toolbars, bottom bars, floating clusters, and glass rows.
- Any interactive component inside a `GlassSurface` must use solid material. Glass is the container; solid is the child control.
- Use `GlassIconButton` only when the button itself is a standalone glass control, not when it is inside `GlassSurface`.
- Use `SolidIconButton` for controls inside glass containers and for solid neutral panel controls: gallery, sticker close, sticker tabs, new-sticker close, refine back, toolbar tools, undo/redo, and bottom-bar actions.
- Use brand components for yellow, high-attention Retake moments.
- Keep component prop contracts small and explicit, such as `IconButton({ icon, label, material, shape, active, disabled, onClick })`.
- Prefer material plus shape over ID styling: `material="glass" | "solid" | "brand"` and `shape="circle" | "pill" | "square"`.
- Avoid writing new visual rules directly in route CSS unless the rule is truly page layout or one-off choreography.

## Figma Workflow

Do not pause app development for a giant Figma system. Once tokens and core components stabilize, create a compact Figma library that mirrors colors, type styles, glass surfaces, brand surfaces, icon buttons, toolbars, modals, sliders, bottom bars, and phone/canvas frames.

When design changes in Figma, update the matching token or component in code instead of adding random CSS.

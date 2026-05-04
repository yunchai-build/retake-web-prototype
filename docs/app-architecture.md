# Retake App Architecture

Retake currently has two product flows and one shared capability area.

## Product Flows

- Inviter: creates a frame, edits canvas content, names the frame, uploads it, and shares an invite link.
- Invitee: opens a frame invite, grants camera permission, captures or selects a photo, composes it with the frame, and saves or shares the result.
- Editor: shared canvas/tool behavior used by either flow, including drawing, stickers, text, eraser, undo/redo, brush sizing, opacity controls, and overlays.

## Target File Shape

```txt
src/
  components/
    ui/
    icons/
  features/
    editor/
      components/
      hooks/
      utils/
    inviter/
      components/
      hooks/
    invitee/
      components/
      hooks/
  lib/
    api.js
    canvas.js
  styles/
```

Pages should orchestrate flows. Hooks should own behavior. UI components should render controls and surfaces.

## Current Backend

- Vercel API routes handle frame uploads, private Blob proxying, and signup.
- Vercel Blob stores frame images.
- Airtable currently stores signup email records.

## Backend Direction

Short term, centralize client calls in `src/lib/api.js` and keep secrets in server-side environment variables. Validate upload payloads, frame URLs, and failure states before adding more backend surface area.

Use Supabase later if Retake needs accounts, auth, frame ownership, invite records, permissions, row-level security, or durable product data. Keep Vercel for hosting, API routes, Blob storage, previews, and production environment management.

## State Direction

Flow states are defined in `src/features/inviter/state.js` and `src/features/invitee/state.js`, then exposed on each screen root through `data-flow-state`. Keep using these constants when adding visual states, analytics, tests, or future reducers so behavior and design stay connected.

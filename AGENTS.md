<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Testo UI design rules

- Before changing or adding any user-facing screen, read [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md). It is the self-contained source of truth for Testo's visual language: layout, spacing, colors, typography, component shape, responsive behavior, and light/dark themes. Reuse the existing Testo app shell and shared components/tokens where practical; do not invent a competing visual system.
- Keep Testo's existing routes, authorization, Supabase data, domain rules, and interactions as the source of truth. Implement the visual system without replacing production content or behavior with sample data or mock interactions.
- Keep English and Arabic layouts polished. Preserve RTL behavior, logical spacing, readable typography, and responsive layouts; do not fix one direction by breaking the other.
- Apply the same design contract to every new screen and visual change so the product remains cohesive without a user restating these requirements.

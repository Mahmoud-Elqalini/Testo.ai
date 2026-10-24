<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Testo UI design rules

- Before changing or adding any user-facing screen, read [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md). It is the self-contained source of truth for Testo's visual language: layout, spacing, colors, typography, component shape, responsive behavior, and light/dark themes. Reuse the existing Testo app shell and shared components/tokens where practical; do not invent a competing visual system.
- Keep Testo's existing routes, authorization, Supabase data, domain rules, and interactions as the source of truth. Implement the visual system without replacing production content or behavior with sample data or mock interactions.
- For the dashboard groups and exams overview, follow the paired instructor/student group panels and bordered upcoming/recent exams panel documented in `DESIGN_SYSTEM.md`; show real authorized data and localized empty states, never reference/demo records.
- On narrow dashboard screens, follow the compact brand/language/menu header and accessible blurred off-canvas navigation drawer documented in `DESIGN_SYSTEM.md`; preserve RTL mirroring and keep theme switching available.
- New accounts default to the light theme; preserve the user's saved theme choice and use the existing theme switch and shared tokens for dark mode.
- Keep English and Arabic layouts polished. Preserve RTL behavior, logical spacing, readable typography, and responsive layouts; do not fix one direction by breaking the other.
- Apply the same design contract to every new screen and visual change so the product remains cohesive without a user restating these requirements.

## Required design workflow for every agent

These rules apply to every existing screen being restyled and every new screen or component. A screen is complete only when its visual design, real data states, interactions, accessibility, and responsive behavior work together as one product experience.

### Before editing

- Read `DESIGN_SYSTEM.md` and the applicable route, shared shell/components, data service/types, authorization checks, and current translations before choosing a layout.
- For Next.js code, read the relevant installed guide under `node_modules/next/dist/docs/` before editing. Follow this repository's installed version and existing architecture.
- Identify the real user roles, available fields, authorized destinations, existing interactions, and theme/language providers. Do not infer product behavior from a screenshot or create new routes, permissions, data fields, or actions to make a visual mockup look complete.
- Reuse shared app shell components, design tokens, controls, and interaction patterns. Extend a shared component when the same visual behavior belongs across screens; avoid parallel styles or per-screen theme/language state.

### While designing and implementing

- Treat `DESIGN_SYSTEM.md` as the approved visual contract for all current and future UI. If the user approves a lasting design change or a real product decision makes the contract inaccurate, update `DESIGN_SYSTEM.md` in the same change. Do not leave the source of truth contradictory to the implemented design.
- Design the whole screen, not only its populated desktop state. Account for page hierarchy, real content, actions, navigation, loading skeletons, empty states, errors, disabled states, and confirmation/success feedback where relevant.
- Use real authenticated data and existing domain rules. Never substitute demo records or fake interactions for production behavior. Development fixtures are allowed only behind one explicit development-only flag when the feature has no production data model; keep them isolated and never let them override real groups, exams, users, permissions, or saved preferences.
- Use localized, concise copy for every visible label and accessibility name. Add matching English and Arabic entries together. Preserve semantic HTML, keyboard access, visible focus rings, adequate contrast, and reduced-motion preferences.
- Build responsive behavior deliberately: check wide desktop, tablet, narrow mobile, long labels, and content that can grow. Prevent horizontal overflow, clipped controls, and accidental wrapping in compact headers. Use logical CSS properties and verify mirrored RTL layout, drawer direction, icons, and progress indicators.
- Support both light and dark themes through the shared provider and semantic tokens. Preserve saved preferences and the light default for new accounts. Review borders, muted text, status colors, icons, hover/focus states, and disabled controls in both themes.
- Keep interactions truthful. Every enabled button or link must perform the action its label promises and lead to an existing authorized destination. If a feature has no real action yet, show an honest localized empty/disabled state instead of wiring it to an unrelated route.

### Before calling the work complete

- Review the changed screen in English and Arabic, light and dark themes, and desktop/mobile widths. Prefer opening the running app and checking actual rendered states when the local environment supports it; otherwise inspect the relevant code and CSS for each required state and direction.
- Check the main user journeys with the existing routes and data, including drawer open/close, Escape and overlay behavior, keyboard focus, language/theme switching, and real empty/populated states where applicable.
- Confirm there are no leftover reference names/data, placeholder badges, obsolete copy, missing localization keys, one-direction-only spacing, or visible controls that do nothing.
- Keep the final change scoped to the requested experience. Report what changed, what was checked, any limitation caused by a missing production feature, and provide a concise suggested commit message. Do not claim browser or test verification that was not performed.

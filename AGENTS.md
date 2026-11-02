<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Manjam UI design rules

- Before changing or adding any user-facing screen, read [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md). It is the source of truth for Manjam's visual language, brand palette, layout, typography, responsive behavior, and themes. Reuse existing shared components and tokens where practical; do not invent a competing visual system.
- Keep existing routes, authorization, Supabase data, domain rules, and interactions as the source of truth. Implement visual changes without replacing production content or behavior with sample data or mock interactions.
- For the dashboard groups and exams overview, follow the paired instructor/student group panels and bordered upcoming/recent exams panel documented in `DESIGN_SYSTEM.md`; show real authorized data and localized empty states, never reference/demo records.
- On narrow dashboard screens, follow the compact brand/language/menu header and accessible blurred off-canvas navigation drawer documented in `DESIGN_SYSTEM.md`; preserve RTL mirroring and keep theme switching available.
- In the unified dashboard header, place the hamburger on the opposite end from the language/theme controls and make the drawer enter from the hamburger's same physical side (left in English LTR, right in Arabic RTL). Use the provided Manjam logo assets instead of a text brand mark; use English by default while respecting a saved language preference.
- New accounts default to the light theme; preserve the user's saved theme choice and use the existing theme switch and shared tokens for dark mode.
- Keep English and Arabic layouts polished. Preserve RTL behavior, logical spacing, readable typography, and responsive layouts; do not fix one direction by breaking the other.
- Apply the same design contract to every new screen and visual change so the product remains cohesive without a user restating these requirements.

### Brand and migration rules

- Manjam (منجم) is the current product brand. New screens and screens explicitly included in a rebrand scope use the Manjam logo and the palette documented in `DESIGN_SYSTEM.md`.
- UI work must follow the Manjam Brand Palette in `DESIGN_SYSTEM.md`. Use semantic tokens only; no hardcoded colors; no violet/indigo/purple/fuchsia classes; verify contrast for any new color pair; support light/dark and RTL/LTR.
- Leave untouched legacy screens visually unchanged until their migration is explicitly in scope. Do not extend the legacy violet palette to new UI, and do not opportunistically restyle unrelated screens.
- If changing an existing shared token would alter untouched legacy screens, add a semantic Manjam token to `src/app/globals.css` and scope it to the new/rebranded screen. Consolidate legacy and Manjam tokens only when all affected consumers are in an approved migration scope.
- Keep legacy code identifiers unchanged unless a separate task explicitly migrates them. Current examples include `testo` (legacy package identifier, renamed in a later phase), `testo-` (legacy CSS class prefix, renamed in a later phase), `TestoError` (legacy error identifier, renamed in a later phase), and existing cookie keys (legacy identifiers, renamed in a later phase).
- The active Manjam logo variant must match the active theme. Use symbol marks for compact spaces, horizontal lockups for headers, and vertical lockups only where their proportions fit the experience.
- New visitors and accounts default to English and light theme unless a saved preference exists. Preserve existing preference flows; do not add page-specific preference state.

### Seed data and production-data boundaries

- Synthetic preview data is allowed only when a feature has no production data source and must be isolated in a clearly named fixture module. Never use synthetic fixtures for groups, exams, users, permissions, saved preferences, or any entity with real production data.
- Public home preview data lives only in `src/lib/fixtures/public-home-course-seed.server.ts`. It is synthetic display data, not a SQL/Supabase seed and must never write to any database.
- The preview seed may be enabled only in local development with the server-only setting `MANJAM_PUBLIC_HOME_SEED=true` in the ignored root `.env.local`. Do not use a `NEXT_PUBLIC_` flag for seed data. The helper must check both `NODE_ENV === 'development'` and the explicit flag; in all other environments it returns no seed records.
- Real public course records always take precedence. Use the seed only when no eligible live public courses exist, only while the explicit local preview flag is active. Never let the fixture override live records or leak to a production response.
- To remove the preview seed, unset `MANJAM_PUBLIC_HOME_SEED`, remove its single integration call, and delete the isolated fixture file. This must require no database cleanup, migration, schema change, or edits to authentication or other production data.
- Keep seed records clearly synthetic, bilingual when shown in both languages, limited to fields needed for presentation, and free of fabricated ratings, enrollments, prices, achievements, or claims.

### Specification and architecture rules

- For every new spec and every edit to an existing spec, read the applicable feature spec and `.specify/memory/constitution.md`. Preserve agreed scope and unrelated decisions; amend only the requirements affected by the user's request.
- Keep `spec.md` focused on user value, observable behavior, constraints, and measurable acceptance criteria. Keep framework, module, design-pattern, and class-level decisions out of product requirements; record maintainability needs without prescribing implementation details.
- Every implementation plan must include a Maintainability and Design Review per Constitution Principle XI: evaluate SOLID responsibilities and boundaries, dependency direction, and any consequential patterns; justify patterns against the concrete problem and simpler alternatives. “No pattern needed” is valid when justified.
- Apply design patterns and SOLID proportionately. Do not add abstractions, layers, or architecture solely to satisfy a label. Follow existing repository conventions and choose the simplest design that safely meets the approved spec.
- When updating an existing spec, do not rewrite unrelated stories or requirements to retrofit architecture terminology. Capture technical design changes in the plan and preserve traceability to the original user outcomes.

## Required design workflow for every agent

These rules apply to every existing screen being restyled and every new screen or component. A screen is complete only when its visual design, real data states, interactions, accessibility, and responsive behavior work together as one product experience.

### Before editing

- For an active feature, use its `spec.md` as the agreed acceptance boundary. Do not add routes, permissions, data fields, actions, or product claims that are not present in the spec or existing product behavior. Preserve real production data and authorization; surface unresolved conflicts before making a product decision.
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

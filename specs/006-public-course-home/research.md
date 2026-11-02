# Research: Public Manjam Home and Featured Courses

## Decisions

### Root route and authentication

- **Decision**: Replace the unconditional redirect in `src/app/page.tsx` with the public landing experience. Do not add a second auth check in the page.
- **Rationale**: `src/proxy.ts` already calls `resolveAuthRedirect`; guests are allowed on `/`, while authenticated users are redirected to `/dashboard`.
- **Alternatives considered**: Duplicating session resolution in the page would add a second authority and duplicate existing routing behavior.

### Course data boundary

- **Decision**: Do not use the older shared `src/lib/fixtures/courses.ts` fixtures for the public homepage. Use only the new `src/lib/fixtures/public-home-course-seed.server.ts` for local preview. Until a real public course catalog exists, production renders the localized empty state.
- **Rationale**: The old fixture module is already used by dashboard/search; it includes unrelated fields and is controlled by a different flag. The production data model has no course catalog or public details route.
- **Alternatives considered**: Adding course rows through Supabase seed SQL would mutate the shared database and require cleanup. Reusing search fixtures would couple the page to another feature and could expose development content.

### Seed enablement and removal

- **Decision**: Keep the homepage seed behind both `NODE_ENV === 'development'` and `MANJAM_PUBLIC_HOME_SEED === 'true'`, read only on the server. Never use a `NEXT_PUBLIC_` flag. Live eligible public courses take precedence once a source exists.
- **Rationale**: Next.js inlines `NEXT_PUBLIC_` variables into browser bundles; the private flag avoids exposing the setting, while the `NODE_ENV` check makes accidental use outside local development return no seed records.
- **Alternatives considered**: A client-side fixture toggle could expose dev data and establish a second data source. Database-seeding would couple visual development to production data.

### Shared shell, language, and theme

- **Decision**: Keep the shared providers as the only source of language and theme state. Add a root-only visual/navigation variant to the shared shell and reuse the existing preference setter logic.
- **Rationale**: `src/app/layout.tsx` already wraps all routes with `I18nProvider`, `ThemeProvider`, and `SiteNavigation`; the preference controls already persist through existing cookies, local storage, and profile preferences.
- **Alternatives considered**: A standalone preference store or second provider would duplicate persistence and could disagree with authenticated routes.

### Phased Manjam color migration

- **Decision**: Define the Manjam palette as semantic CSS tokens for the public-home scope in `src/app/globals.css`. Leave the current shared legacy token mappings alone until their consumers are explicitly migrated.
- **Rationale**: Existing screens use the shared token names and the project rule is to keep untouched legacy screens visually unchanged. Repointing those values now would create an out-of-scope visual change.
- **Alternatives considered**: Replacing global token values would affect legacy screens. Hardcoding palette values in page CSS violates the design system and makes later migration harder.

### Design patterns and SOLID

- **Decision**: Use no named design pattern for this feature. Keep a focused page composition, a server-only fixture accessor, and existing provider boundaries.
- **Rationale**: There is one UI and no production catalog implementation to abstract. Additional repositories, factories, or strategy interfaces would be speculative.
- **Alternatives considered**: A generalized catalog adapter can be introduced later alongside a real catalog contract; it is not needed to render a production empty state today.

## Resolved Unknowns

- The auth redirect for authenticated visitors is already handled centrally by `src/proxy.ts`.
- The current production course catalog and public course detail route do not exist; the spec's empty state is therefore the production behavior for this iteration.
- The public-home seed file exists but has no call site yet. It remains safe and inert until the root page wires it through the server boundary.
- Logo files are available under `public/images/logo/` in theme variants.
- The homepage language/theme defaults and persistence already exist in the shared providers.

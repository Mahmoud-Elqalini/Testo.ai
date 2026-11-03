# Implementation Plan: Public Manjam Home and Featured Courses

**Branch**: `006-public-course-home` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-public-course-home/spec.md`

## Summary

Replace the signed-out root-page redirect with the public Manjam landing experience defined in the spec. Preserve the existing authenticated redirect in `src/proxy.ts`, reuse the current language/theme providers and authentication destinations, and show only approved public courses. Since no production course catalog exists, production renders the localized empty state; the isolated server-only seed may populate the cards only in local development when explicitly enabled.

## Technical Context

**Language/Version**: TypeScript 5, React 19

**Primary Dependencies**: Next.js 16 App Router, `@supabase/ssr`, current i18n and theme providers, existing shared navigation and preference controls, Tailwind CSS v4

**Storage**: No new database tables, migrations, writes, or production storage. The preview cards are held in an isolated server-only fixture.

**Testing**: Visual review in Arabic/RTL and English/LTR, light and dark themes, desktop/tablet/mobile, plus the project constitution's visual regression requirement for themed/directional UI. No tests or snapshots have been run during planning.

**Target Platform**: Responsive public web page

**Project Type**: Existing Next.js web application

**Performance Goals**: Deliver the landing content in the initial server-rendered page; do not add a client-side course-fetch round trip for the current no-catalog production state. Keep the featured section limited to the first three approved public courses.

**Constraints**: Preserve existing auth redirects and role protections; no course catalog or course details route exists; production must not use fixtures; the seed is opt-in and server-gated; untouched legacy screens and token mappings stay visually unchanged; no new page-specific preference state.

**Scale/Scope**: One public root route, its guest header variant and course presentation states, three initial course cards at most, existing login/register/dashboard destinations, no new user roles, course routes, or data model.

## Constitution Check

- **I. Server is source of truth — PASS**: Existing `src/proxy.ts` validates the session and routes authenticated users from `/` to `/dashboard`; the page must not duplicate or weaken this behavior. Public course records are displayed only when approved for public access.
- **II. Grading criteria isolation — N/A**: The landing page does not return exam questions or grading information.
- **III. Exam access defense in depth — N/A**: No exam access or attempt behavior changes.
- **IV. Data integrity and resilience — PASS**: The seed is display-only, never writes to Supabase, and is not a substitute for real data.
- **V. Notification idempotency — N/A**: No notifications are added.
- **VI. Cost-conscious scaling — PASS**: No paid services, new infrastructure, or database operations are introduced.
- **VII. Simplicity before sophistication — PASS**: Keep the scope to the landing page and existing shell. Do not build a catalog management system, course details routes, or ranking logic.
- **VIII. Test-first logic / visual regression — PASS WITH REQUIRED VISUAL GATE**: New auth/data logic is not planned. The changed screen must be visually checked in the four language/theme combinations and at desktop/mobile widths; visual regression snapshots remain a pre-merge gate under the constitution. No tests have been created or run during this plan phase.
- **IX. Bilingual and theme-adaptive — PASS**: Reuse existing language/theme contexts and preference persistence; add complete English/Arabic copy and direction-aware layout.
- **X. Automated grading integrity — N/A**: No grading changes.
- **XI. Maintainable design, SOLID, problem-driven patterns — PASS**: Use focused route, navigation, and content responsibilities; keep the seed server-only. No named design pattern or new abstraction is needed. Detailed reasoning is below.

## Maintainability and Design Review

- **Responsibilities and boundaries**: `src/app/page.tsx` remains the route/server boundary and passes only display-safe course data. A focused public-home content component owns the landing sections, card/loading/empty states, and localized copy. `SiteNavigation` provides a root-only brand/preferences/account header without section links or a menu; other routes retain their current navigation behavior. Existing providers own preference state. The existing server-only seed module owns synthetic preview records and its environment gate.
- **SOLID review**: Keep each responsibility focused (SRP). Extend the shared preference control's presentation through a small visual variant rather than duplicating persistence behavior (OCP without a generic plugin system). The current feature has no alternate catalog implementation contract, so LSP is not materially applicable. Avoid a broad new control interface; the existing provider API is sufficient, so ISP does not require a new abstraction. Keep content components dependent on display-safe props and existing contexts, not Supabase clients (DIP at the existing server/data boundary).
- **Dependency direction**: The server route may call the server-only seed helper and passes serializable localized cards to UI. Client components must never import the fixture or access Supabase directly. The root page continues to rely on `src/proxy.ts` for auth redirects. The landing UI reuses i18n/theme providers and existing `/login`, `/register`, and `/dashboard` routes.
- **Patterns and alternatives**: No named design pattern is warranted. A separate repository, factory, or strategy interface would be speculative while there is no production course catalog. The simpler alternative is one server-only seed helper behind the existing route boundary, then add a live data adapter only when an approved catalog exists. For navigation preferences, reuse the current controls/providers instead of creating a second preference system.
- **Scope and complexity**: Add only the route content, route-specific navigation behavior, localized copy, and Manjam semantic tokens needed by the landing page. Do not change the existing `--primary` and other legacy token values, rename legacy identifiers, add DB schemas, or modify unrelated screens.

## Project Structure

### Documentation (this feature)

```text
specs/006-public-course-home/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
└── quickstart.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── page.tsx                    # Public root route; auth redirect remains in proxy
│   ├── globals.css                 # Add semantic Manjam tokens without changing legacy mappings
│   └── public-home.css             # Route-specific layout and responsive styling
├── components/
│   ├── home/PublicHome.tsx         # Landing page content and course/loading/empty states
│   └── shared/
│       ├── SiteNavigation.tsx      # Root-only brand/preferences/account header
│       └── PreferenceSwitcher.tsx  # Reuse shared preference behavior with compact switch styling
├── locales/
│   ├── ar.json                    # Public-home Arabic copy and accessibility labels
│   └── en.json                    # Public-home English copy and accessibility labels
└── lib/fixtures/
    └── public-home-course-seed.server.ts # Existing isolated local preview seed
```

**Structure Decision**: Keep the feature in the current single Next.js application. Add no API, database schema, or new route. The existing public-home seed file is the only synthetic data source.

## Complexity Tracking

No constitution violations or additional architecture layers are proposed. The public course source remains a known product dependency, handled with the specified localized production empty state until a real source exists.

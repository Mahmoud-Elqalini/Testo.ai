---
description: "Execution tasks for the approved public Manjam homepage"
---

# Tasks: Public Manjam Home and Featured Courses

**Input**: Design documents from `specs/006-public-course-home/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, and `quickstart.md`

**Tests**: No automated test tasks are included because the feature spec does not request adding tests. The implementation still requires the manual visual and interaction review specified below.

## Phase 1: Foundations

**Purpose**: Add the shared page-scoped foundations required by all stories without changing legacy screen behavior.

- [X] T001 [P] Add Manjam semantic token values for the public-home scope to `src/app/globals.css` and route-specific responsive rules to `src/app/public-home.css`; leave existing shared legacy token mappings unchanged.
- [X] T002 [P] Add localized public-home navigation, hero, course-card, empty-state, footer, and accessibility copy to `src/locales/en.json` and `src/locales/ar.json`.

---

## Phase 2: User Story 1 - Discover Manjam and its courses (Priority: P1)

**Goal**: Signed-out visitors understand Manjam and can browse featured public courses or see an honest empty state.

**Independent Test**: Open `/` signed out with the seed disabled, then enable the local seed and confirm the same layout renders the localized empty and populated states without database writes.

### Implementation

- [X] T003 [US1] Build the public home content sections (hero, up to three course cards, benefits, footer, and localized loading/empty states) in `src/components/home/PublicHome.tsx`, using only serializable display props and the existing translation provider.
- [X] T004 [US1] Replace the root login redirect with the server-rendered public page and pass only the opt-in server seed to the content component in `src/app/page.tsx`; leave authenticated redirects to `src/proxy.ts` and expose route-specific Manjam metadata.

**Checkpoint**: Guests can open `/`; production/default development shows no fabricated courses, while explicitly enabled local preview shows the three synthetic cards.

---

## Phase 3: User Story 2 - Create an account or sign in (Priority: P1)

**Goal**: Visitors can reach existing sign-in and registration pages from the public header and footer.

**Independent Test**: Activate each account action from the public page at desktop and mobile widths and confirm it opens `/login` or `/register`.

### Implementation

- [X] T005 [US2] Add a root-only public header to `src/components/shared/SiteNavigation.tsx` with Manjam branding, preference controls, and account actions; omit section links and a menu trigger while preserving navigation on all other routes.
- [X] T006 [US2] Add sign-in and account-creation actions to the public header and footer using the existing `/login` and `/register` destinations in `src/components/shared/SiteNavigation.tsx` and `src/components/home/PublicHome.tsx`.

**Checkpoint**: Account actions remain reachable and truthful from both the header and footer.

---

## Phase 4: User Story 3 - Choose language, theme, and device layout (Priority: P2)

**Goal**: Visitors can change language and theme through existing state providers and use the navigation on narrow screens.

**Independent Test**: Switch language/theme, reload, and inspect wide, tablet, and narrow mobile header layouts in both directions without a public navigation menu.

### Implementation

- [X] T007 [US3] Add a compact toggle-switch presentation variant to `src/components/shared/PreferenceSwitcher.tsx` that calls the existing language/theme setters and preserves accessible names, state announcements, and 40px hit areas.
- [X] T008 [US3] Render the compact preference-control variant in the root navigation in `src/components/shared/SiteNavigation.tsx`; keep `I18nProvider`, `ThemeProvider`, cookie keys, and saved preference behavior unchanged.
- [X] T009 [US3] Implement responsive guest-header styles in `src/app/public-home.css` so the logo, language/theme controls, and account actions remain available without section links or a menu, mirrored correctly in RTL.

**Checkpoint**: Language and theme persist through existing providers; no horizontal overflow appears at narrow widths.

---

## Phase 5: User Story 4 - Use the page with accessible controls (Priority: P2)

**Goal**: Keyboard and assistive-technology users can navigate the public landing experience.

**Independent Test**: Navigate the page with keyboard only, activate both preference switches, and confirm focus and announcements remain clear.

### Implementation

- [X] T010 [US4] Add visible focus, switch state semantics, reduced-motion handling, Escape/overlay/menu-close behavior, and focus return for the public controls in `src/components/shared/PreferenceSwitcher.tsx`, `src/components/shared/SiteNavigation.tsx`, and `src/app/public-home.css`.

**Checkpoint**: Every enabled control has an accessible name, visible focus, and a working destination/action.

---

## Phase 6: Polish and Cross-Cutting Review

**Purpose**: Confirm the implementation follows the approved scope, visual contract, and Maintainability and Design Review in `plan.md`.

- [ ] T011 Review the public page in Arabic/RTL and English/LTR, light/dark, desktop/tablet/mobile; inspect keyboard focus, menu dismissal, preference persistence, production empty state, and opt-in local seed behavior using `specs/006-public-course-home/quickstart.md`.
- [X] T012 Confirm `src/lib/fixtures/public-home-course-seed.server.ts` is imported only from the server page boundary, live courses can take precedence if a source is added, no seed writes occur, no unrelated legacy token values changed, and the final implementation matches the SOLID/pattern decisions in `specs/006-public-course-home/plan.md`.

## Dependencies & Execution Order

### Phase Dependencies

- **Foundations (Phase 1)**: No dependencies; required before page stories.
- **User Story 1 (Phase 2)**: Depends on Phase 1 and delivers the public page MVP.
- **User Story 2 (Phase 3)**: Depends on the public root page in US1.
- **User Story 3 (Phase 4)**: Depends on the public navigation in US2 and reuses the existing preference providers.
- **User Story 4 (Phase 5)**: Depends on the public navigation and switches in US2/US3.
- **Polish (Phase 6)**: Depends on all desired stories.

### User Story Dependencies

- **US1 (P1)**: Independent after foundations; public content and truthful course states.
- **US2 (P1)**: Requires US1's root page, then adds existing account destinations.
- **US3 (P2)**: Requires the public navigation composition from US2.
- **US4 (P2)**: Requires the navigation and preference controls from US2/US3.

### Parallel Opportunities

- T001 and T002 can run in parallel because they update separate files.
- Within US2, header/navigation work and footer account links touch overlapping components and should be sequenced to avoid conflicts.
- Preference control styling (T007) can proceed independently from public content work after foundations; integration follows in T008.

## Implementation Strategy

### MVP First

1. Complete Foundations.
2. Complete US1 to make `/` public and render a real empty state or opt-in local seed cards.
3. Complete US2 so visitors can continue to existing authentication routes.
4. Add preferences, mobile navigation, accessibility, and final cross-state review.

## Notes

- `[P]` indicates tasks that can proceed in parallel on separate files.
- No database catalog, routes, migrations, or synthetic production records are created by these tasks.
- Automated tests are omitted because none were requested in the feature spec; complete the required visual and manual interaction review before reporting the UI work finished.

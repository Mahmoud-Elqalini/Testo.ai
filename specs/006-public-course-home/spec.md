# Feature Specification: Public Manjam Home and Featured Courses

**Feature Branch**: `[006-public-course-home]`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User request: Create a public home page for visitors that introduces Manjam, presents the site's most important courses, and provides a polished navigation bar with account creation, sign-in, language, and light/dark controls. Use the supplied Manjam logo and brand palette. The discussed concept includes a short hero, featured course cards, an introductory benefits section, and a footer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover Manjam and its courses (Priority: P1)

A visitor who is not signed in opens the site and immediately understands that Manjam is a learning platform. The visitor can scan a short introduction and browse the featured courses without creating an account first.

**Why this priority**: The public home page is the first experience for new visitors and the main way they discover what the platform offers.

**Independent Test**: Open the root page in a signed-out browser, inspect its content and course states, and confirm the visitor can understand the offering and reach existing account flows.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor with no saved preferences, **When** they open the root page, **Then** they see the Manjam public home page in English and the light theme.
2. **Given** publicly displayable courses exist, **When** the visitor reaches the featured section, **Then** the page displays the featured courses using only real, authorized course information.
3. **Given** no publicly displayable courses exist, **When** the visitor reaches the featured section, **Then** the page shows a concise localized empty state and no sample or development fixture courses.
4. **Given** the visitor selects an existing course card action, **When** that action has a valid existing destination, **Then** it navigates to that destination; otherwise, the card presents course information without a misleading enabled action.
5. **Given** a developer explicitly enables local preview data, **When** the page is viewed in a development environment with no live public courses, **Then** synthetic seed courses populate the cards without changing or writing to real system data.

### User Story 2 - Create an account or sign in (Priority: P1)

A visitor can find account creation and sign-in from the navigation bar and footer, then continue through the platform's existing authentication pages.

**Why this priority**: The public page should make it easy for interested visitors to enter the existing product without replacing its authentication behavior.

**Independent Test**: From desktop and mobile layouts, activate each account action and confirm it opens the existing registration or sign-in destination.

**Acceptance Scenarios**:

1. **Given** the visitor is on the home page, **When** they select “Create account” / “إنشاء حساب”, **Then** the existing registration page opens.
2. **Given** the visitor is on the home page, **When** they select “Sign in” / “تسجيل الدخول”, **Then** the existing sign-in page opens.
3. **Given** an authenticated user opens the root page, **When** their session is recognized, **Then** they are directed to their existing authorized dashboard experience.

### User Story 3 - Choose language, theme, and device layout (Priority: P2)

A visitor can switch between Arabic and English, switch between light and dark themes, and use the page on desktop or mobile without losing access to account actions.

**Why this priority**: The platform serves Arabic and English users and needs a comfortable first experience across preferences and screen sizes.

**Independent Test**: Exercise both language choices, both themes, reload the page, and inspect wide, tablet, and narrow mobile widths with keyboard and touch input.

**Acceptance Scenarios**:

1. **Given** the page is in Arabic, **When** the visitor switches language, **Then** all visible copy changes to English, direction changes to LTR, and directional elements mirror appropriately.
2. **Given** the page is in English, **When** the visitor switches language, **Then** all visible copy changes to Arabic, direction changes to RTL, and directional elements mirror appropriately.
3. **Given** the visitor switches theme, **When** the page updates, **Then** every page surface, text, control, and brand mark uses the selected theme with readable contrast.
4. **Given** the visitor has selected language or theme, **When** they reload or return, **Then** their saved preference is respected; visitors without a saved choice start in English and light mode.
5. **Given** the viewport is narrow, **When** the visitor opens the page, **Then** the header contains no section-navigation links or menu trigger and keeps the logo, language, theme, sign-in, and account-creation actions available without horizontal page scrolling.

### User Story 4 - Use the page with accessible controls (Priority: P2)

A visitor using a keyboard, assistive technology, or reduced-motion settings can understand and operate the public page's main controls and navigation.

**Why this priority**: The page is a public entry point and must remain usable for visitors with different access needs.

**Independent Test**: Navigate the page using keyboard only, inspect accessible names and focus visibility, and enable reduced motion.

**Acceptance Scenarios**:

1. **Given** the visitor uses a keyboard, **When** they move through the page, **Then** each enabled control is reachable in a logical order and has a visible focus indicator.
2. **Given** a language or theme switch is focused, **When** the visitor activates it with the keyboard, **Then** the state changes and is announced accessibly.
3. **Given** reduced motion is enabled, **When** the visitor uses the page, **Then** nonessential transitions and movement are minimized.

### Edge Cases

- A course has no cover image or optional descriptive information; its card remains readable and uses an approved neutral fallback instead of fabricated metadata.
- Course information is unavailable, fails to load, or is temporarily empty; the page shows a localized loading, error/retry, or empty state and does not show development fixtures as production content.
- A seed flag is mistakenly set outside local development; the seed remains unavailable and does not replace live data.
- Course titles, instructor names, or translated labels are long; cards remain readable and do not overlap or force horizontal scrolling.
- Long language and account labels at narrow widths; controls remain visible, readable, and free of horizontal overflow.
- The visitor switches theme or language while navigating with a keyboard; focus remains on the active control and the updated state is announced.
- A signed-in session expires or cannot be resolved while the root page is opening; the visitor is shown a safe public state or sent through the existing authentication handling without exposing private data.
- A footer destination such as contact, social media, or policy pages is not available; the page does not render a dead or invented link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The root page MUST present a public Manjam home page to signed-out visitors instead of sending them directly to sign-in.
- **FR-002**: The public home page MUST introduce Manjam with a concise hero message and a clear action that moves the visitor to the featured-courses section.
- **FR-003**: The page MUST provide sign-in and account-creation actions that lead to the existing authorized authentication destinations. The root header MUST contain only the Manjam logo, language and theme controls, sign-in, and account creation; it MUST NOT render section-navigation links or a menu trigger. In-page calls to action may link to existing page sections.
- **FR-004**: The page MUST display featured course cards using only real course data that is approved for public display. It MUST NOT expose private course or student information, invent course details, or use development fixtures as production records.
- **FR-005**: Course cards MUST show only fields available from the approved course source. Optional information MUST be omitted or given a neutral visual fallback when unavailable.
- **FR-006**: The page MUST show localized loading, empty, and recoverable error states for the featured-course section. Empty and error states MUST NOT contain fabricated records.
- **FR-007**: The page MUST NOT enable course actions that promise unavailable destinations or actions. Existing sign-in and registration destinations MUST remain the only account actions in scope.
- **FR-008**: The page MUST include a concise benefits/about section and a footer with the Manjam identity, links to existing destinations, and a copyright notice. Contact, social, and policy links MUST appear only when their real destinations are configured.
- **FR-009**: The page MUST support Arabic and English. English MUST be the default when no saved language preference exists; Arabic MUST use RTL and English MUST use LTR. All visible labels, helper text, empty/error states, and accessibility names MUST be localized in both languages.
- **FR-010**: The page MUST support light and dark themes, defaulting to light when no saved theme preference exists. The selected preference MUST persist according to the existing preference behavior.
- **FR-011**: Language and theme controls MUST be compact toggle switches in the header, visually integrated with the Manjam palette. The visible switch track and label MUST remain visually restrained within the compact header, while the interactive hit area MUST remain at least 40 by 40 CSS pixels. Each switch MUST expose its current state and the language/theme it will switch to through an accessible name or equivalent announcement.
- **FR-012**: The page MUST use the supplied Manjam logo assets, selecting the matching logo variant for the active theme without showing the wrong variant during page initialization.
- **FR-013**: The brand palette for this page MUST follow the owner-provided Manjam colors:

| Role | Value |
|---|---|
| Navy 900 | `#0E1020` |
| Navy 800 | `#171A33` |
| Ring indigo | `#2A3068` |
| Cream | `#F6F1E4` |
| Gold | `#F5B83D` |
| Gold light | `#FFD76E` |
| Gold deep | `#D98A0F` |
| Light background | `#FBF8F0` |
| Light surface | `#FFFFFF` |
| Light raised surface | `#F6F1E4` |
| Light text | `#171A33` |
| Light muted text | `#505577` |
| Dark background | `#0E1020` |
| Dark surface | `#171A33` |
| Dark raised surface | `#1F2347` |
| Dark text | `#F6F1E4` |
| Dark muted text | `#B8B5CC` |
Semantic control colors MUST use these values:

| Role | Light | Dark |
|---|---|---|
| Primary action | `#171A33` | `#F5B83D` |
| Text on primary | `#F6F1E4` | `#0E1020` |
| Primary hover | `#2A3068` | `#FFD76E` |
| Accent text | `#9A5A05` | `#F5B83D` |
| Subtle border | `#D9D2BC` | `#2E3470` |
| Strong control border | `#767B99` | `#6068AE` |
| Focus ring | `#171A33` | `#F5B83D` |

- **FR-014**: In the light theme, primary actions MUST use navy fill with cream text; gold-toned emphasis text MUST use the approved contrast-safe darker gold. In the dark theme, primary actions MUST use gold fill with navy text. Gold MUST NOT be used as small text or a thin line on a light surface. The page MUST NOT use violet styling. Gradients are limited to subtle navy brand backgrounds and logo-derived decorative accents.
- **FR-015**: Normal text MUST meet a contrast ratio of at least 4.5:1; large text and user-interface component boundaries MUST meet at least 3:1. The verified brand pairings MUST preserve the owner-provided minimum ratios (including light accent text against the background at 5.15:1, light strong borders against the background at 3.91:1, dark muted text against surfaces at 8.54:1, and dark strong borders against the background at 3.67:1). Any additional color pairing MUST be checked against the same contrast rules before use. The page MUST provide visible keyboard focus, use semantic controls, and respect reduced-motion preferences.
- **FR-016**: The page MUST adapt to desktop, tablet, and narrow mobile widths without clipped controls, overlapping content, or horizontal page scrolling. The narrow root header MUST retain the logo, both preference controls, and both account links without adding a navigation menu.
- **FR-017**: When an authenticated user opens the root page, the system MUST preserve the existing role-aware destination and authorization behavior rather than exposing guest-only content or changing permissions.
- **FR-018**: The page MUST preserve the existing registration, sign-in, language, theme, and account-preference behavior; it MUST NOT introduce a second independent preference system.
- **FR-019**: Synthetic home-page seed data MAY be used to preview the page only when a developer explicitly enables it in a local development environment. The seed MUST be server-gated, MUST NOT be written to Supabase or another production data store, and MUST never be included in a production visitor response.
- **FR-020**: The real public course source MUST take precedence whenever it returns eligible courses. The seed MUST only fill the preview when no real public courses are available in local development and the explicit preview setting is enabled.
- **FR-021**: The seed MUST be isolated in one clearly named fixture file and removable by deleting that file, its single call site, and the local setting, without requiring database cleanup, schema changes, migrations, or changes to authentication and other user data.

### Experience Layout and Interaction Details

- The public page is a single continuous landing experience. Its order is: global header, welcome hero, featured courses, concise benefits/about section, then footer.
- On all screens, the root header shows the horizontal Manjam logo, compact language and theme switches, and separate sign-in and account-creation actions. It contains no section links or menu trigger; page sections remain reachable through in-page calls to action and content links.
- On narrow screens, the logo, preference switches, and account actions remain visible and usable without crowding or horizontal overflow. The language switch names the destination language in its own script: “عربي” in English and “English” in Arabic.
- The hero contains a short brand-oriented eyebrow, one clear headline, brief supporting copy, a primary action that moves to the featured-courses section, and an optional secondary action to the existing registration page. Decorative illustration may use logo-derived shapes but MUST NOT imply unverified course counts, learner totals, ratings, or outcomes.
- The featured section has a heading and brief introduction, followed by up to three courses in the initial wide-screen view. Cards form three columns on wide screens, two on tablet-sized screens, and one on narrow screens. Each card uses only available public course fields, prioritizing a cover (or neutral fallback), category where available, title, instructor where available, and a short description where available. Rating, price, enrollment totals, badges, and enrollment actions are shown only if supported by real public data and a valid existing action.
- The benefits/about section contains a small number of concise statements about real platform capabilities. It MUST NOT claim services, support guarantees, or outcomes the platform does not provide.
- The footer repeats the Manjam identity and provides only working links to existing destinations. It includes the existing sign-in and registration destinations; contact, social, and policy links are conditional on real configured destinations.
- Content and interaction wording is localized. Brand name display follows the active interface language: “Manjam” in English and “منجم” in Arabic. Marketing copy can be refined during implementation, but must keep the meaning and claims within this specification.
### Key Entities *(include if feature involves data)*

- **Visitor**: A signed-out person who can browse public information, change display preferences, and choose sign-in or account creation.
- **Featured course**: A course record approved for public presentation, with only the existing public fields available to the page.
- **Display preference**: The visitor's or user's selected language and theme, subject to the platform's existing preference persistence behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of first-time visitors in a usability review can identify what Manjam offers and locate the featured-course section within 10 seconds.
- **SC-002**: 100% of course cards shown in production correspond to real records approved for public display; zero development fixture records appear to visitors.
- **SC-003**: A visitor can reach sign-in or account creation from the page in one activation from desktop and mobile layouts.
- **SC-004**: At 320 CSS pixels and wider, the page has no horizontal page scrolling, clipped primary controls, or overlapping text in Arabic or English.
- **SC-005**: All visible page content and controls remain usable in the four combinations of Arabic/RTL, English/LTR, light theme, and dark theme.
- **SC-006**: A visitor's saved language and theme choices are still active after a page reload.
- **SC-007**: Every enabled control is keyboard reachable, has a visible focus state, and performs the action its label promises.
- **SC-008**: When course data is empty or unavailable, visitors see an appropriate localized state and are never shown fabricated sample content.
- **SC-009**: With preview data disabled or in production, the seed contributes zero course records and performs zero database writes.
- **SC-010**: A developer can enable or remove the local preview seed by changing one local setting and removing one isolated fixture integration, without changing production data or schema.

## Assumptions

- The root page is the public entry for signed-out visitors. Authenticated visitors continue to their existing role-aware dashboard destination.
- English and light mode are defaults for a visitor without saved preferences, following the current project-wide UI guidance.
- The first desktop presentation may show up to three featured courses, consistent with the reviewed visual concept. Course ordering and eligibility must come from the existing approved data source; this feature does not invent a curation field or ranking algorithm.
- The current production course catalog and course detail routes are not available. The page must use a localized empty state until a real public course source is available; creating a course management system or a new course-detail route is outside this feature's scope.
- Synthetic localized seed records exist only to inspect the visual course-card state during local development. They are not canonical course content and do not model or mutate production records.
- The page reuses the existing authentication and preference flows. It does not create new account roles, permissions, or theme/language persistence rules.
- Contact details, social accounts, legal pages, ratings, enrollment counts, prices, and instructor biographies are omitted unless they already exist as approved data and have real destinations where applicable.
- The current root-route behavior and shared design-system documentation still describe the legacy experience. The implementation plan MUST reconcile these sources of truth with the approved public-home and Manjam palette decisions before changing user-facing screens; migrating unrelated legacy screens remains outside this feature.


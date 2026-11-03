# Manjam UI Design System

This is the persistent, self-contained visual contract for Manjam (منجم). Read it before implementing or restyling UI. Production code, live data, authorization, and domain logic remain authoritative. The visual rules below capture the approved brand and product experience and do not depend on a reference project being present in the repository.

## Visual principles

- Calm, polished education product: warm cream and white surfaces, deep navy text, restrained gold emphasis, quiet borders, generous whitespace, and clear hierarchy.
- Keep screens focused and scannable. Prefer a small number of well-structured cards and sections over dense dashboards, heavy decoration, or oversized empty areas.
- Use soft shadows and rounded corners sparingly to distinguish surfaces. Avoid harsh black shadows, strong gradients outside the brand mark, and unrelated accent colors.
- Use consistent shared navigation, page headers, buttons, fields, cards, badges, tables/lists, dialogs, and empty/loading/error states.
- Manjam navy and gold communicate brand and primary actions according to the active theme. Semantic success, warning, and danger colors retain their existing meanings. Do not use color alone to communicate state.
- The entire UI uses the Manjam palette below. Migrate existing screens to these colors as part of the full-UI rebrand; do not introduce or extend legacy brand colors.

## Manjam Brand Palette (single source of truth)

Decision: the whole UI uses the Manjam logo colors. Violet and the violet-to-indigo gradient are retired. Values are defined ONLY in `src/app/globals.css` as semantic tokens; components and CSS files must use tokens, never raw hex/rgb/hsl and never Tailwind violet/indigo/purple/fuchsia classes. Token NAMES stay as they are today; only their VALUES change. If a needed semantic role has no token yet, add one in globals.css, never hardcode.

### Brand constants (theme-independent)
| name | hex | source |
|---|---|---|
| navy-900 | #0E1020 | logo background |
| navy-800 | #171A33 | logo ring fill |
| navy-600 | #2A3068 | logo ring (light variant interior) |
| cream | #F6F1E4 | logo ring / wordmark |
| gold | #F5B83D | logo, decorative accents, and accent text in Dark |
| gold-light | #FFD76E | logo sparkle / hover on dark |
| gold-deep | #D98A0F | logo trail |
| action-gold | #FFB81C | button fills (matches the shipped public home) |
| action-gold-hover | #FFC63D | button hover |
| ink | #14110A | text on action-gold |

### Semantic tokens by theme
| role | Dark | Light |
|---|---|---|
| background | #0E1020 | #FBF8F0 |
| surface | #171A33 | #FFFFFF |
| surface-raised | #1F2347 | #F6F1E4 |
| text | #F6F1E4 | #171A33 |
| text-muted | #B8B5CC | #505577 |
| primary (action fill, fills ONLY) | #FFB81C | #FFB81C |
| on-primary (text on action) | #14110A | #14110A |
| primary-hover | #FFC63D | #FFC63D |
| primary-soft (chips, active backgrounds) | #F5B83D mixed into #171A33 at 15% | #FDF1D6 |
| primary-soft-strong | #F5B83D mixed into #171A33 at 20% | #FCEBC4 |
| accent-text / primary-text (text, icons, borders, active indicators) | #F5B83D | #9A5A05 |
| border-subtle (decorative dividers only) | #2E3470 | #D9D2BC |
| border-strong (inputs, controls, focus-adjacent) | #6068AE | #767B99 |
| focus-ring | #F5B83D | #171A33 |
| hero background gradient start/end | #171A33 / #2A3068 | #171A33 / #2A3068 |

Hero text uses cream `#F6F1E4`; muted hero text uses `#B8B5CC`.

### Verified contrast (WCAG 2.x)
Dark: text/background 16.72, text/surface 15.11, text-muted/surface 8.54, on-primary/primary 10.88, on-primary/primary-hover 12.02, primary/dark-background 10.89, primary/dark-surface 9.84, accent-text/surface 9.58, border-strong/background 3.67, focus-ring/dark-surface 9.58.
Light: text/background 16.06, text/surface 17.05, text-muted/background 6.81, on-primary/primary 10.88, on-primary/primary-hover 12.02, primary/light-background 1.63 (shape only; the label text identifies the button, so a visible focus ring is mandatory), accent-text/light-background 5.15, accent-text/light-surface 5.47, border-strong/background 3.91, focus-ring/light-background 16.06.
accent-text/primary-soft 4.88 (Light), accent-text/primary-soft-strong 4.64 (Light), accent-text/primary-soft 7.05 (Dark), accent-text/primary-soft-strong 6.23 (Dark).
Rules: normal text >= 4.5:1; large text and UI component boundaries >= 3:1. Any new color pair must be checked and added to this table before use.

### Usage rules
- Gold (#F5B83D) is NEVER used as text or as a thin line on a light background (contrast 1.7:1). On light theme use accent-text (#9A5A05) for gold-toned text and navy for primary actions.
- Primary action: vivid gold fill (`primary`) with dark ink text (`on-primary`) in both themes. `primary` is for FILLS only. Icons, text, borders, and active indicators must use `primary-text`/accent-text so they pass contrast on light surfaces; gold must never be used as text or as a thin line on a light background. Gold buttons on light backgrounds must show the 2px focus-ring token with an offset.
- The dashboard hero uses the hero gradient tokens (`#171A33` to `#2A3068`) in both themes. A subtle navy-900 (`#0E1020`) to navy-800 (`#171A33`) gradient is allowed on auth backgrounds only. A gold to gold-deep gradient is allowed only on logo-derived decorative accents. Never violet or indigo.
- Status colors (success, warning, danger) are unchanged and semantic. Because brand gold is close to warning amber, warning states MUST always include an icon and text label, never color alone.
- Both themes (light/dark) and both directions (RTL Arabic / LTR English) must remain fully supported (Constitution principle on bilingual + theme-adaptive UI).

### Logo usage
Assets live in `public/images/logo/` (`manjam-symbol`, `manjam-logo-vertical`, `manjam-logo-horizontal`, `manjam-favicon`; each in `-dark` and `-light` variants). `-dark` means the version for dark backgrounds; `-light` for light backgrounds. Symbol alone for small spaces (header/sidebar, <= 48px tall); horizontal lockup for auth pages and wide headers; vertical lockup for splash/empty/hero states; favicon pair for browser icons. The logo must switch with the ACTIVE APP THEME without a hydration flash; the exact mechanism is decided in the implementation phase. Name display: "منجم" in Arabic UI, "Manjam" in English UI (from i18n, not hardcoded).

### Token migration notes

The legacy `--exam-*` tokens (teal) are retired in the implementation phase and remapped to the shared roles (accent -> primary-text, soft -> surface-raised, ink -> text, muted -> text-muted, line -> border-subtle).

During implementation the scoped `--manjam-*` and `--manjam-home-*` tokens in `src/app/globals.css` are consolidated into the shared semantic tokens. Until that is done they must carry exactly the values defined in this document.

## Design tokens

All visual tokens are defined in [src/app/globals.css](./src/app/globals.css) with CSS custom properties and Tailwind v4 `@theme`. Components and screen styles consume these semantic values. Keep the existing success, warning, and danger semantic tokens unless a separately approved change is needed.

Success, warning, and danger color values are unchanged and semantic. Dark-theme soft backgrounds that mix a status or brand color into a surface (color-mix) use the Manjam dark surface #171A33 as the mix base, never the legacy slate #1E293B. Neutral chip colors follow the Manjam palette:

| Role | Light | Dark |
|---|---|---|
| Success / soft / border / text | `#10B981` / `#ECFDF5` / `#A7F3D0` / `#047857` | `#10B981` / 15% `#10B981` mixed into `#171A33` / `#047857` / `#6EE7B7` |
| Warning soft / border / text | `#FEF3C7` / `#FDE68A` / `#B45309` | 15% `#B45309` mixed into `#171A33` / `#B45309` / `#FCD34D` |
| Danger soft / border / text | `#FEE2E2` / `#FECACA` / `#B91C1C` | 15% `#B91C1C` mixed into `#171A33` / `#B91C1C` / `#FCA5A5` |
| Neutral chip background / text | `#F6F1E4` / `#171A33` | `#2E3470` / `#F6F1E4` |

Resulting dark soft backgrounds are approximately success #16323F, warning #2F232D, danger #2F1A30, with text contrast 8.82, 10.41 and 8.44.

Warning states MUST always include an icon and text label; never communicate warning by color alone.

Radius tokens are `sm: 8px`, `md: 12px`, `lg: 16px`, `xl: 24px`, and `full: 9999px`. Tailwind utilities `rounded-sm/md/lg/xl/full` map to these values. Shadows are `sm: 0 1px 2px rgb(15 23 42 / 8%)` and `md: 0 8px 24px rgb(15 23 42 / 12%)`, exposed as `shadow-sm` and `shadow-md`. Spacing uses Tailwind's 4px scale. Motion tokens are `duration-fast: 150ms` and `duration-base: 250ms`. The exam workspace uses the shared Manjam brand palette; semantic status colors retain their existing meanings.
## Typography, icons, and shape

- Keep the existing font loading: Geist and Geist Mono through `next/font/google`, with DM Sans and Cairo from the existing Google Fonts CSS import. Reference the stacks through the `--font-sans`, `--font-ui`, and `--font-arabic` tokens.
- Base text is approximately 14px with 1.5 line height. Secondary labels and metadata are compact but readable (usually 10–13px); page titles are about 27–30px and section headings are about 16–20px on the unified dashboard.
- Use clear weight and spacing hierarchy: bold, letter-spaced small eyebrow/date labels; a strong page title; muted supporting text.
- Use radius and shadow tokens from the design-token section. Primary buttons use the theme-specific Manjam action treatment and maintain a 40px minimum touch target. Secondary buttons use a surface fill and subtle border.
- Use `lucide-react` for interface icons. Use 16, 20, or 24px sizes and stroke width 2. Decorative icons have `aria-hidden="true"`; icon-only controls have a localized accessible label.
- Interactive elements use the 150ms or 250ms motion tokens, visible focus, disabled states, and reduced-motion preferences.

## Shell

- Every application route uses the shared sticky, 64px surface header with a bottom border, linked Manjam logo, hamburger, language, and theme controls. The public home route uses the homepage navigation composition documented below. In LTR the shared-shell controls are left and brand is right; in RTL the controls are right and brand is left. The hamburger opens the same role-aware drawer everywhere. Keep compact spacing so the header fits at 360px.
- Header and drawer controls have 40px hit areas to meet the touch target requirement. The language toggle shows the language it switches to (`AR` in English, `EN` in Arabic), updates the shared language provider and document direction, and saves through the existing preference service. The theme toggle uses the shared provider and saved preference; new accounts continue to default to light mode.
- Desktop course search appears inline from `lg` (1024px), grows from 320px to 420px at `xl` (1280px), and uses the shared `src/lib/search/course-search.ts` data boundary. The UI imports only that service, never course fixtures. Search waits 250ms before querying, aborts older work, requires two characters, and shows loading, empty, error, and idle states. The current service searches legacy development fixtures behind `NEXT_PUBLIC_USE_MOCK_COURSES` (legacy identifier, renamed in a later phase); result selection displays a localized notice because course routes do not exist.
- Below `lg`, search becomes an icon button that opens an auto-focused full-width search bar and results sheet. `/` focuses or opens search outside editable fields; arrow keys, Home/End, Enter, Escape, click-outside, and focus return are supported. Result options use `aria-activedescendant`, a listbox, and a polite result-count announcement.
- The global drawer is available at every viewport. It is 280px wide, capped at 85vw, enters from the logical start side, and uses a lightly blurred overlay. Escape, overlay click, close button, navigation, body scroll lock, a focus trap, and focus return are supported. Reduced-motion settings remove shell transitions.
- Navigation uses lucide-react icons with 16/20/24px size and stroke width 2. Signed-in users see Dashboard and their existing role-specific Groups and Exams destinations; guests see Login and Register. My Courses, Explore Courses, and Settings remain visible as disabled items with a neutral “Soon” badge until their pages exist. Role workspaces use this shared drawer instead of a duplicate sidebar.
- Navigation and search icons use the contrast-safe shell icon token, derived from `subtle` in light mode and equal to `subtle` in dark mode.
- The user card is pinned to the drawer bottom and shows the user's profile image when one is available; otherwise show the first character of their name as the avatar. Keep the full name truncated with a title attribute and show the localized Admin/Student role. The current `profiles` schema has no image field or upload flow, so use the initial until profile photo settings and storage are implemented.
- Logout sits beside the user identity in the account card at the bottom of the drawer and calls the existing sign-out handler. Search rows and the View all action do not invent course routes; both use the selection callback and show the localized route-unavailable notice.

## Shared application shell (all routes)

- Every route shares the global header and role-aware drawer. Do not add a second persistent navigation sidebar or another page-level logo.
- Main area: page-specific content may use a slim breadcrumb/save-status bar and padded content region. Align page content to a comfortable readable width and keep consistent horizontal gutters.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `border-inline-*`, `text-align: start`) so the shell mirrors correctly in Arabic RTL.
- Mobile: keep the global header and drawer available, reduce page gutters, and stack content and actions without horizontal overflow.
- Exam-taking focus mode keeps the shared app header while removing the page sidebar and breadcrumb, preserving the exam content and save status.

## Screen composition

### Public entry and authentication

- The public root route (`/`) is the Manjam landing page for signed-out visitors. Authenticated visitors continue to their existing authorized dashboard destination.
- The landing page uses the Manjam horizontal logo, concise hero, featured courses, a short benefits section, and a footer with brand/about copy, account links, and contact information. Its header contains only the linked logo, compact language and theme switches, sign-in, and account creation; it has no section-navigation links or mobile menu. Keep those actions usable at narrow widths and reach page sections through in-page calls to action. Clearly label placeholder contact values until approved real details are available.
- The public header, hero card, section content, and footer content share the same centered 1475px container with responsive gutters. The reference desktop rhythm uses a 104px header, an 80px header-to-hero gap, an 88px hero-to-courses gap, and a 40px heading-to-card gap; scale these values down at narrower widths.
- The public home uses the shared Manjam semantic palette for vivid gold fills and decorative accents. Use the accessible accent-text token for gold-toned text over light surfaces and the gold token for text over dark surfaces.
- Show only real, approved public course data. The production course catalog is not yet available; until it exists, production uses a localized empty state and never falls back to development fixtures.
- The isolated public-home seed may be used only in local development when `MANJAM_PUBLIC_HOME_SEED=true` is set in the ignored root `.env.local`. It lives in `src/lib/fixtures/public-home-course-seed.server.ts`, uses no database writes, and is never exposed in production. Real public courses always take precedence. Remove the setting, its single integration call, and the fixture file to remove it.
- Keep account creation accessible from the registration link on the sign-in screen. Preserve the existing sign-in, registration, localization, and authentication flows.
- Authentication routes use the shared header and guest drawer. Do not add a second Manjam logo or page-specific language/theme controls inside authentication screens.
- Authentication panel eyebrow/kicker must match the current auth state and the page heading in the active language (sign in, register, reset password, or set new password). Never hard-code a sign-in label across registration or recovery screens; audit all auth states and success/loading variants when changing shared auth UI.

### Admin dashboard

- Page heading/date and one prominent create action.
- Four compact metric cards in a row on wide screens, each with a soft accent icon, label, clear value, and brief muted note.
- A main schedule/list panel with a clear header and concise rows; status badges and row actions are restrained and aligned consistently.
- Secondary management/creation actions appear as supporting cards beneath the primary content.

### Exam setup

- Heading and short supporting description above a two-column form layout.
- Primary form column contains grouped cards with icon/title/description headers, aligned labels, fields, selectable options, and comfortable vertical rhythm.
- Secondary summary/actions column is narrower (about 300–310px) and sticky on larger screens; on small screens it returns to normal flow below the form.
- Make selected, validation, helper, and warning states legible and consistent with the semantic palette.

### Unified account dashboard (`/dashboard`)

- Use a full-width page with no persistent sidebar at any viewport size. Keep the content focused on the authenticated user's real learning and teaching activity.
- Header: a surface 64px bar with a thin bottom border and the provided Manjam symbol/wordmark assets, not a text `T`. Center the brand row vertically. Use English when no language preference has been saved; respect an existing saved preference. In LTR, place the hamburger opposite the language/theme controls and make the drawer enter from the hamburger's physical side. Mirror these sides in RTL. Use compact, accessible controls with at least 40px hit areas. Keep the header usable at every viewport size and do not render duplicate preference controls.
- The language control switches immediately, updates the page `lang` and `dir`, and persists through the existing language preference flow. The theme control uses the shared theme provider, preserves saved preferences, and follows the product's light default for new accounts.
- The greeting uses the user's first name only, stays on one line when space allows, and includes a waving hand. Show the authenticated role in the badge and use the established role-appropriate actions. Use a subtle navy brand background only where it supports the hierarchy; do not use violet-to-indigo gradients. The dashboard hero uses the hero gradient tokens in BOTH themes and must never be built from `primary`/`primary-hover` (which are gold).
- Use the section titles **Continue Learning**, **Explore Featured Courses**, **My Groups Overview**, and **Upcoming & Recent Exams**. Section headings use semantic brand accent icons and a semibold **View All** link on the right without an arrow. Use the shared lucide-react icon convention described above for section and navigation icons.
- Loading is section-shaped skeleton UI with a shimmer, including the hero and every data section. Replace it with localized data or an empty/error state when loading completes; do not leave blank regions that suddenly populate.
- Continue Learning cards are about half-width on desktop and full-width on mobile. Include an 80px rounded thumbnail, uppercase semantic accent category, course title and instructor, divider, progress label and percentage, and a Manjam brand-colored progress bar. Add a compact Continue action only when a real course destination exists; make the card itself a link only when it has that same valid destination.
- In RTL, fill progress bars from right to left and mirror directional icons. Use logical properties so alignment and control placement follow document direction.
- Featured courses use a two-column desktop grid and one column on mobile. Course covers are about 220px tall with a white category badge, followed by rating, enrollment count, title, instructor, and a full-width Enroll button. Use the theme-specific Manjam primary action for available courses and a semantic enrolled state. Initially show four courses and provide a centered Show more control when additional real courses exist.
- The production course catalog and course routes are not part of the current data model. Legacy course fixtures live in `src/lib/fixtures/courses.ts` and use `NEXT_PUBLIC_USE_MOCK_COURSES` (legacy identifier, renamed in a later phase). Keep them separate from the public-home seed. Mock enrollment and progress actions stay disabled. In production, use a localized empty state and a valid existing action; never invent a route or interaction.
- Present groups in a **My Groups Overview** section. On wide screens, place two equal-width panels side by side: groups the user manages (instructor) and groups they joined (student). Each panel has a small uppercase/muted label, a compact count badge, a divider, and concise group rows. Stack the panels on narrow screens.
- Group rows show only real authorized fields: the group name, available member/instructor details, and a restrained role badge. Managed-group invitation codes may be copied only when the real usable code is available to the current user; announce a successful copy accessibly. Never invent a count, code, instructor, or role. Make each row or its clear action link to the existing authorized destination.
- Present upcoming/recent exams as a full-width section with its icon, title, and “View all” action above a separate bordered content panel. Keep the section heading treatment consistent with the other dashboard section headings. Use compact rows inside the panel; each row uses the real exam title, group/context and duration as supporting text, plus a clearly styled date/status at the opposite edge.
- Date pills use amber for later upcoming exams, red for today/tomorrow, and gray for past exams, with border and text colors from the semantic status palette.
- Keep dashboard cards on semantic light/dark surfaces, with quiet borders, 16px corners, restrained Manjam brand accents, and comfortable spacing. Avoid decorative gradients outside approved navy hero/auth backgrounds and oversized empty areas in data panels.
- Render groups, exams, counts, roles, and statuses only from the authenticated user's actual data and permissions. Never copy sample names, codes, counts, or dates from a reference. If a category is unavailable for the current account, retain the paired group panel and show a concise localized empty state without implying a role or access the user does not have. Keep real group and exam data authoritative in development too; the development mock flag applies only to features with no production model.
- Preserve the existing dashboard routes, Supabase queries, authorization checks, and interactions. Treat the two panels as a presentation of the current role/data model, not as a reason to add a second role or alter permissions.

### Theme defaults

- New users and users without a saved preference start in **light** theme. Respect an existing saved theme preference and let users switch to dark from the existing theme option. Theme changes must use the shared theme provider/tokens and persist according to the existing preference flow; do not add a competing per-page theme setting.

### Global navigation drawer (all viewport sizes)

- The hamburger opens the navigation drawer on desktop, tablet, and mobile. There is no persistent sidebar or horizontal navigation row. Use a 280px drawer capped at 85vw, full viewport height. The drawer enters from the same physical side as the hamburger: from the left in LTR and from the right in RTL.
- Place a softly blurred overlay behind the drawer (`rgba(15, 23, 42, 0.35)` with 4px blur). Keep the header above the overlay and the drawer above both; keep the hamburger itself above the overlay, sharp, and clickable so it can close the drawer.
- The drawer has a branded top row with an X close button, the same authorized links and active state, and a user card anchored to the bottom with profile image or fallback initial, name, role, and the existing sign-out action. Do not add duplicate language or theme controls inside the drawer; both preferences stay available in the header.
- Support the hamburger toggle, close button, overlay click, Escape, and navigation-link close. Lock background scrolling while open, move keyboard focus into the drawer, keep Tab focus inside it, and return focus to the hamburger after closing.
- Use shared theme tokens, logical CSS properties, visible focus styles, and reduced-motion behavior. Keep the menu button, language pill, and theme button from wrapping or overflowing at narrow widths.

### Exam taking

- Use a calm, low-distraction workspace and a restrained Manjam brand action/progress accent.
- Show exam identity and session status first, then a clear time/saved-status strip.
- On desktop, use a large question panel beside a narrow question navigator (about 280px). On mobile, stack them and keep navigation usable.
- Answers are large, full-width selectable rows with a visible selected state; question numbers distinguish current, answered, and review states.
- Keep previous/next/submit controls together in a stable footer. Confirm submission in a centered, accessible dialog and show a calm completion state.

## Responsive and language behavior

- Use only the shared responsive breakpoints: 640px (`sm`), 1024px (`lg`), and 1280px (`xl`). No `md:` or `2xl:` variants are currently used in `src/`; keep their tokens defined if such variants are introduced later.
- Treat these as guidance, not rigid magic numbers. Prevent clipping and horizontal scrolling at all widths; preserve comfortable touch targets.
- Support both Arabic RTL and English LTR. Use logical alignment/spacing, localize all visible copy, format dates/numbers for the active language, and verify both directions after layout changes. In RTL, mirror directional arrows and progress fills, place the drawer at the right edge, and let the language/theme/hamburger group follow the logical opposite side of the brand.
- Keep light and dark themes intentional: map semantic tokens for every surface, text, border, status, focus, and selected state. Never leave a light-only literal on a dark screen if it harms contrast.

## Rules for agents

- Use shared design tokens only; do not add hard-coded hex colors or pixel values in components.
- Use logical CSS properties only.
- Every interactive element needs hover, focus, and disabled states where applicable.
- Every list needs loading, empty, and error states.
- Do not add fonts or icon sets without approval.
- Navigation items whose destination pages do not exist must show a small “Soon” badge.

## Implementation rule

Adapt these visual rules to the production Next.js architecture in `src/`. Reuse shared components and semantic tokens; do not copy the mockup's framework, hard-coded production content, or app state. Keep the public-home preview fixture explicit, server-only, isolated, and behind the development-only flag documented above. Before finishing UI work, inspect the changed screen in English and Arabic, light and dark themes, desktop and mobile sizes, and confirm existing production data and interactions still drive the interface.

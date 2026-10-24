# Testo UI Design System

This is the persistent, self-contained visual contract for all Testo screens. Read it before implementing or restyling UI. Testo's production code, live data, authorization, and domain logic remain authoritative. The visual rules below capture the approved reference design and do not depend on the reference project being present in the repository.

## Visual principles

- Calm, polished education product: light cool-gray canvas, white surfaces, restrained violet accents, quiet borders, generous whitespace, and clear hierarchy.
- Keep screens focused and scannable. Prefer a small number of well-structured cards and sections over dense dashboards, heavy decoration, or oversized empty areas.
- Use soft shadows and rounded corners sparingly to distinguish surfaces. Avoid harsh black shadows, strong gradients outside the brand mark, and unrelated accent colors.
- Use consistent shared navigation, page headers, buttons, fields, cards, badges, tables/lists, dialogs, and empty/loading/error states.
- Primary violet communicates the main action and active navigation. Teal/green indicate progress or success; amber indicates attention/review; red indicates destructive or error states. Do not use color alone to communicate state.

## Design tokens

All visual tokens are defined in [src/app/globals.css](./src/app/globals.css) with CSS custom properties and Tailwind v4 `@theme`. Components and screen styles consume these semantic values.

| Role | Light | Dark |
| --- | --- | --- |
| Page background | `#F8FAFC` | `#0F172A` |
| Surface | `#FFFFFF` | `#1E293B` |
| Soft surface | `#F8FAFC` | `#263449` |
| Border | `#E2E8F0` | `#334155` |
| Text | `#0F172A` | `#F1F5F9` |
| Muted / subtle | `#64748B` / `#94A3B8` | `#94A3B8` / `#94A3B8` |
| Primary / hover | `#7C3AED` / `#6D28D9` | `#7C3AED` / `#6D28D9` |
| Primary text | `#6D28D9` | `#A78BFA` |
| Primary soft / stronger soft | `#F5F3FF` / `#EDE9FE` | 15% / 20% `#7C3AED` mixed into `#1E293B` |
| Hero gradient | `#6D28D9` to `#4F46E5` | same |
| Success / soft / border / text | `#10B981` / `#ECFDF5` / `#A7F3D0` / `#047857` | `#10B981` / 15% `#10B981` mixed into `#1E293B` / `#047857` / `#6EE7B7` |
| Warning soft / border / text | `#FEF3C7` / `#FDE68A` / `#B45309` | 15% `#B45309` mixed into `#1E293B` / `#B45309` / `#FCD34D` |
| Danger soft / border / text | `#FEE2E2` / `#FECACA` / `#B91C1C` | 15% `#B91C1C` mixed into `#1E293B` / `#B91C1C` / `#FCA5A5` |
| Neutral chip background / text | `#F1F5F9` / `#334155` | `#334155` / `#F1F5F9` |

Use `muted` for secondary text. The `subtle` token is reserved for non-text decoration; `#94A3B8` does not meet 4.5:1 contrast on light surfaces.

Radius tokens are `sm: 8px`, `md: 12px`, `lg: 16px`, `xl: 24px`, and `full: 9999px`. Tailwind utilities `rounded-sm/md/lg/xl/full` map to these values. Shadows are `sm: 0 1px 2px rgb(15 23 42 / 8%)` and `md: 0 8px 24px rgb(15 23 42 / 12%)`, exposed as `shadow-sm` and `shadow-md`. Spacing uses Tailwind's 4px scale. Motion tokens are `duration-fast: 150ms` and `duration-base: 250ms`. The exam workspace keeps its semantic green accent as tokens in the same file.
## Typography, icons, and shape

- Keep the existing font loading: Geist and Geist Mono through `next/font/google`, with DM Sans and Cairo from the existing Google Fonts CSS import. Reference the stacks through the `--font-sans`, `--font-ui`, and `--font-arabic` tokens.
- Base text is approximately 14px with 1.5 line height. Secondary labels and metadata are compact but readable (usually 10–13px); page titles are about 27–30px and section headings are about 16–20px on the unified dashboard.
- Use clear weight and spacing hierarchy: bold, letter-spaced small eyebrow/date labels; a strong page title; muted supporting text.
- Use radius and shadow tokens from the design-token section. Primary buttons are compact, solid violet, and around 40px tall. Secondary buttons use a surface fill and subtle border.
- Use `lucide-react` for interface icons. Use 16, 20, or 24px sizes and stroke width 2. Decorative icons have `aria-hidden="true"`; icon-only controls have a localized accessible label.
- Interactive elements use the 150ms or 250ms motion tokens, visible focus, disabled states, and reduced-motion preferences.

## Shared application shell (screens other than the unified account dashboard)

- Desktop: persistent white/surface sidebar about 250px wide, separated by a thin border; brand mark and wordmark at top; grouped navigation with a soft-violet active state; help/profile area near the bottom. The unified account dashboard is an explicit exception: it uses the all-size header and drawer specified below.
- Main area: slim top bar (about 72px) and padded content region. Align page content to a comfortable readable width and keep consistent horizontal gutters.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `border-inline-*`, `text-align: start`) so the shell mirrors correctly in Arabic RTL.
- Mobile: for screens that retain this shell, turn the sidebar navigation into a compact horizontal, scrollable navigation row; reduce top-bar and page gutters; stack content and actions without horizontal overflow. The unified account dashboard keeps its drawer on mobile.
- Exam-taking focus mode removes distracting shell elements while preserving the same brand, typography, colors, and control language.

## Screen composition

### Public entry and authentication

- The public root route (`/`) redirects directly to `/login`; do not add a separate landing screen unless the product's public onboarding requirements change.
- Keep account creation accessible from the registration link on the sign-in screen. Preserve the existing sign-in, registration, localization, and authentication flows.
- The shared public/authentication header follows the dashboard header language: Testo logo and wordmark at the logical start, compact language-switch pill and icon-only theme toggle at the logical end. Do not use labeled language/theme selects or duplicate the dashboard navigation drawer on unauthenticated pages.
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
- Header: a white 64px bar with a thin bottom border, the provided Testo sparkle logo asset instead of a text `T`, and the dark wordmark. Center the brand mark and wordmark together vertically in one horizontal row. Use English when no language preference has been saved; respect an existing saved preference. In LTR, place the hamburger, language pill, and theme toggle together on the left, with the brand at the far right and the drawer entering from the left. In RTL, mirror those physical sides: controls and hamburger on the right, brand on the left, and drawer entering from the right. Use a compact language pill showing the language it switches to (`AR` in English and `EN` in Arabic), an icon-only 36px theme button (moon in light mode, sun in dark mode), and an accessible menu button. Keep this header arrangement at every viewport size. Do not render the global language/theme selects on this route.
- The language control switches immediately, updates the page `lang` and `dir`, and persists through the existing language preference flow. The theme control uses the shared theme provider, preserves saved preferences, and follows the product's light default for new accounts.
- The greeting uses the user's first name only, stays on one line when space allows, and includes a waving hand. Show the authenticated role in the badge and use the established role-appropriate actions. Keep the violet-to-indigo hero gradient and its glass action container.
- Use the section titles **Continue Learning**, **Explore Featured Courses**, **My Groups Overview**, and **Upcoming & Recent Exams**. Section headings use a solid violet icon on the left and a purple, semibold **View All** link on the right without an arrow. Use the shared lucide-react icon convention described above for section and navigation icons.
- Loading is section-shaped skeleton UI with a shimmer, including the hero and every data section. Replace it with localized data or an empty/error state when loading completes; do not leave blank regions that suddenly populate.
- Continue Learning cards are about half-width on desktop and full-width on mobile. Include an 80px rounded thumbnail, uppercase violet category, course title and instructor, divider, progress label and percentage, and a green progress bar. Add a compact Continue action only when a real course destination exists; make the card itself a link only when it has that same valid destination.
- In RTL, fill progress bars from right to left and mirror directional icons. Use logical properties so alignment and control placement follow document direction.
- Featured courses use a two-column desktop grid and one column on mobile. Course covers are about 220px tall with a white category badge, followed by rating, enrollment count, title, instructor, and a full-width Enroll button. Use a dark navy button for available courses and a pale green enrolled state. Initially show four courses and provide a centered Show more control when additional real courses exist.
- The production course catalog and course routes are not part of the current data model. Course fixtures live in `src/lib/fixtures/courses.ts` and are returned only when `NEXT_PUBLIC_USE_MOCK_COURSES=true`; they are not wired into the UI or production data. Never present development fixtures as authenticated production records or give mock courses working enrollment/progress actions. In production, use a localized empty state and a valid existing action; never invent a route or interaction.
- Present groups in a **My Groups Overview** section. On wide screens, place two equal-width panels side by side: groups the user manages (instructor) and groups they joined (student). Each panel has a small uppercase/muted label, a compact count badge, a divider, and concise group rows. Stack the panels on narrow screens.
- Group rows show only real authorized fields: the group name, available member/instructor details, and a restrained role badge. Managed-group invitation codes may be copied only when the real usable code is available to the current user; announce a successful copy accessibly. Never invent a count, code, instructor, or role. Make each row or its clear action link to the existing authorized destination.
- Present upcoming/recent exams in a separate full-width bordered panel. Put the section icon, title, and “View all” action in the panel header, followed by a divider and compact rows. Each row uses the real exam title, group/context and duration as supporting text, plus a clearly styled date/status at the opposite edge.
- Date pills use amber for later upcoming exams, red for today/tomorrow, and gray for past exams, with border and text colors from the semantic status palette.
- Keep dashboard cards white in light theme and use semantic dark surfaces, with quiet borders, 16px corners, restrained violet icons/links, and comfortable spacing. Avoid decorative gradients outside the hero and oversized empty areas in data panels.
- Render groups, exams, counts, roles, and statuses only from the authenticated user's actual data and permissions. Never copy sample names, codes, counts, or dates from a reference. If a category is unavailable for the current account, retain the paired group panel and show a concise localized empty state without implying a role or access the user does not have. Keep real group and exam data authoritative in development too; the development mock flag applies only to features with no production model.
- Preserve the existing dashboard routes, Supabase queries, authorization checks, and interactions. Treat the two panels as a presentation of the current role/data model, not as a reason to add a second role or alter permissions.

### Theme defaults

- New users and users without a saved preference start in **light** theme. Respect an existing saved theme preference and let users switch to dark from the existing theme option. Theme changes must use the shared theme provider/tokens and persist according to the existing preference flow; do not add a competing per-page theme setting.

### Unified dashboard navigation drawer (all viewport sizes)

- The dashboard hamburger opens the navigation drawer on desktop, tablet, and mobile. There is no persistent sidebar or horizontal navigation row. Use a 280px drawer capped at 85vw, full viewport height. The drawer enters from the same physical side as the hamburger: from the left in LTR and from the right in RTL.
- Place a softly blurred overlay behind the drawer (`rgba(15, 23, 42, 0.35)` with 4px blur). Keep the header above the overlay and the drawer above both; keep the hamburger itself above the overlay, sharp, and clickable so it can close the drawer.
- The drawer has a branded top row with an X close button, the same authorized links and active state, and a user card anchored to the bottom with avatar/fallback initial, name, role, and the existing sign-out action. Do not add duplicate language or theme controls inside the drawer; both preferences stay available in the header.
- Support the hamburger toggle, close button, overlay click, Escape, and navigation-link close. Lock background scrolling while open, move keyboard focus into the drawer, keep Tab focus inside it, and return focus to the hamburger after closing.
- Use shared theme tokens, logical CSS properties, visible focus styles, and reduced-motion behavior. Keep the menu button, language pill, and theme button from wrapping or overflowing at narrow widths.

### Exam taking

- Use a calm, low-distraction workspace and a restrained green action/progress accent.
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

Adapt these visual rules to the production Next.js architecture in `src/`. Reuse shared components and semantic tokens; do not copy the mockup's framework, hard-coded production content, or app state. Keep any development fixtures explicit and isolated behind a development-only flag. Before finishing UI work, inspect the changed screen in English and Arabic, light and dark themes, desktop and mobile sizes, and confirm the existing Testo data and interactions still drive the interface.

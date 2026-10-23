# Testo UI Design System

This is the persistent, self-contained visual contract for all Testo screens. Read it before implementing or restyling UI. Testo's production code, live data, authorization, and domain logic remain authoritative. The visual rules below capture the approved reference design and do not depend on the reference project being present in the repository.

## Visual principles

- Calm, polished education product: light cool-gray canvas, white surfaces, restrained violet accents, quiet borders, generous whitespace, and clear hierarchy.
- Keep screens focused and scannable. Prefer a small number of well-structured cards and sections over dense dashboards, heavy decoration, or oversized empty areas.
- Use soft shadows and rounded corners sparingly to distinguish surfaces. Avoid harsh black shadows, strong gradients outside the brand mark, and unrelated accent colors.
- Use consistent shared navigation, page headers, buttons, fields, cards, badges, tables/lists, dialogs, and empty/loading/error states.
- Primary violet communicates the main action and active navigation. Teal/green indicate progress or success; amber indicates attention/review; red indicates destructive or error states. Do not use color alone to communicate state.

## Color tokens

Match these reference values where the existing app's token system permits. Prefer semantic shared tokens over one-off color literals.

| Role | Light | Dark |
| --- | --- | --- |
| Page background | `#f5f7fb` | `#141824` |
| Surface/card | `#ffffff` | `#1c2231` |
| Soft surface | `#f8f9fc` | `#232a3a` |
| Main text | `#202b3c` | `#edf0f7` |
| Muted text | `#7c8798` | `#a0a9ba` |
| Border | `#e8ecf2` | `#303849` |
| Primary | `#6558d3` | `#9b91ff` |
| Strong primary | `#5144c1` | `#aaa2ff` |
| Soft primary | `#efedff` | `#322f56` |
| Teal | `#1b9b8e` | `#56c9bb` |
| Success | `#208b65` / `#e6f5ee` | `#6ad3a7` / `#213c37` |
| Attention | `#b97b18` / `#fff4dc` | `#ecc36e` / `#433829` |
| Error | `#d34d5c` / `#fff0f1` | `#ff8691` / `#482d36` |

Reference shadow: `0 10px 30px rgba(31, 44, 65, 0.045)` in light mode; use a subtle dark shadow in dark mode. The exam-taking workspace may use its reference's quiet green accent (`#39776b`, soft `#e8f2ee`) while staying within the same surface, border, and typography system.

## Typography and shape

- Use **DM Sans** for English and **Cairo** for Arabic, with sensible sans-serif fallbacks. Arabic screens use Cairo first.
- Base text is approximately 14px with 1.5 line height. Secondary labels and metadata are compact but readable (usually 10–13px); page titles are about 27–30px and section headings about 14–16px.
- Use clear weight and spacing hierarchy: bold, letter-spaced small eyebrow/date labels; a strong page title; muted supporting text.
- Standard cards/panels use 15–16px corner radii; fields and buttons about 9px; smaller controls 8–12px. Primary buttons are compact, solid violet, and around 40px tall. Secondary buttons use a surface fill and subtle border.
- Preserve visible keyboard focus, disabled states, hover feedback, and reduced-motion preferences.

## Shared application shell

- Desktop: persistent white/surface sidebar about 250px wide, separated by a thin border; brand mark and wordmark at top; grouped navigation with a soft-violet active state; help/profile area near the bottom.
- Main area: slim top bar (about 72px) and padded content region. Align page content to a comfortable readable width and keep consistent horizontal gutters.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `border-inline-*`, `text-align: start`) so the shell mirrors correctly in Arabic RTL.
- Mobile: turn the sidebar navigation into a compact horizontal, scrollable navigation row; reduce top-bar and page gutters; stack content and actions without horizontal overflow.
- Exam-taking focus mode removes distracting shell elements while preserving the same brand, typography, colors, and control language.

## Screen composition

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

### Student dashboard

- Use a friendly page heading and keep the dashboard focused on the user's real learning and teaching activity.
- Present groups in a **My Groups Overview** section. On wide screens, place two equal-width panels side by side: groups the user manages (instructor) and groups they joined (student). Each panel has a small uppercase/muted label, a compact count badge, a divider, and concise group rows. Stack the panels on narrow screens.
- Group rows show the real group name, relevant secondary details (such as member count and join code for managed groups, or instructor for joined groups), and a restrained role badge. Make the row or its clear action link to the existing authorized destination.
- Present upcoming/recent exams in a separate full-width bordered panel. Put the section icon, title, and “View all” action in the panel header, followed by a divider and compact rows. Each row uses the real exam title, group/context and duration as supporting text, plus a clearly styled date/status at the opposite edge.
- Keep card surfaces white in light theme and semantic surface tokens in dark theme, with quiet borders, approximately 16px corners, restrained violet icons/links, and comfortable spacing. Avoid decorative gradients and oversized empty areas in these data panels.
- Render only groups, exams, counts, roles, and statuses provided by the authenticated user's actual data and permissions. Never copy sample names, codes, counts, or dates from a reference. If one category is unavailable for the current account, retain the paired panel and show a concise localized empty state; do not imply the user has a role or access they do not have.
- Preserve the existing dashboard routes, Supabase queries, authorization checks, and interactions. Treat the two panels as a presentation of the current role/data model, not as a reason to add a second role or alter permissions.

### Theme defaults

- New users and users without a saved preference start in **light** theme. Respect an existing saved theme preference and let users switch to dark from the existing theme option. Theme changes must use the shared theme provider/tokens and persist according to the existing preference flow; do not add a competing per-page theme setting.

### Mobile account navigation

- On the unified account dashboard, replace the desktop sidebar with a compact top bar containing the Testo mark, a short language toggle, and a hamburger button. Do not show duplicate preference controls on mobile.
- Open navigation as a start-aligned off-canvas drawer over a dimmed, softly blurred scrim. The drawer contains a branded close row, the same authorized application links and active state as desktop, a theme switch, and the account/sign-out card.
- Support close button, scrim click, and Escape. Lock background scrolling while open, move keyboard focus into the drawer, keep Tab focus inside it, and return focus to the menu button after closing. Mirror the drawer from the left in English to the right in Arabic RTL.
- Keep the desktop shell and its existing preference controls intact. Use shared theme tokens, logical CSS properties, visible focus styles, and reduced-motion behavior for the mobile drawer.

### Exam taking

- Use a calm, low-distraction workspace and a restrained green action/progress accent.
- Show exam identity and session status first, then a clear time/saved-status strip.
- On desktop, use a large question panel beside a narrow question navigator (about 280px). On mobile, stack them and keep navigation usable.
- Answers are large, full-width selectable rows with a visible selected state; question numbers distinguish current, answered, and review states.
- Keep previous/next/submit controls together in a stable footer. Confirm submission in a centered, accessible dialog and show a calm completion state.

## Responsive and language behavior

- Follow the reference's approximate breakpoints: 1000px for dashboard/form column changes, 780px for narrower shell and stacked summaries, 700px for mobile navigation and single-column dashboards, and 480px for compact controls.
- Treat these as guidance, not rigid magic numbers. Prevent clipping and horizontal scrolling at all widths; preserve comfortable touch targets.
- Support both Arabic RTL and English LTR. Use logical alignment/spacing, localize all visible copy, format dates/numbers for the active language, and verify both directions after layout changes.
- Keep light and dark themes intentional: map semantic tokens for every surface, text, border, status, focus, and selected state. Never leave a light-only literal on a dark screen if it harms contrast.

## Implementation rule

Adapt these visual rules to the production Next.js architecture in `src/`. Reuse current shared components and semantic tokens; do not copy the mockup's framework, hard-coded content, or app state. Before finishing UI work, inspect the changed screen in English and Arabic, light and dark themes, desktop and mobile sizes, and confirm the existing Testo data and interactions still drive the interface.

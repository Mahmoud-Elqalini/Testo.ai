# Implementation Plan: 001-foundation

**Branch**: `001-foundation` | **Date**: 2026-08-30 | **Spec**: [specs/001-foundation/spec.md](file:///c:/Users/Soft/OneDrive%20-%20Faculty%20Of%20Engineering%20%28Tanta%20University%29/Documents/01_Github_Project/University/05_Testo/specs/001-foundation/spec.md)

**Input**: Feature specification from `/specs/001-foundation/spec.md`

## Summary

Build the foundational exam lifecycle, groups, access control, and secure timed exam-taking capabilities, with bilingual/theme-adaptive presentation. All critical states (time limits, immutability, access) must be enforced server-side via Supabase Row-Level Security (RLS) and Edge Functions to adhere to the constitution.

## Technical Context

**Language/Version**: TypeScript 5.x (Node 20+ for edge, React 18+ for frontend)

**Primary Dependencies**: Next.js (App Router), Supabase (Auth, Postgres, RLS, Edge Functions)

**Storage**: PostgreSQL (via Supabase)

**Testing**: Jest / Vitest (Logic testing / TDD), Playwright / Cypress (Visual Regression Testing)

**Target Platform**: Web (Desktop & Mobile responsive)

**Project Type**: web-service + frontend

**Performance Goals**: Fast UI rendering, real-time sync for answer debouncing (<200ms latency to save).

**Constraints**: Strict RLS policies, offline-capable UI states, bilingual (RTL/LTR), light/dark mode.

**Scale/Scope**: Initial scale: 100-300 concurrent students per exam.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Server is Sole Source of Truth**: Handled via RLS and Edge Functions for timing/submission. Client timer is informational. **Database-level enforcement** covers every table: students have SELECT-only RLS on `exam_attempts`, `answers`, `exams`, and `exam_permissions`; the `profiles.role` column is not updatable by any user-facing policy; all state-changing mutations flow exclusively through service-role Edge Functions.
- [x] **II. Zero Exposure of Grading Criteria**: RLS policies will ensure `correct_choice` (via stable IDs) and `reference_answers` are inaccessible to the Student role. `access_token` is also excluded from student-readable columns on `exam_attempts`.
- [x] **III. Defense in Depth for Exam Access**: Access requires BOTH `auth.uid()` (authenticated account) AND a matching `access_token` (from the URL). If the authenticated user does not match the token's attempt owner, access is explicitly denied. The `profiles.role` lockdown closes the privilege-escalation path — a student cannot grant themselves admin access via a direct API call.
- [x] **IV. Data Integrity**: `pending -> in_progress -> submitted/abandoned/voided` lifecycle strictly enforced. `session_id` checks ensure single-active-session integrity during answer saves.
- [x] **VIII. Strict TDD & Visual Regression**: Testing framework selected (Vitest + Playwright) to enforce this.
- [x] **IX. Bilingual & Theme-Adaptive**: Frontend architecture will support i18n and theme context from day 1.

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (DB schema & API definitions)
└── tasks.md             # Phase 2 output (to be generated)
```

### Source Code (repository root)

```text
src/
├── app/                  # Next.js App Router (Pages, Layouts)
├── components/           # UI Components (Themed, Bilingual)
├── lib/                  # Utilities, hooks, supabase client
├── locales/              # i18n dictionaries (en, ar)
└── styles/               # CSS / Tailwind config

supabase/
├── migrations/           # DB schema and RLS policies
└── functions/            # Edge functions: start-attempt, get-exam-questions, save-answer, submit-attempt, auto-submit sweep

tests/
├── unit/                 # Logic TDD tests
└── visual/               # Visual regression tests (Playwright)
```

**Structure Decision**: A single Next.js project with a `supabase/` directory for backend configuration, which is standard and recommended for Supabase + Next.js apps.

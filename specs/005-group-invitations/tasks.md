# Tasks: Group Invitation Codes

**Input**: Design documents in `specs/005-group-invitations/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)

**Prerequisites**: Plan and specification are complete.

**Tests**: Integration and visual regression tests are required by the specification. Write the database integration tests first and confirm the invitation RPCs fail before implementing them.

**Organization**: Tasks are grouped by shared foundation and the two user stories. US1 is the end-to-end MVP: an admin creates and shares a code and a student joins. US2 adds lifecycle controls to rotate and revoke codes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on another task.
- **[Story]**: User story from `spec.md`.
- Every implementation task names its target file or files.

## Phase 1: Setup

**Purpose**: Reuse the existing Next.js, Supabase, Vitest, and Playwright setup. No packages or project scaffolding are required for this feature.

No setup tasks are needed.

---

## Phase 2: Foundational Security and Database Contract

**Purpose**: Establish test coverage and the private database primitives required by both stories.

### Tests first

- [X] T001 [P] [US1] Add local-Supabase integration coverage for student redemption: valid code joins the bound group, invalid/expired/revoked codes fail generically, redemption is idempotent, the group membership trigger preserves exam-attempt creation, non-students cannot redeem, and the fixed-window failure limit is enforced in `tests/unit/services/group-invitation-redemption.test.ts`.
- [X] T002 [P] [US1] Add local-Supabase integration coverage for admin invitation creation: only the owning admin can create a code, the returned code is shown once, its stored digest is not exposed, it expires after the configured lifetime, and non-admin or foreign-group access is denied in `tests/unit/services/group-invitation-admin.test.ts`.
- [X] T003 [P] [US2] Add local-Supabase integration coverage for invitation lifecycle: rotating invalidates the old code, revocation prevents redemption, status exposes timestamps only, unauthorized admins are denied, and rotation/revocation preserve existing memberships and attempts in `tests/unit/services/group-invitation-lifecycle.test.ts`.

- [X] T004 [P] [US1] Add focused Vitest service coverage for identifier validation, RPC names/arguments, response mapping, and generic redemption results in `tests/unit/services/group-invitation-service.test.ts`; add the `@` source alias in `vitest.config.mts` so feature component tests can resolve the existing Next.js import convention. Confirmed the tests fail before the service module exists.

### Shared implementation

- [X] T005 [US1] Apply `supabase/migrations/0007_group_invitations.sql` with the private invitation and per-student redemption-limit tables, constraints, RLS and grants; implement create, status, rotate, revoke, and redeem RPCs with explicit role/ownership checks, qualified object names, pinned `search_path`, safe execute grants, transactional locking, SHA-256 digest storage, 128-bit random code generation, generic redemption failures, and the five-failures-per-15-minute fixed-window limit. The migration resolves pgcrypto's actual extension schema from pg_catalog and schema-qualifies its functions.

**Checkpoint**: T001–T003 were confirmed red against the missing RPCs. Apply the migration locally and rerun those integration tests before starting the UI work. T004 is the service unit-test task and must pass before its service implementation.

---

## Phase 3: User Story 1 — Admin Creates a Code and Student Joins (P1, MVP)

**Goal**: An admin can create and share a reusable, time-limited code; a student can enter it and join only the group it identifies.

**Independent Test**: Create a group as its owning admin, create a code, redeem it as a student, verify membership and any existing group-based access behavior, then verify a second redemption does not create duplicate membership or attempts.

### Implementation

- [X] T006 [P] [US1] Implement typed client calls and response/error handling for create, status, and redeem RPCs in `src/lib/services/group-invitation-service.ts`.
- [X] T007 [P] [US1] Build the admin create/share panel, including one-time code display, copy action, expiry/status display, and safe empty/error/loading states in `src/components/admin/GroupInvitation.tsx`.
- [X] T008 [P] [US1] Build the student code-entry form with input validation, generic failure messaging, success feedback, and duplicate-submit protection in `src/components/student/JoinGroupForm.tsx`.
- [X] T009 [US1] Add the authenticated student-only join route and role guard at `src/app/student/join-group/page.tsx`.
- [X] T010 [US1] Integrate `GroupInvitation` into the existing admin group detail page at `src/app/admin/groups/[groupId]/page.tsx`.
- [X] T011 [US1] Add a student-only join-group entry point to `src/app/dashboard/page.tsx` without exposing it to admin accounts.
- [X] T012 [US1] Add all invitation and join-flow messages in English and Arabic, including RTL-friendly labels, errors, and accessibility text, in `src/locales/en.json` and `src/locales/ar.json`.

**Checkpoint**: With only US1 complete, an admin can create/share a code and a student can join the correct group end to end.

---

## Phase 4: User Story 2 — Admin Rotates or Revokes a Code (P2)

**Goal**: An owning admin can replace a compromised code or disable invitations while existing members and their attempts remain intact.

**Independent Test**: Create and redeem a code; rotate it and verify only the new code works; revoke it and verify no code can join; confirm current members and attempts remain unchanged.

### Implementation

- [X] T013 [US2] Extend `src/lib/services/group-invitation-service.ts` with typed rotate, revoke, and status operations, preserving generic authorization/error handling.
- [X] T014 [US2] Extend `src/components/admin/GroupInvitation.tsx` with rotate and revoke actions, confirmation for destructive invitation changes, and refreshed status after each operation.

**Checkpoint**: Rotation and revocation affect invitation validity only; they do not remove students or alter attempts.

---

## Phase 5: Polish and Cross-Cutting Verification

**Purpose**: Verify both stories across locales, themes, roles, and the documented local workflow.

- [X] T015 [P] [US1] [US2] Add Playwright visual regression coverage for the admin group invitation panel and student join page in English/Arabic and light/dark themes in `tests/visual/group-invitations.spec.ts`.
- [X] T016 [P] [US1] [US2] Add or update focused component tests for one-time code visibility, copy feedback, generic errors, and rotate/revoke confirmations in `tests/unit/components/group-invitations.test.tsx`.
- [X] T017 [US1] [US2] Validate the local setup and end-to-end scenarios documented in `specs/005-group-invitations/quickstart.md`; record any environment-specific prerequisites or failures in the feature docs.

---

## Dependencies and Execution Order

### Phase dependencies

- **Setup**: No work is needed; existing project tooling is reused.
- **Foundational**: T001–T003 can be written in parallel. T005 follows them and blocks all feature UI/service implementation because both stories depend on its database contract.
- **US1**: T006–T008 can be developed in parallel after T005. T009 and T010 depend on their respective components; T011 and T012 can proceed in parallel with page integration. Complete US1 before considering the feature MVP ready.
- **US2**: Starts after T005 and builds on the service/panel from US1; T013 precedes T014.
- **Polish**: T015–T017 follow both stories because they verify the integrated feature.

### Story dependencies

- **US1 (P1)**: Depends on the shared database contract and delivers the end-to-end MVP.
- **US2 (P2)**: Depends on the invitation record and admin panel from US1; it is independently verifiable after US1 is present.

### Parallel opportunities

- T001, T002, and T003 use separate integration test files and can be authored in parallel.
- After T005, T006, T007, and T008 touch separate files and can proceed in parallel.
- T011 and T012 can proceed while the join/admin routes are integrated.
- T015 and T016 use separate test files and can proceed in parallel after the stories are implemented.

## Implementation Strategy

### MVP first

1. Write T001–T003 and confirm they fail because the invitation database contract is not present.
2. Implement T005 and run the local Supabase integration tests.
3. Complete T006–T012 and verify the admin-to-student join journey end to end.
4. Complete T013–T014 for rotation and revocation.
5. Complete T015–T017 for visual, component, and quickstart verification.

### Notes

- Keep raw invitation codes out of database rows, logs, analytics, and status responses; show a newly created or rotated code only in that operation's response.
- Keep join failure responses generic so callers cannot distinguish unknown, expired, revoked, or otherwise unusable codes.
- Use the existing group membership trigger and authorization policies; do not bypass them with direct client inserts.
- Do not add a package unless implementation reveals a concrete missing capability; the current plan uses existing project tooling.

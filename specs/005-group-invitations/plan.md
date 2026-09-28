# Implementation Plan: Group Invitation Codes

**Branch**: `005-group-invitations` | **Date**: 2026-09-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-group-invitations/spec.md`

## Summary

Add reusable, expiring join codes to Admin-owned groups. Admins create, rotate, and revoke a code; authenticated Students redeem it through a transactional database operation. The database stores only a SHA-256 digest of a cryptographically random 128-bit code, never the usable code. Redemption creates the existing `group_students` relationship and relies on the existing `001-foundation` triggers to provision any required pending exam attempt.

## Technical Context

**Language/Version**: TypeScript 5.x, SQL (PostgreSQL), Node 22 for local tooling
**Primary Dependencies**: Next.js 16 App Router, React 19, Supabase SSR/JS, PostgreSQL with `pgcrypto`
**Storage**: Existing Supabase PostgreSQL database; invitation and rate-limit state in the non-exposed `private` schema
**Testing**: Vitest integration tests against local Supabase; Playwright visual regression tests
**Target Platform**: Web (desktop and mobile browsers)
**Project Type**: Single Next.js web application with Supabase database
**Performance Goals**: Code redemption completes in under 1 second at the project's current scale (low hundreds of concurrent exam students)
**Constraints**: Authenticated Students only; group ownership enforced server-side; invitation code never stored or returned after create/rotate; existing exam permissions and pending-attempt invariants remain authoritative; Arabic/English and light/dark support
**Scale/Scope**: One active invitation per group, reusable for multiple students until its 30-day expiry, rotation, or revocation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Server Is Sole Source of Truth**: Role checks, code validation, expiry, throttling, and membership insertion occur atomically in database functions; clients cannot write group membership directly.
- **II. Zero Exposure of Grading Criteria**: The feature does not read or return exam questions or grading criteria.
- **III. Defense in Depth for Exam Access**: Redemption requires an authenticated Student and a valid group invitation; existing exam permissions, attempt ownership, and server-side deadlines continue to gate exam access.
- **IV. Data Integrity and Resilience**: Membership insert is idempotent and transactional with existing pending-attempt creation; retries cannot duplicate membership or attempts. Rotation/revocation never deletes membership or changes attempts.
- **VI. Cost-Conscious Scaling**: Uses the existing database and authentication stack; no paid service is added.
- **VII. Simplicity Before Sophistication**: One active reusable code per group with a fixed 30-day lifetime; no bulk invitations, custom lifetime editor, or one-code-per-student workflow.
- **VIII. Strict TDD and Visual Regression**: Write local-Supabase integration tests before the migration/functions; add Playwright snapshots for Arabic/English and light/dark.
- **IX. Bilingual and Theme-Adaptive**: All Admin and Student copy comes from `src/locales/en.json` and `src/locales/ar.json`; screens mirror RTL/LTR and support both themes.

**Gate result**: PASS. No constitution violation identified.

## Project Structure

### Documentation (this feature)

```text
specs/005-group-invitations/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── group-invitations.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── admin/groups/[groupId]/page.tsx   # Invitation lifecycle controls
│   ├── student/join-group/page.tsx       # Student redemption flow
│   └── dashboard/page.tsx                # Student entry point
├── components/
│   ├── admin/GroupInvitation.tsx
│   └── student/JoinGroupForm.tsx
├── lib/services/group-invitation-service.ts
└── locales/{en,ar}.json

supabase/migrations/0007_group_invitations.sql
tests/
├── unit/services/group-invitation-redemption.test.ts
├── unit/services/group-invitation-admin.test.ts
├── unit/services/group-invitation-lifecycle.test.ts
├── unit/services/group-invitation-service.test.ts
├── unit/components/group-invitations.test.tsx
└── visual/group-invitations.spec.ts
```

**Structure Decision**: Extend the existing Next.js App Router and Supabase migration/service/test layout. Put sensitive invitation hashes and per-Student throttle state in `private`, which is not exposed through the Data API. Expose only narrowly granted database functions in `public`; each privileged function pins an empty `search_path`, schema-qualifies objects, checks the caller's role and ownership, and has EXECUTE revoked from `public` and `anon`.

## Design Decisions

- Generate 16 random bytes (128 bits) server-side, encode as lowercase hex for reliable copy/paste, and store only `digest(code, 'sha256')`.
- Keep at most one invitation record per group. Rotation replaces its digest and expiration atomically, making the previous code immediately unusable. Revoke sets a timestamp; it does not remove memberships.
- A new code expires 30 days after creation. This lifetime is fixed for v1.
- Require the authenticated Student to enter a complete code. After five failed redemptions within a 15-minute window, block additional attempts for that window; key the throttle to `auth.uid()` because unauthenticated callers cannot redeem. Return a generic invalid-code response for malformed, unknown, expired, revoked, or throttled codes.
- Redemption uses one database transaction: validate Student role and throttle, find a non-revoked/non-expired invitation by digest, insert membership `ON CONFLICT DO NOTHING`, then clear failed-attempt state. Existing `group_students` triggers create pending attempts when applicable.
- Admin creation/rotation functions return the usable code and expiry once. A status function returns timestamps only, never a stored digest or recoverable code.

## Complexity Tracking

No constitution violations. The private throttle row is the smallest durable mechanism needed to enforce the spec's failed-redemption rate limit across multiple app instances.

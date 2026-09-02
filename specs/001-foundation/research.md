# Research & Clarifications: 001-foundation

## Technical Decisions

### Frontend Framework
- **Decision**: Next.js (App Router) + React + Tailwind CSS
- **Rationale**: Best-in-class for React applications. Tailwind provides excellent built-in support for RTL (`rtl:` modifier) and Dark Mode (`dark:` modifier), which perfectly aligns with Constitution Principle IX (Bilingual and Theme-Adaptive).
- **Alternatives considered**: Vite + React, Nuxt. Next.js was chosen for seamless Supabase SSR integration and robust community support.

### Testing Strategy
- **Decision**: Vitest for TDD (logic), Playwright for Visual Regression Testing
- **Rationale**: Vitest is extremely fast and integrates well with TypeScript for logic. Playwright is the industry standard for visual regression testing across multiple browsers and device sizes.
- **Alternatives considered**: Jest (slower, harder TS setup), Cypress (less optimal for pure visual snapshots compared to Playwright).

### State Management & Data Fetching
- **Decision**: Supabase JS Client with React Query (or SWR)
- **Rationale**: React Query handles offline caching and debounced updates elegantly, fulfilling the offline handling and autosave requirements (Principle IV).
- **Alternatives considered**: Redux (overkill), Zustand (good for UI state, but React Query is better for server state).

### Exam Timer Enforcement
- **Decision**: Supabase Edge Functions + Postgres Cron (pg_cron)
- **Rationale**: Principle I dictates the server is the sole source of truth. An Edge function can securely process submissions, and a `pg_cron` job can periodically sweep and auto-submit expired `in_progress` attempts, satisfying Story 4.
- **Alternatives considered**: Relying on the client to submit at 0 (violates Principle I).

### Pending Attempt Creation Mechanism
- **Decision**: pg_cron job using `pgcrypto` (`gen_random_uuid()`) for token generation at `start_time` + a database trigger on `exam_permissions` INSERT for late additions.
- **Rationale**: A pure-SQL pg_cron job avoids the latency and failure modes of an HTTP round-trip to an Edge Function. `pgcrypto` provides cryptographically random UUIDs directly in SQL, satisfying the Constitution's requirement for unguessable tokens (Principle III). For late additions (FR-004b), a trigger on `exam_permissions` fires on INSERT and creates a `pending` attempt immediately if the exam has already started, rather than waiting for the next scheduled sweep.
- **Alternatives considered**: pg_cron invoking an Edge Function via `pg_net` (unnecessary HTTP hop for a pure-data operation); application-level handler only (misses the case where the admin uses the API directly).

## Clarifications Resolved
The following architectural decisions were resolved against the specification:
1. **Access Token Strategy**: Implemented via a separate `access_token` on `exam_attempts`, combining with `auth.uid()` for Defense in Depth (Principle III). Token is excluded from student-readable SELECT columns.
2. **Pending-Attempt Trigger**: pg_cron job with `pgcrypto` at `start_time`; database trigger on `exam_permissions` for late additions (FR-004b).
3. **Stable IDs**: MCQ choices and reference answers use object structures with stable IDs instead of raw text arrays to ensure robust references.
4. **Group-Ownership Enforcement**: Enforced via DB constraints/RLS on `exam_permissions.group_id` (FR-005a).
5. **Session Invalidation**: Managed via `session_id` checks during active attempts to enforce single-session concurrency (FR-021a).
6. **Write-Path Lockdown**: Students have SELECT-only RLS on `exam_attempts` and `answers`; all writes go through service-role Edge Functions, ensuring server-side checks cannot be bypassed via the client SDK.
7. **Answer-Save Time Re-validation**: The answer-save Edge Function independently re-checks the time window on every request (FR-016), not just at attempt start.

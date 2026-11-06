# Phase 0 Before-Suite Capture (Incomplete)

This is an initial diagnostic capture from the current local role-based Supabase schema. It is **not a complete baseline**, and the Phase 0 gate remains open. Tests for the corrected inventory are now authored in T004–T006, but this old capture predates them. Do not use this capture as the accepted before/after comparison; T007 must run the complete suite and T008 must commit its results.

- Schema versions observed: `0001` through `0013`.
- Harness command: `node --experimental-strip-types tests/security/007-unified-identity/harness.ts --phase before` (the configured npm script is `npm run test:security:007:before`).
- Capture time: `2026-11-06T18:40:59.359Z`.
- Captured results: 127 cases; 100 passed and 27 failed. This run used the earlier provisional 66-entry inventory, so it must not be matched to the corrected frozen inventory. Full structured observations are in [raw-results.json](./raw-results.json).
- Current repository HEAD at capture: `2d974af0ce625db30127d60eeeb25419994f6694`.
- No migration from 0014 onward was applied.

## Gate blockers

1. T003 is now complete. The corrected frozen inventory contains 62 entries (27 policies, 25 role/admin-dependent functions, 6 triggers, and 4 Edge paths). The generator applies migration CREATE/DROP history, excludes helpers whose active definitions do not reference a fixed role or `admin_id`, and verifies exact object coverage against both the plan matrix and the current local catalog. Historical `get_my_role()` is listed as excluded because migration 0005 drops it and it is absent from the active catalog.
2. The earlier diagnostic run observed the authenticated profile-role mutation being accepted (the current protection trigger did not reject it), attempt-table reads returning HTTP 403 because `authenticated` lacks table SELECT privilege, missing/rejected question write fixtures, old attempt RPC behavior, and all four Edge success paths returning HTTP 503. These observations predate the corrected T004–T006 tests; T007 must determine which persist with the corrected suite. See each `case_id` in the raw report for the original observations.
3. A repeated harness invocation initially hit the exam immutability trigger because prior synthetic attempts had already started. The additive fixture setup was adjusted to avoid conflicting question inserts and changes to exams with non-pending attempts. The capture above is the subsequent run. Fixture stability and the required pre-reset ordering still need explicit validation before T008.
4. Local Supabase's catalog reported RLS disabled on `public.private_user_roles`. This was recorded and not changed.

The capture is retained to avoid losing the first concrete observations, but it must not be represented as satisfying T007 or T008. The next before-suite run must use the corrected 62-entry inventory. No baseline commit hash exists yet.

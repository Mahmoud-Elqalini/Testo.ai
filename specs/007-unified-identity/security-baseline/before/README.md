# Phase 0 Before-Suite Baseline

This is the accepted security baseline captured against the current role-based schema before migration 0014. The complete machine-readable result, actor/resource IDs, relationship edges, case IDs, and per-case outcomes are in [raw-results.json](./raw-results.json).

## Capture metadata

- Schema versions: `0001` through `0013`.
- Frozen inventory: 62 entries, derived from migrations and reconciled with the local catalog; see [`../inventory.md`](../inventory.md) and [`../inventory.json`](../inventory.json).
- Command: `npm run test:security:007:before`.
- Recorded at (UTC): `2026-11-06T19:57:04.757Z`.
- Results: 134 cases; 128 passed and 6 failed. All 62 inventory entries have allow and deny cases; the suite also records Edge anonymous cases and absence checks for unimplemented actions.
- Fixture manifest SHA-256: `740df71750b99c902ed1f7983e67a83046268a172d4f0f1a33835b76eaaa7baf`.
- Baseline evidence commit: `d7a4052fac4208d695ce0842fc9a4a74f704646f`.
- No migration from 0014 onward was applied before this capture. The seed is additive; no reset or reseed was performed.

## Observed current-schema failures

These failures are preserved as baseline observations and must not be hidden by changing the tests:

1. `policy:exam_attempts_student_select.allow` and `policy:exam_attempts_admin_select.allow` return HTTP 403 because `authenticated` has no SQL `SELECT` grant on `public.exam_attempts`; the RLS allow policies are therefore not reachable through the REST table API.
2. `function:public.fn_protect_profile_role.deny`, `trigger:trg_protect_profile_role.deny`, `function:public.fn_sync_user_role.deny`, and `trigger:trg_sync_user_role.deny` show that an authenticated participant can change their profile role to `admin`, and the role mirror changes with it.

The role-mutation results document the behavior of the old schema; the target model has no fixed student/admin roles. The attempt-table grant/RLS behavior and role mutation must be addressed by the planned authorization replacement, then verified by the after-suite.

The legacy direct owner INSERT allow and non-owner INSERT deny for `group_students` are separately recorded in the case results. `raw-results.diagnostic.json` is an earlier troubleshooting copy and is not part of this baseline.

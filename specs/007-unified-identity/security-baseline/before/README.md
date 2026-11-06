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

These are known baseline weaknesses (not hidden, fixed by named migration). They are observed failures against the current 0001–0013 schema, not expected failures to preserve after cutover. The after-suite must compare the transitions below rather than require identical before/after PASS/FAIL status.

| Baseline case ID | Expected before vs. observed | Expected transition / named fix |
|---|---|---|
| `policy:exam_attempts_student_select.allow` | An authenticated participant should read their own attempt; actual HTTP 403 because `authenticated` lacks `SELECT` on `public.exam_attempts`. | **After 0017:** allow the participant to read their own attempt, deny other participants and unrelated users. Use column-limited SELECT grants and participant RLS; `access_token` must remain unreadable. Fixed by 0017 (T030/T031). |
| `policy:exam_attempts_admin_select.allow` | An admin should read attempts for their own exam; actual HTTP 403 because `authenticated` lacks `SELECT` on `public.exam_attempts`. | **After 0017:** allow the owner of the exam to read its attempts, deny other owners and unrelated users. Use column-limited SELECT grants and owner RLS; `access_token` must remain unreadable. Fixed by 0017 (T030/T031). |
| `function:public.fn_protect_profile_role.deny` | An authenticated user's attempt to set their own role to `admin` should be rejected; actual HTTP 200 and the profile role changed. | **After 0017:** test that self-promoting to `admin` grants no access to another owner's resources, lookup, invitations, attempts, or results. **After 0019:** this role-mutation case is obsolete; replacement tests prove `profiles.role` does not exist. Fixed by 0017 authorization cutover and completed by 0019 role drop (T024/T031/T047–T050). |
| `trigger:trg_protect_profile_role.deny` | The role-protection trigger should reject the authenticated role change; actual change succeeded. | **After 0017:** self-promotion grants no cross-owner or protected-action capability. **After 0019:** obsolete; replacement tests prove no role column exists. Fixed by 0017 authorization cutover and completed by 0019 role drop (T024/T031/T047–T050). |
| `function:public.fn_sync_user_role.deny` | A rejected profile role change should not reach the mirror; actual profile change succeeded and the mirror became `admin`. | **After 0017:** self-promotion grants no cross-owner or protected-action capability. **After 0019:** obsolete; replacement tests prove the role mirror is absent. Fixed by 0017 authorization cutover and completed by 0019 role drop (T024/T031/T047–T050). |
| `trigger:trg_sync_user_role.deny` | The mirror trigger should not apply an untrusted role change; actual mirror role became `admin`. | **After 0017:** self-promotion grants no cross-owner or protected-action capability. **After 0019:** obsolete; replacement tests prove the role mirror is absent. Fixed by 0017 authorization cutover and completed by 0019 role drop (T024/T031/T047–T050). |

For role cases, do not mechanically compare the old test's `FAIL` status with the after-suite. At 0017, replace those assertions with explicit no-capability-on-self-promotion tests; at 0019, assert the role column and mirror artifacts no longer exist. For attempt reads, the after-suite must assert the authorized allow and unauthorized deny cases even though the before allow assertions failed at the SQL privilege layer.

## Catalog advisory

The baseline report's `localAdvisories` records that `public.private_user_roles` has RLS disabled. This is a configuration advisory, not proof that API roles can read the table: migration 0005 revokes table privileges from `PUBLIC`, `anon`, and `authenticated`. The table and mirror are removed by 0019.

The legacy direct owner INSERT allow and non-owner INSERT deny for `group_students` are separately recorded in the case results. `raw-results.diagnostic.json` is an earlier troubleshooting copy and is not part of this baseline.

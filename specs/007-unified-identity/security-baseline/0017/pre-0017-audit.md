# Pre-0017 SECURITY DEFINER audit

**Scope:** migrations `0001_schema.sql` through `0016_profile_projections.sql` and a live, read-only query of the local Supabase catalog. No database was reset or changed. Extension-owned functions are included in the live inventory and identified separately from application remediation.

**Result:** the 0016 catalog reports 46 installed `SECURITY DEFINER` functions and zero functions without a configured `search_path`. That only proves a setting exists: several use `public, pg_temp`, which is not a safe fixed path for privileged code. Exactly 24 functions in that catalog lack a direct `auth.uid()` reference. The complete inventory and action for every one is below. Trigger/cron helpers are expected to omit caller identity, but must not be callable by client roles.

## Complete inventory: 24 functions without direct `auth.uid()`

Grant notation: **Y/N** is the live result of `has_function_privilege(role, function_oid, 'EXECUTE')` for `anon`, `authenticated`, and `service_role`, respectively. This is effective privilege and does not distinguish a direct role grant from inherited `PUBLIC` EXECUTE. For every function with Y, 0017 must explicitly revoke from that named role as listed in the action; revoking `PUBLIC` alone may leave a role's direct grant intact. The live catalog query was run read-only against the local Supabase database.

| # | Function | Class | Current grants (anon / authenticated / service_role) | 0017 action |
|---:|---|---|---|---|
| 1 | `public.fn_create_pending_attempt_on_group_student()` | trigger helper | Y / Y / Y (live catalog) | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`; keep the attempt-creation trigger. |
| 2 | `public.fn_create_pending_attempt_on_permission()` | trigger helper | Y / Y / Y (live catalog) | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`; keep the attempt-creation trigger. |
| 3 | `public.fn_create_pending_attempts_at_start()` | cron helper | Y / Y / Y (live catalog) | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`; retain only the scheduler's trusted invocation via its trusted database role. Harden `search_path`. |
| 4 | `public.fn_create_profile_on_signup()` | trigger helper | Y / Y / Y (live catalog) | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`; retain signup trigger for now. Role-specific profile provisioning retires with role removal in 0019. |
| 5 | `public.fn_get_exam_questions(uuid,uuid,uuid)` | user-callable RPC | N / N / Y (live catalog) | Revoke EXECUTE from `PUBLIC, anon, authenticated, service_role` on the old signature, then drop it; replace with caller-JWT signature and grant only intended execution. |
| 6 | `public.fn_preserve_in_progress_exam_permission()` | trigger helper | Y / Y / Y (live catalog) | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`; keep integrity trigger unless cutover replaces its table path. |
| 7 | `public.fn_preserve_in_progress_group_access()` | trigger helper | Y / Y / Y (live catalog) | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`; keep integrity trigger unless cutover replaces its table path. |
| 8 | `public.fn_protect_profile_role()` | trigger helper | Y / Y / Y (live catalog) | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`; retain role guard until final role removal in 0019. |
| 9 | `public.fn_require_student_exam_permission()` | trigger helper | Y / Y / Y (live catalog) | **DECISION NEEDED:** (A) replace with a role-free trigger rejecting owner self-exam while preserving valid permission writes; tighter invariant, more trigger logic. (B) remove the trigger and enforce owner self-exam only in the authorization/RPC path; simpler, but trusted/direct database writes need equivalent guards. Either choice must `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`. |
| 10 | `public.fn_require_student_group_member()` | trigger helper | Y / Y / Y (live catalog) | **DECISION NEEDED:** (A) replace with a role-free trigger rejecting owner self-membership; protects all write paths, adds trigger logic. (B) remove the trigger and make invitation redemption the only membership insert path; simpler, but only safe if every direct INSERT/UPDATE grant and policy is removed. Either choice must `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`. |
| 11 | `public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text)` | user-callable RPC | N / N / Y (live catalog) | Revoke EXECUTE from `PUBLIC, anon, authenticated, service_role` on the old signature, then drop it; replace with caller-JWT signature and grant only intended execution. |
| 12 | `public.fn_start_attempt(uuid,uuid,uuid)` | user-callable RPC | N / N / Y (live catalog) | Revoke EXECUTE from `PUBLIC, anon, authenticated, service_role` on the old signature, then drop it; replace with caller-JWT signature and grant only intended execution. |
| 13 | `public.fn_submit_attempt(uuid,uuid,uuid)` | user-callable RPC | N / N / Y (live catalog) | Revoke EXECUTE from `PUBLIC, anon, authenticated, service_role` on the old signature, then drop it; replace with caller-JWT signature and grant only intended execution. |
| 14 | `public.fn_sweep_expired_attempts()` | cron helper | N / N / Y (live catalog) | Keep as-is for grants: live catalog confirms trusted-only EXECUTE (`service_role` only). Harden `search_path` from `public, pg_temp` to a safe fixed path. |
| 15 | `public.fn_sync_user_role()` | trigger helper | Y / Y / Y (live catalog) | `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role`; remove with role mirror in 0019. |
| 16 | `public.list_exam_permissions(uuid)` | user-callable RPC | N / Y / Y (live catalog `proacl`) | `service_role` currently has EXECUTE; explicitly revoke it. REVOKE from `PUBLIC, anon, authenticated, service_role`; DROP the exact old signature; create `public.list_owned_exam_permissions(uuid)` if required. Assert `to_regprocedure('public.list_exam_permissions(uuid)') IS NULL` and replacement signature exists. |
| 17 | `public.list_group_students(uuid)` | user-callable RPC | N / Y / Y (live catalog `proacl`) | `service_role` currently has EXECUTE; explicitly revoke it. REVOKE from `PUBLIC, anon, authenticated, service_role`; DROP the exact old signature; use `public.list_associated_participants(text,uuid)` as the named replacement. Assert `to_regprocedure('public.list_group_students(uuid)') IS NULL`. |
| 18 | `pgbouncer.get_auth(text)` | private helper | N / N / N (live catalog) | Keep as-is; extension-owned authentication helper, outside application cutover. |
| 19 | `private.group_invitation_code_hash(text)` | private helper | N / N / N (live catalog) | Keep as-is: trusted invitation implementation calls it internally; live catalog confirms no listed role can execute it. |
| 20 | `private.group_invitation_new_code()` | private helper | N / N / N (live catalog) | Keep as-is: trusted invitation implementation calls it internally; live catalog confirms no listed role can execute it. |
| 21 | `public.search_student_by_email(text)` | user-callable RPC | N / Y / Y (live catalog `proacl`) | `service_role` currently has EXECUTE; explicitly revoke it. REVOKE from `PUBLIC, anon, authenticated, service_role`; DROP the exact old signature; use `public.lookup_associated_participant(text,uuid,text)` as the named replacement. Assert `to_regprocedure('public.search_student_by_email(text)') IS NULL`. |
| 22 | `supabase_functions.http_request()` | private helper | Y / Y / Y (live catalog) | Keep as-is; extension-owned webhook helper, outside application cutover. Its live ACL is broad; confirm ownership/extension grants before changing it in an application migration. |
| 23 | `vault.create_secret(text,text,text,uuid)` | private helper | N / N / Y (live catalog) | Keep as-is; extension-owned Vault API, outside application cutover. |
| 24 | `vault.update_secret(uuid,text,text,text,uuid)` | private helper | N / N / Y (live catalog) | Keep as-is; extension-owned Vault API, outside application cutover. |

**Count check: 24 rows**, matching both the saved 0016 inventory and the live query exactly. There is no user-callable RPC in this inventory without a planned 0017 replacement or authorization/grant change. The cron helper in row 3 is directly executable by all three roles in the live catalog, so it is marked for explicit client-role revocation. Trigger-returning helpers in rows 1, 2, 4, 6–10, and 15 also have live EXECUTE for all three roles; revoke those role grants explicitly as well as `PUBLIC`, even though PostgreSQL will reject direct invocation of a trigger-returning routine.

## BASELINE WEAKNESS: public cron RPC has client EXECUTE

`public.fn_create_pending_attempts_at_start()` returns `void` and its live `proacl` is `=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres`. The live privilege query returns EXECUTE `true` for `anon`, `authenticated`, and `service_role`. It is `SECURITY DEFINER` in the `public` schema, so the live catalog confirms it is callable as an RPC by `anon`. Revoke `PUBLIC`, `anon`, `authenticated`, and `service_role` explicitly in 0017, then retain invocation only through the trusted cron path.

The live `pg_default_acl` query for schema `public`, object type `f` (functions), shows default EXECUTE grants to `anon`, `authenticated`, and `service_role` for functions created by both `postgres` and `supabase_admin`. New public functions must therefore explicitly revoke EXECUTE from each of those roles (as well as `PUBLIC` where present); revoking `PUBLIC` alone is insufficient.

### Corrections vs earlier inference (not current state)

| Row | Previous inference | Live result | Difference |
|---:|---|---|---|
| 16 `list_exam_permissions(uuid)` | N / Y / N | N / Y / Y | `service_role` can execute; explicitly revoke it before dropping the old RPC. |
| 17 `list_group_students(uuid)` | N / Y / N | N / Y / Y | `service_role` can execute; explicitly revoke it before dropping the old RPC. |
| 21 `search_student_by_email(text)` | N / Y / N | N / Y / Y | `service_role` can execute; explicitly revoke it before dropping the old RPC. |
| 18 `pgbouncer.get_auth(text)` | Not recorded | N / N / N | Live catalog now supplies the grants. |
| 22 `supabase_functions.http_request()` | Not recorded | Y / Y / Y | Live catalog shows all three roles can execute. |
| 23 `vault.create_secret(text,text,text,uuid)` | Not recorded | N / N / Y | Live catalog shows `service_role` can execute. |
| 24 `vault.update_secret(uuid,text,text,text,uuid)` | Not recorded | N / N / Y | Live catalog shows `service_role` can execute. |

The other 17 rows match their previous inference. Live results also confirm rows 1–4, 6–10, and 15 have Y/Y/Y; rows 5, 11–13 have N/N/Y; row 14 has N/N/Y; rows 19–20 have N/N/N.

### Why `fn_sync_owner_mirror_0014()` is not in the 24

The live lookup returned `fn_sync_owner_mirror_0014() | prosecdef=false | search_path=pg_catalog | references_auth_uid=false`. It is a SECURITY INVOKER trigger function, so it is correctly excluded from the 24 SECURITY DEFINER functions. The count remains 24; there is no 24 → 25 adjustment.

## Application SECURITY DEFINER functions that reference `auth.uid()`

Live `proconfig` values are shown. “Relationship check” means the function itself verifies a stored owner, membership, permission, or attempt relationship; a non-null UID or role lookup alone is not sufficient.

The live query selected `pg_get_functiondef(p.oid)` for each application SECURITY DEFINER function whose source references `auth.uid()`. This table covers all **22** such functions returned by that query.

| Function | Live `search_path` | What `auth.uid()` does | Ownership/membership relationship check? | 0017 EXECUTE action |
|---|---|---|---|---|
| `private.is_admin()` | `''` | Looks up the caller's mirrored `admin` role. | **No.** Role-only helper; no resource relationship. | Service role is N live; no service revoke needed. Replace/remove role use before 0019. |
| `private.is_student()` | `''` | Looks up the caller's mirrored `student` role. | **No.** Role-only helper; no resource relationship. | Service role is N live; no service revoke needed. Replace/remove role use before 0019. |
| `private.owns_group(uuid)` | `''` | Compares caller UID to `groups.admin_id`. | **Yes, legacy ownership field.** | Service role is N live; no service revoke needed. Replace admin_id check with owner_id. |
| `private.owns_exam(uuid)` | `''` | Compares caller UID to `exams.admin_id`. | **Yes, legacy ownership field.** | Service role is N live; no service revoke needed. Replace admin_id check with owner_id. |
| `private.is_admin_scoped_student(uuid)` | `''` | Scopes a target profile to groups/exams whose `admin_id` is the caller. | **Yes.** Requires target membership in an owned group or an attempt in an owned exam. | Service role is N live; no service revoke needed. Replace role-based scope with the approved owner relationship. |
| `private.can_access_exam(uuid)` | `''` | Matches caller UID to direct permission or group membership. | **Yes.** Checks a stored direct permission or group membership for a published exam. | Service role is N live; no service revoke needed. Replace role-gated policy use with relationship authorization. |
| `private.can_access_exam_permission(uuid,uuid,uuid)` | `''` | Compares caller UID to a supplied student ID or checks membership in a supplied group ID. | **No, not safely as a standalone call.** It does not verify a stored `exam_permissions` row; a caller can supply its own ID. | Service role is N live; no service revoke needed. Replace with a check against the stored permission row while retaining only required policy execution. |
| `private.owns_attempt(uuid)` | `''` | Compares caller UID to `exam_attempts.student_id`. | **Yes.** Checks a stored participant-attempt relationship. | Service role is N live; no service revoke needed. Keep only participant relationship semantics. |
| `private.owns_exam_attempt(uuid)` | `''` | Compares caller UID to the parent exam's `admin_id`. | **Yes, legacy ownership field.** Checks the stored attempt and exam. | Service role is N live; no service revoke needed. Replace admin_id with owner_id. |
| `private.owns_group_by_owner(uuid)` | `''` | Compares caller UID to `groups.owner_id`; also rejects NULL UID. | **Yes.** Stored group ownership, beyond the NULL check. | Service role is N live; no service revoke needed. Keep authenticated execution for policy/helper use. |
| `private.owns_exam_by_owner(uuid)` | `''` | Compares caller UID to `exams.owner_id`; also rejects NULL UID. | **Yes.** Stored exam ownership, beyond the NULL check. | Service role is N live; no service revoke needed. Keep authenticated execution for policy/helper use. |
| `private.is_current_group_member(uuid)` | `''` | Compares caller UID to `group_students.student_id`; also rejects NULL UID. | **Yes.** Stored group membership, beyond the NULL check. | Service role is N live; no service revoke needed. Keep authenticated execution for policy/helper use. |
| `private.can_access_exam_via_group(uuid)` | `''` | Matches caller UID to `group_students.student_id`; also rejects NULL UID. | **Yes.** Joins membership, exam group permission, and matching group/exam owner. | Service role is N live; no service revoke needed. Keep authenticated execution only where policies require it. |
| `public.create_group_invitation(uuid)` | `''` | Requires non-null caller and records caller as creator. | **Yes.** Also requires admin role and ownership of the target group through `private.owns_group`. | `service_role` is Y in live `proacl`; explicitly `REVOKE EXECUTE FROM service_role`, retain authenticated only (plus revoke PUBLIC/anon). |
| `public.rotate_group_invitation(uuid)` | `''` | Requires non-null caller and records caller as creator. | **Yes.** Also requires admin role and ownership of the target group. | `service_role` is Y in live `proacl`; explicitly `REVOKE EXECUTE FROM service_role`, retain authenticated only (plus revoke PUBLIC/anon). |
| `public.revoke_group_invitation(uuid)` | `''` | Requires non-null caller. | **Yes.** Also requires admin role and ownership of the target group. | `service_role` is Y in live `proacl`; explicitly `REVOKE EXECUTE FROM service_role`, retain authenticated only (plus revoke PUBLIC/anon). |
| `public.get_group_invitation_status(uuid)` | `''` | Requires non-null caller. | **Yes.** Also requires admin role and ownership of the target group. | `service_role` is Y in live `proacl`; explicitly `REVOKE EXECUTE FROM service_role`, retain authenticated only (plus revoke PUBLIC/anon). |
| `public.redeem_group_invitation(text)` | `''` | Sets the membership identity from caller UID. | **Only through the invitation code.** Initial authorization checks non-null UID plus Student role; no explicit owner-self-join check. | `service_role` is Y in live `proacl`; explicitly `REVOKE EXECUTE FROM service_role`, retain authenticated only (plus revoke PUBLIC/anon). |
| `public.list_my_joined_groups()` | `''` | Filters `group_students.student_id` to caller UID. | **Yes.** Returns only groups with a stored caller membership. | `service_role` is Y in live `proacl`; explicitly `REVOKE EXECUTE FROM service_role`, retain authenticated only (plus revoke PUBLIC/anon). |
| `public.list_associated_participants(text,uuid)` | `''` | Establishes requester UID and excludes requester from results. | **Yes.** Requires target context ownership and selects current members/permission-linked members/attempt holders. | Service role is N live; no service revoke needed. Keep authenticated only (plus revoke PUBLIC). |
| `public.lookup_associated_participant(text,uuid,text)` | `''` | Establishes requester identity for ownership, rate limit, association, and self-exclusion. | **Yes.** Requires owned context and current membership/permission/attempt association. | Service role is N live; no service revoke needed. Keep authenticated only (plus revoke PUBLIC). |
| `public.fn_get_student_attempt_result(uuid)` | `public, pg_temp` | Requires non-null UID and selects only an attempt whose `student_id` equals caller UID. | **Yes, participant-attempt ownership.** It also gates on Student role; it has no exam-owner result path. | `service_role` is Y in live `proacl`; explicitly `REVOKE EXECUTE FROM service_role`, retain authenticated only (plus revoke PUBLIC/anon). |

The live `pg_get_functiondef` output identifies `can_access_exam_permission` as a concern: it is `SECURITY DEFINER`, executable by `authenticated`, and its standalone definition does not verify a stored permission row. Replace it with a helper that verifies the stored relationship before retaining authenticated execution for policy evaluation. Among these 22 definitions, none authorizes solely because `auth.uid()` IS NOT NULL; every such non-null check is paired with a role or stored-relationship check. The invitation redemption function lacks a separate owner-self-join check and must add that invariant in 0017.

## Safe-path findings from the live catalog

The accepted safe setting for application functions is `search_path = ''` or `search_path = pg_catalog`. Every SECURITY DEFINER function outside that set is listed here; each listed application function needs `search_path` hardening and schema-qualified references in 0017:

| Function | Live setting | Action |
|---|---|---|
| `public.fn_create_pending_attempt_on_group_student()` | `public, pg_temp` | Pin safe path; internal trigger helper. |
| `public.fn_create_pending_attempt_on_permission()` | `public, pg_temp` | Pin safe path; internal trigger helper. |
| `public.fn_create_pending_attempts_at_start()` | `public, pg_temp` | Pin safe path; cron helper. |
| `public.fn_create_profile_on_signup()` | `public, pg_temp` | Pin safe path; signup trigger. |
| `public.fn_get_exam_questions(uuid,uuid,uuid)` | `public, pg_temp` | Replace signature and pin safe path. |
| `public.fn_get_student_attempt_result(uuid)` | `public, pg_temp` | Pin safe path while revising caller authorization. |
| `public.fn_protect_profile_role()` | `public, pg_temp` | Pin safe path; retain role guard until 0019. |
| `public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text)` | `public, pg_temp` | Replace signature and pin safe path. |
| `public.fn_start_attempt(uuid,uuid,uuid)` | `public, pg_temp` | Replace signature and pin safe path. |
| `public.fn_submit_attempt(uuid,uuid,uuid)` | `public, pg_temp` | Replace signature and pin safe path. |
| `public.fn_sweep_expired_attempts()` | `public, pg_temp` | Pin safe path; preserve its live trusted-only grant. |
| `supabase_functions.http_request()` | `supabase_functions` | Extension-owned, outside 0017. Its path is not empty or pg_catalog-only; do not rewrite extension code in the app migration. |

`fn_sync_owner_mirror_0014()` remains excluded for a separate reason: the live catalog lookup returns `prosecdef=false`, `search_path=pg_catalog`, and no direct `auth.uid()` reference. It is SECURITY INVOKER, not a SECURITY DEFINER function.

## Required regression checks for T031

- Signup still creates a profile after `EXECUTE` on `public.fn_create_profile_on_signup()` is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`; the auth.users insert trigger must still fire as its owner.
- Both scheduled jobs still run after client EXECUTE is revoked from cron helpers: invoke the scheduled functions as their trusted cron/service invoker and assert expected pending-attempt creation and expired-attempt transitions.
- Each retained trigger still fires after its trigger function EXECUTE grants are revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`: profile protection/sync, signup, group/exam role/relationship guards, pending-attempt creation, and in-progress access preservation as applicable to the selected T030 design.

The checks above are regression requirements, not results: no post-0017 catalog or test run has been performed.

## Cutover gate

This list is the input to T030. The after-state contract in `supabase/tests/007-unified-identity/security-definer-0017.sql` checks safe paths, client-callable RPC identity/relationship guards, internal-helper grants, old attempt overloads, and RLS expressions. The four Edge endpoints are covered by `tests/security/007-unified-identity/edge-cutover-0017.test.ts`.

## Raw live psql output

The first result is the unmodified output of the live SECURITY DEFINER inventory query: signature, `prosecdef`, `proconfig`, direct `auth.uid()` source reference, then effective EXECUTE for `anon`, `authenticated`, and `service_role`. The second result is the unmodified `proacl` and return-type query plus the `pg_default_acl` query for public functions.

<details>
<summary>Raw psql output</summary>

```text
pgbouncer.get_auth(text)|t|search_path=""|f|f|f|f
private.can_access_exam_permission(uuid,uuid,uuid)|t|search_path=""|t|f|t|f
private.can_access_exam_via_group(uuid)|t|search_path=""|t|f|t|f
private.can_access_exam(uuid)|t|search_path=""|t|f|t|f
private.group_invitation_code_hash(text)|t|search_path=""|f|f|f|f
private.group_invitation_new_code()|t|search_path=""|f|f|f|f
private.is_admin_scoped_student(uuid)|t|search_path=""|t|f|t|f
private.is_admin()|t|search_path=""|t|f|t|f
private.is_current_group_member(uuid)|t|search_path=""|t|f|t|f
private.is_student()|t|search_path=""|t|f|t|f
private.owns_attempt(uuid)|t|search_path=""|t|f|t|f
private.owns_exam_attempt(uuid)|t|search_path=""|t|f|t|f
private.owns_exam_by_owner(uuid)|t|search_path=""|t|f|t|f
private.owns_exam(uuid)|t|search_path=""|t|f|t|f
private.owns_group_by_owner(uuid)|t|search_path=""|t|f|t|f
private.owns_group(uuid)|t|search_path=""|t|f|t|f
create_group_invitation(uuid)|t|search_path=""|t|f|t|t
fn_create_pending_attempt_on_group_student()|t|search_path=public, pg_temp|f|t|t|t
fn_create_pending_attempt_on_permission()|t|search_path=public, pg_temp|f|t|t|t
fn_create_pending_attempts_at_start()|t|search_path=public, pg_temp|f|t|t|t
fn_create_profile_on_signup()|t|search_path=public, pg_temp|f|t|t|t
fn_get_exam_questions(uuid,uuid,uuid)|t|search_path=public, pg_temp|f|f|f|t
fn_get_student_attempt_result(uuid)|t|search_path=public, pg_temp|t|f|t|t
fn_preserve_in_progress_exam_permission()|t|search_path=""|f|t|t|t
fn_preserve_in_progress_group_access()|t|search_path=""|f|t|t|t
fn_protect_profile_role()|t|search_path=public, pg_temp|f|t|t|t
fn_require_student_exam_permission()|t|search_path=""|f|t|t|t
fn_require_student_group_member()|t|search_path=""|f|t|t|t
fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text)|t|search_path=public, pg_temp|f|f|f|t
fn_start_attempt(uuid,uuid,uuid)|t|search_path=public, pg_temp|f|f|f|t
fn_submit_attempt(uuid,uuid,uuid)|t|search_path=public, pg_temp|f|f|f|t
fn_sweep_expired_attempts()|t|search_path=public, pg_temp|f|f|f|t
fn_sync_user_role()|t|search_path=""|f|t|t|t
get_group_invitation_status(uuid)|t|search_path=""|t|f|t|t
list_associated_participants(text,uuid)|t|search_path=""|t|f|t|f
list_exam_permissions(uuid)|t|search_path=""|f|f|t|t
list_group_students(uuid)|t|search_path=""|f|f|t|t
list_my_joined_groups()|t|search_path=""|t|f|t|t
lookup_associated_participant(text,uuid,text)|t|search_path=""|t|f|t|f
redeem_group_invitation(text)|t|search_path=""|t|f|t|t
revoke_group_invitation(uuid)|t|search_path=""|t|f|t|t
rotate_group_invitation(uuid)|t|search_path=""|t|f|t|t
search_student_by_email(text)|t|search_path=""|f|f|t|t
supabase_functions.http_request()|t|search_path=supabase_functions|f|t|t|t
vault.create_secret(text,text,text,uuid)|t|search_path=""|f|f|f|t
vault.update_secret(uuid,text,text,text,uuid)|t|search_path=""|f|f|f|t
```

```text
create_group_invitation(uuid)|jsonb|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
fn_create_pending_attempts_at_start()|void|=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres|t|t|t
fn_get_student_attempt_result(uuid)|jsonb|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
get_group_invitation_status(uuid)|jsonb|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
list_exam_permissions(uuid)|record|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
list_group_students(uuid)|record|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
list_my_joined_groups()|record|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
redeem_group_invitation(text)|jsonb|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
revoke_group_invitation(uuid)|jsonb|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
rotate_group_invitation(uuid)|jsonb|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
search_student_by_email(text)|record|postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres|f|t|t
DEFAULT_ACL|supabase_admin|public|f|anon|EXECUTE|f
DEFAULT_ACL|supabase_admin|public|f|authenticated|EXECUTE|f
DEFAULT_ACL|supabase_admin|public|f|postgres|EXECUTE|f
DEFAULT_ACL|supabase_admin|public|f|service_role|EXECUTE|f
DEFAULT_ACL|postgres|public|f|anon|EXECUTE|f
DEFAULT_ACL|postgres|public|f|authenticated|EXECUTE|f
DEFAULT_ACL|postgres|public|f|postgres|EXECUTE|f
DEFAULT_ACL|postgres|public|f|service_role|EXECUTE|f
```

</details>

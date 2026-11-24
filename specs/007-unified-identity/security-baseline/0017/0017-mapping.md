# 0017 cutover mapping (read-only)

This is a proposed implementation map, not a migration or a claim that the 0017 changes are applied. The local live catalog returned **29 public RLS policies**, not the expected 27, and **46 SECURITY DEFINER functions**. Current-state statements below are grounded in the read-only local catalog queries and the cited repository files. Proposed replacement names and rules are marked as proposed. (Evidence: live `pg_policies` SELECT, live `pg_proc`/`pg_get_functiondef` catalog SELECT; `specs/007-unified-identity/tasks.md`, T024–T033.)

## 1. Live public RLS policy inventory and proposed mapping

Role dependence means the current rule depends on `private.is_admin()` / `private.is_student()` or role-backed behavior, not merely that Postgres lists `authenticated` as the policy role. Proposed names below are mapping names; T030 must define them and T031 must assert the allow/deny matrix.

| # | Table / current policy | Command and live rule summary | Role-dependent? | Proposed 0017 replacement and rule | Coverage / evidence |
|---:|---|---|---|---|---|
| 1 | answers / answers_admin_select | SELECT; is_admin AND owns_exam_attempt | Yes | `answers_exam_owner_select`; exam owner relationship, no role helper | T024, T031; live `pg_policies: answers_admin_select`; `pre-0017-audit.md` |
| 2 | answers / answers_student_select | SELECT; is_student AND owns_attempt | Yes | `answers_attempt_participant_select`; attempt participant relationship | T024, T031; live `pg_policies: answers_student_select` |
| 3 | exam_attempts / exam_attempts_admin_select | SELECT; is_admin AND owns_exam | Yes | `exam_attempts_exam_owner_select`; owner relationship, safe columns only | T024, T031; live `pg_policies: exam_attempts_admin_select`; tasks.md T030–T031 |
| 4 | exam_attempts / exam_attempts_student_select | SELECT; student_id=auth.uid AND is_student | Yes | `exam_attempts_participant_select`; participant relationship, safe columns only | T024, T031; live `pg_policies: exam_attempts_student_select` |
| 5 | exam_permissions / exam_permissions_admin_delete | DELETE; is_admin AND owns_exam | Yes | `exam_permissions_owner_delete`; owner relationship and group-only row invariant | T024, T031; live `pg_policies: exam_permissions_admin_delete` |
| 6 | exam_permissions / exam_permissions_admin_insert | INSERT; is_admin AND owns_exam | Yes | `exam_permissions_owner_insert`; owner relationship, require group_id and NULL student_id | T024, T031; live `pg_policies: exam_permissions_admin_insert` |
| 7 | exam_permissions / exam_permissions_admin_select | SELECT; is_admin AND owns_exam | Yes | `exam_permissions_owner_select`; owner relationship, group-only permission rows | T024, T031; live `pg_policies: exam_permissions_admin_select` |
| 8 | exam_permissions / exam_permissions_admin_update | UPDATE; is_admin AND owns_exam in USING and WITH CHECK | Yes | `exam_permissions_owner_update`; owner relationship, require group_id and NULL student_id | T024, T031; live `pg_policies: exam_permissions_admin_update` |
| 9 | exam_permissions / exam_permissions_student_select | SELECT; is_student AND can_access_exam_permission(exam_id,student_id,group_id) | Yes | `exam_permissions_group_member_select`; stored group-permission row and current membership | T024, T025, T031; live `pg_policies: exam_permissions_student_select`; approved helper replacement in pasted request |
| 10 | exams / exams_admin_delete | DELETE; admin_id=auth.uid AND is_admin | Yes | `exams_owner_delete`; owner_id relationship | T024, T031; live `pg_policies: exams_admin_delete` |
| 11 | exams / exams_admin_insert | INSERT; admin_id=auth.uid AND is_admin | Yes | `exams_owner_insert`; owner_id must equal caller | T024, T031; live `pg_policies: exams_admin_insert` |
| 12 | exams / exams_admin_select | SELECT; admin_id=auth.uid AND is_admin | Yes | `exams_owner_select`; owner_id relationship | T024, T031; live `pg_policies: exams_admin_select` |
| 13 | exams / exams_admin_update | UPDATE; admin_id=auth.uid AND is_admin in USING and WITH CHECK | Yes | `exams_owner_update`; owner_id relationship in both predicates | T024, T031; live `pg_policies: exams_admin_update` |
| 14 | exams / exams_student_select | SELECT; is_student AND can_access_exam(id) | Yes | `exams_group_member_select`; published exam/group membership rule | T024, T031; live `pg_policies: exams_student_select` |
| 15 | group_students / group_students_admin_delete | DELETE; is_admin AND owns_group | Yes | Keep direct DELETE as `group_students_owner_delete`; owner_id relationship | T024, T031; live `pg_policies: group_students_admin_delete`; task decision in pasted request |
| 16 | group_students / group_students_admin_insert | INSERT; is_admin AND owns_group | Yes | DROP; no replacement direct client INSERT policy; invitation redemption is sole membership creation path | T024, T031; live `pg_policies: group_students_admin_insert`; tasks.md T024/T027 |
| 17 | group_students / group_students_admin_select | SELECT; is_admin AND owns_group | Yes | `group_students_owner_select`; owner relationship | T024, T031; live `pg_policies: group_students_admin_select` |
| 18 | group_students / group_students_admin_update | UPDATE; is_admin AND owns_group in USING and WITH CHECK | Yes | DROP; no replacement direct client UPDATE policy | T024, T031; live `pg_policies: group_students_admin_update`; tasks.md T024 |
| 19 | groups / groups_admin_delete | DELETE; admin_id=auth.uid AND is_admin | Yes | `groups_owner_delete`; owner_id relationship | T024, T031; live `pg_policies: groups_admin_delete` |
| 20 | groups / groups_admin_insert | INSERT; admin_id=auth.uid AND is_admin | Yes | `groups_owner_insert`; owner_id must equal caller | T024, T031; live `pg_policies: groups_admin_insert` |
| 21 | groups / groups_admin_select | SELECT; admin_id=auth.uid AND is_admin | Yes | `groups_owner_select`; owner_id relationship | T024, T031; live `pg_policies: groups_admin_select` |
| 22 | groups / groups_admin_update | UPDATE; admin_id=auth.uid AND is_admin in USING and WITH CHECK | Yes | `groups_owner_update`; owner_id relationship in both predicates | T024, T031; live `pg_policies: groups_admin_update` |
| 23 | profiles / profiles_admin_read_scoped_students | SELECT; is_admin AND is_admin_scoped_student(id) | Yes | DROP; profile projection RPCs provide scoped name/email or id/name | T024, T031; live `pg_policies: profiles_admin_read_scoped_students`; tasks.md T019–T020 |
| 24 | profiles / profiles_self_select | SELECT; id=auth.uid | No role check | Keep unchanged; self row only | T031; live `pg_policies: profiles_self_select` |
| 25 | profiles / profiles_self_update | UPDATE; id=auth.uid in USING and WITH CHECK | No role check | Keep unchanged; self row only; role promotion must not grant owner relationships | T024, T031; live `pg_policies: profiles_self_update` |
| 26 | questions / questions_admin_delete | DELETE; is_admin AND owns_exam(exam_id) | Yes | `questions_exam_owner_delete`; owner relationship | T024, T031; live `pg_policies: questions_admin_delete` |
| 27 | questions / questions_admin_insert | INSERT; is_admin AND owns_exam(exam_id) | Yes | `questions_exam_owner_insert`; owner relationship | T024, T031; live `pg_policies: questions_admin_insert` |
| 28 | questions / questions_admin_select | SELECT; is_admin AND owns_exam(exam_id) | Yes | `questions_exam_owner_select`; owner relationship | T024, T031; live `pg_policies: questions_admin_select` |
| 29 | questions / questions_admin_update | UPDATE; is_admin AND owns_exam(exam_id) in USING and WITH CHECK | Yes | `questions_exam_owner_update`; owner relationship in both predicates | T024, T031; live `pg_policies: questions_admin_update` |

**Task note for T031:** live query = 29 rows: answers 2, exam_attempts 2, exam_permissions 5, exams 5, group_students 4, groups 4, profiles 3, questions 4. The earlier spec expectation of 27 was wrong. T031 freezes on all 29 policies and must assert the complete replacement set. Each row above pairs its live policy and predicate with its proposed replacement; the replacement must not allow any case denied by that old equivalent. T024 explicitly covers group membership writes, owner self-join/self-exam, cross-owner denial, and invitation-only membership creation. The existing post-cutover SQL file has specific cases at `supabase/tests/007-unified-identity/cutover-0017.sql:1-142`; it is not evidence that every proposed policy has already been implemented.

## 2. Function and trigger mapping

The following list covers all 46 live SECURITY DEFINER functions (including extension-owned objects) and the role-dependent function/trigger behavior identified for the cutover. EXECUTE state is effective `has_function_privilege(anon/authenticated/service_role)` unless the row calls out raw `proacl`. `PUBLIC` is not a role in that effective privilege triplet; where currently granted, explicitly revoke PUBLIC too. For new public functions, explicitly revoke `PUBLIC, anon, service_role`, then grant `authenticated` only when the function is an intended user RPC. For internal trigger and cron functions, retain only their trusted invocation context; client revocation alone does not prevent a trigger from invoking its function.

| Live function | Current live state / current role grants (anon/auth/service) | 0017 mapping, exact client revokes, intended grant | Evidence |
|---|---|---|---|
| `pgbouncer.get_auth(text)` | SD, path `''`, no uid; N/N/N | Extension infrastructure; out of 0017 scope | Live function catalog |
| `private.can_access_exam_permission(uuid,uuid,uuid)` | SD, path `''`, uid; N/Y/N | Replace before dropping dependent old policies; revoke `PUBLIC, anon, service_role`; retain authenticated for policy evaluation only | Live function catalog; audit `pre-0017-audit.md:70-95` |
| `private.can_access_exam_via_group(uuid)` | SD, path `''`, uid; N/Y/N | Keep relationship helper or replace if its definition depends on role; revoke `PUBLIC, anon, service_role`; authenticated only for policies | Live function catalog; migrations 0015/0016 |
| `private.can_access_exam(uuid)` | SD, path `''`, uid; N/Y/N | Replace role dependency with group-access rule; revoke `PUBLIC, anon, service_role`; authenticated only for policy evaluation | Live function catalog; migration 0015; `pre-0017-audit.md` |
| `private.group_invitation_code_hash(text)` | SD, path `''`, no uid; N/N/N | Keep private helper; explicit revoke from `PUBLIC, anon, authenticated, service_role`; trusted definer owner only | Live function catalog; invitation migrations |
| `private.group_invitation_new_code()` | SD, path `''`, no uid; N/N/N | Keep private helper; explicit revoke from `PUBLIC, anon, authenticated, service_role`; trusted definer owner only | Live function catalog; invitation migrations |
| `private.is_admin_scoped_student(uuid)` | SD, path `''`, uid; N/Y/N | Retire role-based helper after replacing profile policy with projections; revoke all client roles | Live function catalog; `pre-0017-audit.md:70-95` |
| `private.is_admin()` | SD, path `''`, uid; N/Y/N | Keep through 0017 because profile role remains until 0019; no new authorization policy should depend on it; revoke `PUBLIC, anon, service_role`, retain authenticated only where legacy paths require it until 0019 | Live function catalog; tasks.md T049 |
| `private.is_current_group_member(uuid)` | SD, path `''`, uid; N/Y/N | Keep relationship helper; revoke `PUBLIC, anon, service_role`; authenticated only for policies | Live function catalog; migration 0015 |
| `private.is_student()` | SD, path `''`, uid; N/Y/N | Keep through 0017 for any remaining legacy path, then retire in 0019; revoke `PUBLIC, anon, service_role`, authenticated only while needed | Live function catalog; tasks.md T049 |
| `private.owns_attempt(uuid)` | SD, path `''`, uid; N/Y/N | Keep/rewrite as relationship check; revoke `PUBLIC, anon, service_role`; authenticated only for policy evaluation | Live function catalog; `pre-0017-audit.md` |
| `private.owns_exam_attempt(uuid)` | SD, path `''`, uid; N/Y/N | Replace role and admin_id dependency with exam owner relationship; revoke `PUBLIC, anon, service_role`; authenticated only for policy evaluation | Live function catalog; `pre-0017-audit.md` |
| `private.owns_exam_by_owner(uuid)` | SD, path `''`, uid; N/Y/N | Keep relationship helper; revoke `PUBLIC, anon, service_role`; authenticated only for policies | Live function catalog; migration 0015 |
| `private.owns_exam(uuid)` | SD, path `''`, uid; N/Y/N | Replace role/admin_id dependency with owner_id; revoke `PUBLIC, anon, service_role`; authenticated only for policy evaluation | Live function catalog; `pre-0017-audit.md` |
| `private.owns_group_by_owner(uuid)` | SD, path `''`, uid; N/Y/N | Keep relationship helper; revoke `PUBLIC, anon, service_role`; authenticated only for policies | Live function catalog; migration 0015 |
| `private.owns_group(uuid)` | SD, path `''`, uid; N/Y/N | Replace role/admin_id dependency with owner_id; revoke `PUBLIC, anon, service_role`; authenticated only for policy evaluation | Live function catalog; `pre-0017-audit.md` |
| `public.create_group_invitation(uuid)` | SD, path `''`, uid; N/Y/Y | Keep RPC; service_role currently EXECUTE, revoke `PUBLIC, anon, service_role`, grant authenticated only | Live function catalog; audit invitation grant rows |
| `public.fn_create_pending_attempt_on_group_student()` | SD trigger, path `public, pg_temp`, no uid; Y/Y/Y; PUBLIC also in raw ACL | Revoke `PUBLIC, anon, authenticated, service_role`; trigger remains attached and invoked by trusted database DML | Live function catalog and proacl query; tasks.md T025 |
| `public.fn_create_pending_attempt_on_permission()` | SD trigger, path `public, pg_temp`, no uid; Y/Y/Y; PUBLIC also in raw ACL | Revoke `PUBLIC, anon, authenticated, service_role`; trigger invocation remains trusted | Live function catalog and proacl query; tasks.md T025 |
| `public.fn_create_pending_attempts_at_start()` | SD cron helper, returns void, path `public, pg_temp`, no uid; Y/Y/Y; raw ACL `=X` plus explicit client roles | **Baseline weakness:** anon-callable RPC. Revoke `PUBLIC, anon, authenticated, service_role`; cron job executes as postgres. T031 verifies successful cron runs after 0017 | Live `prosrc/proconfig/proacl` and `cron.job` queries; `pre-0017-audit.md:132-197` |
| `public.fn_create_profile_on_signup()` | SD trigger, path `public, pg_temp`, no uid; Y/Y/Y; PUBLIC also in raw ACL | Revoke `PUBLIC, anon, authenticated, service_role`; signup trigger retains trusted invocation | Live function catalog and proacl query; tasks.md T025 |
| `public.fn_get_exam_questions(uuid,uuid,uuid)` | SD RPC, path `public, pg_temp`, no uid; N/N/Y | Replace old p_student_id signature with `(uuid,uuid)` caller-uid-derived signature; revoke `PUBLIC, anon, service_role`, grant authenticated only | Live function catalog; tasks.md T028/T030; `security-definer-0017.sql` |
| `public.fn_get_student_attempt_result(uuid)` | SD RPC, path `public, pg_temp`, uid; N/Y/Y | Retain signature; add exam-owner result path while preserving participant path and remove Student-role gate. Revoke `PUBLIC, anon, service_role`; grant authenticated only | Live function catalog; audit `pre-0017-audit.md:90-95`; results-service.ts:105 |
| `public.fn_preserve_in_progress_exam_permission()` | SD trigger, path `''`, no uid; Y/Y/Y; PUBLIC also in raw ACL | Keep trigger behavior; revoke `PUBLIC, anon, authenticated, service_role`; trigger invoked by table changes | Live function catalog and proacl query |
| `public.fn_preserve_in_progress_group_access()` | SD trigger, path `''`, no uid; Y/Y/Y; PUBLIC also in raw ACL | Keep trigger behavior; revoke `PUBLIC, anon, authenticated, service_role`; trigger invoked by table changes | Live function catalog and proacl query |
| `public.fn_protect_profile_role()` | SD trigger, path `public, pg_temp`, no uid; Y/Y/Y; PUBLIC also in raw ACL | Keep through 0017 while role exists; revoke `PUBLIC, anon, authenticated, service_role`; trigger remains attached until 0019 | Live function catalog; tasks.md T049 |
| `public.fn_require_student_exam_permission()` | SD trigger, path `''`, no uid; Y/Y/Y; PUBLIC also in raw ACL | DROP this function and its trigger; replace with role-free exam-permission relationship trigger; revoke all client roles on replacement | Live function catalog; explicit decision in pasted request |
| `public.fn_require_student_group_member()` | SD trigger, path `''`, no uid; Y/Y/Y; PUBLIC also in raw ACL | DROP this function and its trigger; replace with role-free owner/group relationship trigger; revoke all client roles on replacement | Live function catalog; explicit decision in pasted request |
| `public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text)` | SD RPC, path `public, pg_temp`, no uid; N/N/Y | Replace with `(uuid,uuid,uuid,text,text)`; derive caller from JWT; revoke `PUBLIC, anon, service_role`, grant authenticated only | Live function catalog; tasks.md T028/T030 |
| `public.fn_start_attempt(uuid,uuid,uuid)` | SD RPC, path `public, pg_temp`, no uid; N/N/Y | Replace with `(uuid,uuid)`; derive caller from JWT; revoke `PUBLIC, anon, service_role`, grant authenticated only | Live function catalog; tasks.md T028/T030 |
| `public.fn_submit_attempt(uuid,uuid,uuid)` | SD RPC, path `public, pg_temp`, no uid; N/N/Y | Replace with `(uuid,uuid)`; derive caller from JWT; revoke `PUBLIC, anon, service_role`, grant authenticated only | Live function catalog; tasks.md T028/T030 |
| `public.fn_sweep_expired_attempts()` | SD cron helper, path `public, pg_temp`, no uid; N/N/Y | Keep cron helper; revoke `PUBLIC, anon, authenticated, service_role`; cron job executes as postgres. T031 verifies successful cron runs after 0017 | Live function catalog and `cron.job`; T025 |
| `public.fn_sync_user_role()` | SD trigger, path `''`, no uid; Y/Y/Y; PUBLIC also in raw ACL | Keep through 0017 because role remains; revoke `PUBLIC, anon, authenticated, service_role`; trigger-only until 0019 | Live function catalog; tasks.md T049 |
| `public.get_group_invitation_status(uuid)` | SD RPC, path `''`, uid; N/Y/Y | Keep authenticated RPC; service_role currently EXECUTE, revoke `PUBLIC, anon, service_role`, authenticated only | Live function catalog; invitation audit |
| `public.list_associated_participants(text,uuid)` | SD RPC, path `''`, uid; N/Y/N | Keep as list replacement; revoke `PUBLIC, anon, service_role`, authenticated only | Live function catalog; migration 0016; tasks.md T027 |
| `public.list_exam_permissions(uuid)` | SD RPC, path `''`, no uid; N/Y/Y | REVOKE then DROP exact old signature; use `list_owned_exam_permissions(uuid)`; assert old signature absent. Revoke service_role too | Live function catalog; audit `pre-0017-audit.md:28,50`; group/exam permissions service |
| `public.list_group_students(uuid)` | SD RPC, path `''`, no uid; N/Y/Y | REVOKE then DROP exact old signature; use `list_associated_participants(text,uuid)`; assert old signature absent. Revoke service_role too | Live function catalog; audit `pre-0017-audit.md:29,51`; group-service.ts:69 |
| `public.list_my_joined_groups()` | SD RPC, path `''`, uid; N/Y/Y | Keep relationship-based RPC; service_role currently EXECUTE, revoke `PUBLIC, anon, service_role`; authenticated only | Live function catalog; tasks.md T030 mapping |
| `public.lookup_associated_participant(text,uuid,text)` | SD RPC, path `''`, uid; N/Y/N | Keep replacement lookup; revoke `PUBLIC, anon, service_role`, authenticated only | Live function catalog; migration 0016; tasks.md T027 |
| `public.redeem_group_invitation(text)` | SD RPC, path `''`, uid; N/Y/Y | Keep as sole membership-creation path; reject owner self-join, remove Student gate; revoke `PUBLIC, anon, service_role`, authenticated only | Live function catalog; invitation audit; tasks.md T024/T027 |
| `public.revoke_group_invitation(uuid)` | SD RPC, path `''`, uid; N/Y/Y | Keep authenticated owner RPC; service_role currently EXECUTE, revoke `PUBLIC, anon, service_role` | Live function catalog; invitation audit |
| `public.rotate_group_invitation(uuid)` | SD RPC, path `''`, uid; N/Y/Y | Keep authenticated owner RPC; service_role currently EXECUTE, revoke `PUBLIC, anon, service_role` | Live function catalog; invitation audit |
| `public.search_student_by_email(text)` | SD RPC, path `''`, no uid; N/Y/Y | REVOKE then DROP exact old signature; use `lookup_associated_participant(text,uuid,text)`; assert old signature absent. Revoke service_role too | Live function catalog; audit `pre-0017-audit.md:33,52`; group-service.ts:60 |
| `supabase_functions.http_request()` | Extension SD trigger, path `supabase_functions`; Y/Y/Y | Extension-owned; out of application migration scope | Live function catalog |
| `vault.create_secret(text,text,text,uuid)` | Extension SD; N/N/Y | Vault extension; out of application migration scope | Live function catalog |
| `vault.update_secret(uuid,text,text,text,uuid)` | Extension SD; N/N/Y | Vault extension; out of application migration scope | Live function catalog |

The 11 application SECURITY DEFINER functions whose live path is `public, pg_temp` are exactly: `fn_create_pending_attempt_on_group_student`, `fn_create_pending_attempt_on_permission`, `fn_create_pending_attempts_at_start`, `fn_create_profile_on_signup`, `fn_protect_profile_role`, `fn_sweep_expired_attempts`, `fn_get_exam_questions`, `fn_save_attempt_answer`, `fn_start_attempt`, `fn_submit_attempt`, and `fn_get_student_attempt_result`. Other application functions in the live list use `search_path=''`; `supabase_functions.http_request()` uses `supabase_functions` and is extension-owned/out of scope. Evidence: live `pg_proc.proconfig` query; `pre-0017-audit.md:101-116`.

### Application SECURITY DEFINER functions that reference `auth.uid()`

This table reproduces the 22 application functions returned by the live source scan plus `pg_get_functiondef`; relationship means a stored owner, membership, permission, or attempt check beyond `auth.uid() IS NOT NULL` or a role lookup. Evidence: live definition query and the matching detailed audit at `pre-0017-audit.md:64-95`.

| Function | Live path | Use of `auth.uid()` | Relationship check beyond non-null / role? |
|---|---|---|---|
| `private.is_admin()` | `''` | Looks up caller's mirrored admin role | No; role-only helper |
| `private.is_student()` | `''` | Looks up caller's mirrored student role | No; role-only helper |
| `private.owns_group(uuid)` | `''` | Compares caller UID with `groups.admin_id` | Yes; stored ownership, legacy field |
| `private.owns_exam(uuid)` | `''` | Compares caller UID with `exams.admin_id` | Yes; stored ownership, legacy field |
| `private.is_admin_scoped_student(uuid)` | `''` | Scopes profile to groups/exams owned by caller | Yes; owned-group membership or attempt in owned exam |
| `private.can_access_exam(uuid)` | `''` | Checks direct permission or group membership for caller | Yes; stored permission or membership for published exam |
| `private.can_access_exam_permission(uuid,uuid,uuid)` | `''` | Compares caller with supplied student ID or membership in supplied group ID | **No safe relationship check:** does not verify a stored `exam_permissions` row; caller-supplied IDs can satisfy the helper |
| `private.owns_attempt(uuid)` | `''` | Compares caller UID with stored attempt student_id | Yes; stored participant-attempt relationship |
| `private.owns_exam_attempt(uuid)` | `''` | Compares caller UID with parent exam admin_id | Yes; stored attempt and exam ownership, legacy field |
| `private.owns_group_by_owner(uuid)` | `''` | Compares caller UID with groups.owner_id | Yes; stored group ownership |
| `private.owns_exam_by_owner(uuid)` | `''` | Compares caller UID with exams.owner_id | Yes; stored exam ownership |
| `private.is_current_group_member(uuid)` | `''` | Compares caller UID with group_students.student_id | Yes; stored group membership |
| `private.can_access_exam_via_group(uuid)` | `''` | Joins group_students against caller UID | Yes; stored membership, exam permission, and matching group/exam owner |
| `public.create_group_invitation(uuid)` | `''` | Requires caller and records creator | Yes; target group owner (also legacy admin role check) |
| `public.rotate_group_invitation(uuid)` | `''` | Requires caller and records creator | Yes; target group owner (also legacy admin role check) |
| `public.revoke_group_invitation(uuid)` | `''` | Requires caller | Yes; target group owner (also legacy admin role check) |
| `public.get_group_invitation_status(uuid)` | `''` | Requires caller | Yes; target group owner (also legacy admin role check) |
| `public.redeem_group_invitation(text)` | `''` | Uses caller UID for membership identity | Invitation code only; it also checks Student role, but no explicit owner-self-join check currently |
| `public.list_my_joined_groups()` | `''` | Filters memberships by caller UID | Yes; stored caller membership |
| `public.list_associated_participants(text,uuid)` | `''` | Establishes requester and excludes requester | Yes; target context ownership and current association |
| `public.lookup_associated_participant(text,uuid,text)` | `''` | Establishes requester for ownership, rate limit, association, self-exclusion | Yes; owned context and current association |
| `public.fn_get_student_attempt_result(uuid)` | `public, pg_temp` | Requires caller UID and filters attempt student_id | Yes; stored participant-attempt relationship; currently also Student-role gates and lacks exam-owner path |

None of the 22 is identified by the live function-definition evidence as authorizing solely on `auth.uid() IS NOT NULL`: `private.is_admin()` and `private.is_student()` are role-only helpers (no resource relationship); the other entries have an ownership/membership/permission/attempt check, with `can_access_exam_permission` the exception because its IDs are caller-supplied rather than tied to a stored permission row. `redeem_group_invitation` still needs the explicit owner-self-join rejection required by the approved decision. Evidence: `pre-0017-audit.md:72-95`.

The query's function counts reconcile as 46 total SECURITY DEFINER, 22 app functions directly referencing `auth.uid()`, and 24 without that direct source reference. `fn_sync_owner_mirror_0014()` is absent from the 46-row SECURITY DEFINER inventory because the live catalog says `prosecdef=false`, `search_path=pg_catalog`, and no `auth.uid()` reference: it is SECURITY INVOKER, not SECURITY DEFINER. Evidence: live catalog query; `pre-0017-audit.md:116`.

## 3. Table and column grants to change

| Object | Current live grants from `information_schema` query | Required 0017 action | Evidence |
|---|---|---|---|
| `public.group_students` | Table-level `anon`, `authenticated`, `service_role`: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE. Column grants for these roles: SELECT/INSERT/UPDATE/REFERENCES on group_id and student_id. | Revoke ALL from PUBLIC and anon. For authenticated, revoke ALL then grant only SELECT and DELETE; direct DELETE remains owner-RLS scoped. Revoke service_role REFERENCES/TRIGGER/TRUNCATE/UPDATE; retain SELECT/INSERT/DELETE only for trusted test fixture setup/cleanup. Membership insertion in runtime remains invitation-only. | Live `information_schema.table_privileges` and `column_privileges`; `supabase/tests/007-unified-identity/fixture-setup.sql:80`; `cutover-0017.sql:74-75`; test callers below |
| `public.exam_attempts` | **Baseline weakness: anon has full table privileges**: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, plus column SELECT/INSERT/UPDATE/REFERENCES including `access_token`. Authenticated table-level: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE; authenticated column SELECT excludes access_token, but column INSERT/UPDATE/REFERENCES include it. service_role has the full table set and column access including access_token. | Revoke ALL (including TRUNCATE, TRIGGER, REFERENCES) from PUBLIC, anon, authenticated. Grant authenticated SELECT on exactly `id, exam_id, student_id, status, started_at, finished_at, session_id`; no anon grants. Revoke service_role REFERENCES/TRIGGER/TRUNCATE; retain SELECT/INSERT/UPDATE/DELETE only for trusted test fixture setup/cleanup. T031 must assert `access_token` is unreadable, including `select=*`. | Live `information_schema` table/column grants; `fixture-setup.sql:93,106`; `cutover-0017.sql:74-75`; `tests/unit/edge-functions/attempt-test-context.ts:48`; `tests/unit/services/exam-permissions.test.ts:22,127` |
| `public.exam_permissions` | Table-level `anon`, `authenticated`, `service_role`: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE. Column grants for these roles: SELECT/INSERT/UPDATE/REFERENCES on id, exam_id, group_id, student_id. | Revoke ALL from PUBLIC and anon. Authenticated keeps SELECT/DELETE under owner RLS; revoke table INSERT/UPDATE, then grant INSERT(`exam_id`,`group_id`) and UPDATE(`exam_id`,`group_id`) only, with id defaulted and student_id unwriteable; revoke REFERENCES/TRIGGER/TRUNCATE. For service_role, revoke UPDATE/REFERENCES/TRIGGER/TRUNCATE; retain SELECT/INSERT/DELETE only for trusted test fixture setup/cleanup. | Live `information_schema` table/column grants; `fixture-setup.sql:73`; invitation/exam-permission tests use adminClient (e.g. `tests/unit/services/group-invitation-lifecycle.test.ts:40`) |

The merged `information_schema` result reports both table-level and column-level privileges, so a blank `column_name` is a table-level grant. `PUBLIC` was not listed as a direct grantee in this live query; explicit REVOKE from PUBLIC is still required to clear inherited/default access. In the searched application runtime, `supabase/functions/_shared/http.ts:67` uses service_role for RPC calls, not direct writes to these tables; no service_role table caller was found in `supabase/functions`. Test fixtures do use the admin/service client for setup and cleanup: `fixture-setup.sql:73,80,93,106`, `cutover-0017.sql:74-75`, `tests/unit/edge-functions/attempt-test-context.ts:48`, and test files listed in section 6. Therefore production runtime has no evidenced service_role caller, while trusted fixtures currently rely on it; retain only the fixture-required DML/SELECT privileges until fixture setup is moved to a privileged SQL path. `scripts/` does not exist in this repository (`rg` returned path-not-found). No conclusion here depends on RLS alone; T030 must remove grants as well as policies.

### Data migration for group-only invariant

The live pre-cleanup `exam_permissions` query joined to `exams` returned six rows, including row `38beaca6-05ae-49bf-93ba-0eb4f57fe590`: exam `c7000000-0000-4000-8000-000000000001` (“007 Baseline Exam A”), student `a7000000-0000-4000-8000-000000000003`, and NULL `group_id`. A read-only join to `auth.users` identifies that student as `participant-a-007@example.test` (the `.test` fixture domain). That exam has attempt `e7000000-0000-4000-8000-000000000001` for the same student, status `abandoned`, with NULL `started_at` and `finished_at`. A literal-ID grep over `supabase/tests` and `tests` returned no matches; the only discovered seed-named file is `src/lib/fixtures/public-home-course-seed.server.ts`, also with no match. The user has approved the row as disposable test data and approved deleting only this permission row via a separate explicit statement before 0017. Current live verification reports the permission id absent and zero rows with non-NULL `student_id`; the attempt remains present and unchanged. This turn only ran SELECTs; it did not perform the deletion.

| Rejected migration alternatives | Why rejected |
|---|---|
| Delete the permission row inside 0017 | Rejected: cleanup must be a separate explicit statement before the migration; migration must not silently delete data. The approved separate cleanup is now complete according to user direction and current read-only verification. |
| Convert the permission to a group row | Rejected: no associated group conversion was approved; it could change or broaden access. |
| Adjust a test/seed fixture instead | Rejected: grep found no test/seed file referencing this permission id; the approved cleanup removes only the permission row. |

The migration retains a fail-fast assertion that raises if any `exam_permissions.student_id IS NOT NULL` row exists. After the pre-migration cleanup and assertion prove the data compliant, add the group-only CHECK as NOT VALID and then VALIDATE it. Do not put the row deletion inside the migration and do not delete the related attempt. **Decision CLOSED** for this identified row; any other student-specific row causes the assertion to fail.

## 4. Required single-transaction ordering

The cutover is ONE transaction: Postgres does not expose intermediate DDL/grant/policy states to external sessions before commit, and any error rolls the transaction back. Ordering still matters for dependency management and in-transaction assertions. It does not, by itself, prove equivalent security. Postgres OR-combines permissive policies; adding a replacement beside an old permissive policy can only preserve or widen access during the overlap. Therefore do not claim that overlapping policies are safe. Use the 29 row-by-row comparisons in section 1 as the required equivalence baseline; any NEW policy must be no broader than its old equivalent. Prove safety through final-state catalog/grant/signature assertions and the T031 frozen allow/deny matrix, not ordering alone. (Evidence: PostgreSQL permissive-policy semantics; tasks.md T030/T031; live 29-row list in section 1.)

| Order | Statement group | Ordering rationale and required proof | Evidence / constraint |
|---:|---|---|---|
| 1 | Begin the single migration transaction; establish fail-fast assertions | All DDL/grants/policy changes are atomic to external sessions; failure aborts the whole transaction | tasks.md T030 atomic cutover rule |
| 2 | Create/replace fixed-path, schema-qualified relationship helpers, including stored-row-validating `can_access_exam_permission`; set owners and explicit grants | Required dependencies exist before RPCs/triggers/policies reference them; revoke default/public/client grants immediately | Live helper definitions/grants; pasted decision; T025 |
| 3 | Create replacement RPCs and role-free relationship triggers with safe paths and grants | New RPC/trigger definitions are complete before policies switch or old functions/triggers are removed | tasks.md T030; approved trigger/RPC decisions |
| 4 | Create replacement policies from each row's section 1 baseline comparison | Policies are prepared after helpers exist. Do not treat overlap with old permissive policies as a security proof; final transaction state and T031 determine the resulting access | Live `pg_policies` 29-row inventory; tasks.md T030/T031 |
| 5 | Revoke obsolete EXECUTE and table/column grants, including all unneeded PUBLIC/anon/service_role grants and direct client writes | Cut off direct callable/table paths before their old objects are dropped; account for default privileges explicitly | Live `proacl`, `information_schema` and `pg_default_acl` results; audit `pre-0017-audit.md:132-197` |
| 6 | Drop old policies, then obsolete RPC overloads and functions/triggers; REVOKE then DROP old listing/search RPCs; retain owner-only group_students DELETE | Removes legacy paths only after replacement definitions are present; assertions verify the exact old signatures/objects are absent | tasks.md T030/T031; `pre-0017-audit.md:28-33`; approved decisions |
| 7 | Run final in-transaction assertions for policy/function counts, signatures, grants, fixed paths, cron configuration, and group-only data constraints; commit only if all pass | These final-state checks plus T031's complete frozen matrix prove the candidate cutover; ordering alone does not | tasks.md T025/T031/T032; section 1 comparisons and section 3 data assertion |

### Raw live query output before separately approved cleanup: exam_permissions rows joined to exams

| id | exam_id | student_id | group_id | exam.title | exam.admin_id | exam.owner_id |
|---|---|---|---|---|---|---|
| 2a8c342f-5cf0-49ca-ad53-4610b9cbae3b | 0822375f-83b0-4222-9fef-ebdd57008f28 | NULL | 7a34466b-ba11-46e8-a8c4-46bf862a4a4c | Invitation lifecycle exam | 43e7a687-d7a5-420f-8061-98b1c43b2406 | 43e7a687-d7a5-420f-8061-98b1c43b2406 |
| 3480d068-862b-4352-ba4c-8daaced3245d | c7000000-0000-4000-8000-000000000002 | NULL | b7000000-0000-4000-8000-000000000002 | 007 Baseline Exam B | a7000000-0000-4000-8000-000000000002 | a7000000-0000-4000-8000-000000000002 |
| 38beaca6-05ae-49bf-93ba-0eb4f57fe590 | c7000000-0000-4000-8000-000000000001 | a7000000-0000-4000-8000-000000000003 | NULL | 007 Baseline Exam A | a7000000-0000-4000-8000-000000000001 | a7000000-0000-4000-8000-000000000001 |
| 4f3f61ba-7606-484c-a005-10273865a779 | c7000000-0000-4000-8000-000000000003 | NULL | b7000000-0000-4000-8000-000000000001 | 007 Baseline RPC Exam | a7000000-0000-4000-8000-000000000001 | a7000000-0000-4000-8000-000000000001 |
| ccdaf629-9646-44ec-a510-d96df685e534 | c7000000-0000-4000-8000-000000000001 | NULL | b7000000-0000-4000-8000-000000000001 | 007 Baseline Exam A | a7000000-0000-4000-8000-000000000001 | a7000000-0000-4000-8000-000000000001 |
| e2b04f8a-3d05-4297-8842-bb4d8e38469a | 4b23b736-8001-4d7b-92dc-72f5137292b9 | NULL | 05a4a568-0687-4b66-b112-d76cf9413590 | Invitation lifecycle exam | 0ad5540f-c9d2-43dc-991e-55257aaf56d5 | 0ad5540f-c9d2-43dc-991e-55257aaf56d5 |

### Current read-only verification after the approved separate cleanup

| Query result | Raw value |
|---|---|
| student_specific_permissions | 0 |
| target_permission | 0 |
| target_attempt | `e7000000-0000-4000-8000-000000000001|a7000000-0000-4000-8000-000000000003|abandoned||` |
| account lookup | `a7000000-0000-4000-8000-000000000003|participant-a-007@example.test` |

The target student ID/email lookup and attempt lookup were separate read-only SELECT results. The test/seed file grep returned no matches for the permission UUID; `rg --files` found only `src/lib/fixtures/public-home-course-seed.server.ts` as a seed-named path, and it had no UUID match.

### Raw live cron query output

| jobid | username | schedule | command |
|---:|---|---|---|
| 1 | postgres | `* * * * *` | `SELECT fn_create_pending_attempts_at_start();` |
| 2 | postgres | `* * * * *` | `SELECT fn_sweep_expired_attempts();` |

| jobid | username | status | command | return_message | start_time (UTC) |
|---:|---|---|---|---|---|
| 2 | postgres | succeeded | `SELECT fn_sweep_expired_attempts();` | 1 row | 2026-11-09 21:18:00.094584+00 |
| 1 | postgres | succeeded | `SELECT fn_create_pending_attempts_at_start();` | 1 row | 2026-11-09 21:18:00.087170+00 |
| 2 | postgres | succeeded | `SELECT fn_sweep_expired_attempts();` | 1 row | 2026-11-09 21:17:00.134459+00 |
| 1 | postgres | succeeded | `SELECT fn_create_pending_attempts_at_start();` | 1 row | 2026-11-09 21:17:00.127811+00 |
| 1 | postgres | succeeded | `SELECT fn_create_pending_attempts_at_start();` | 1 row | 2026-11-09 21:16:00.434915+00 |
| 2 | postgres | succeeded | `SELECT fn_sweep_expired_attempts();` | 1 row | 2026-11-09 21:16:00.385001+00 |
| 2 | postgres | succeeded | `SELECT fn_sweep_expired_attempts();` | 1 row | 2026-11-09 21:15:00.121552+00 |
| 1 | postgres | succeeded | `SELECT fn_create_pending_attempts_at_start();` | 1 row | 2026-11-09 21:15:00.114387+00 |

Both job commands are unqualified, but execute as `postgres`. T031 must verify that the unqualified commands still resolve to the intended `public` functions after their search_path hardening and that `cron.job_run_details` records successful runs after 0017. Recommendation only: schema-qualify future job commands as `public.fn_create_pending_attempts_at_start()` and `public.fn_sweep_expired_attempts()` to avoid search-path ambiguity; do not change the existing cron jobs as part of this mapping.

## 5. TS and Edge behavior map

| File | Current behavior evidenced in source | Required behavior / response-shape consideration | Evidence |
|---|---|---|---|
| `supabase/functions/_shared/http.ts` | `callOperation` uses service client RPC and adds `p_student_id: user.id` (line 67 per task input) | Use a client carrying the verified caller Authorization header; do not use service-role for these RPCs. Remove injected identity argument. Preserve endpoint response/error mapping unless the new RPC changes it | tasks.md T028; pasted request line reference; existing `edge-cutover-0017.test.ts` |
| `supabase/functions/start-attempt/index.ts` | Endpoint passes operation args; shared wrapper injects p_student_id | Call `fn_start_attempt(uuid,uuid)` with same parameter names/order minus p_student_id; caller JWT supplies identity | tasks.md T028/T030; `security-definer-0017.sql` |
| `supabase/functions/get-exam-questions/index.ts` | Endpoint passes operation args; shared wrapper injects identity | Call `fn_get_exam_questions(uuid,uuid)`; maintain existing JSON response excluding answer keys | tasks.md T028/T030; Edge cutover tests |
| `supabase/functions/save-answer/index.ts` | Endpoint passes operation args; shared wrapper injects identity | Call `fn_save_attempt_answer(uuid,uuid,uuid,text,text)`; preserve response unless RPC contract requires shape adaptation | tasks.md T028/T030 |
| `supabase/functions/submit-attempt/index.ts` | Endpoint passes operation args; shared wrapper injects identity | Call `fn_submit_attempt(uuid,uuid)`; preserve response contract | tasks.md T028/T030 |
| `src/lib/services/group-service.ts` | `createGroup` writes `admin_id` at line 23; exact email lookup calls `search_student_by_email` at line 60; member listing calls `list_group_students` at line 69; task also identifies direct upsert add flow | T027 replaces legacy list/search and direct add/upsert with scoped projections and invitation redemption; retain `removeStudentFromGroup` direct DELETE under owner-only RLS. Move `createGroup` write `admin_id` -> `owner_id` to T039 alongside exam-service/types, relying on the 0014 bridge in the interim so 0017 stays minimal | `group-service.ts:23,60,69`; tasks.md T027/T039; migrations 0014/0018 |
| `src/app/admin/groups/[groupId]/page.tsx` | Lines 26,37,47,55 currently use email search/direct-add flow per task input | Replace email add with invitation code create/rotate/revoke/status flow; the existing invitation RPCs provide that path. Associated participant lookup remains for scoped lookup only, not membership creation | tasks.md T027; pasted request line references |
| `src/components/admin/ExamPermissions.tsx` | Uses `searchStudentsByEmail` per task input | Exam permissions become group-only; remove by-email student selector and use an owned group context (`kind=group`, context id = selected group). UI needs a group selection/control to assign or revoke exam access. Exact replacement UX is unresolved and listed below | task input line 8,30; `exam-permissions-service.ts:18`; explicit group-only decision |
| `src/lib/services/exam-permissions-service.ts` | Calls `list_exam_permissions` at line 18 | Call `list_owned_exam_permissions(uuid)` and adapt rows to group-only permission shape | `exam-permissions-service.ts:18`; pasted decision |
| `src/lib/services/results-service.ts` | Calls `fn_get_student_attempt_result(uuid)` at line 105 | Keep the same signature; new implementation must authorize either attempt participant or exam owner and remove Student-role gate. Confirm response keys remain compatible with caller | `results-service.ts:105`; tasks.md T030; `pre-0017-audit.md:90-95` |
| `src/lib/services/exam-service.ts` | Exam insert writes `admin_id` at line 71 | Keep using `admin_id` through 0017 if bridge trigger synchronizes `owner_id`; update to `owner_id` in T039 before 0018 drops `admin_id`, minimizing scope in atomic security cutover | `exam-service.ts:71`; migrations 0014/0018; tasks.md T039/T043 |
| `src/lib/types.ts` | Group and Exam types include `admin_id` at lines 24 and 38 | Keep both fields while bridge schema remains in 0017; switch reads/writes/types to owner_id in T039 before 0018. Remove admin_id only after 0018 | `types.ts:24,38`; tasks.md T039/T043 |

The four endpoint signatures in T030 agree with the requested removal of `p_student_id`: start `(uuid,uuid)`, get questions `(uuid,uuid)`, save answer `(uuid,uuid,uuid,text,text)`, submit `(uuid,uuid)`. This agreement is based on the task contract, not a live migration. The existing `edge-cutover-0017.test.ts` asserts caller-JWT forwarding and body identity spoof denial; it must be rerun after implementation.

## 6. Gaps and inconsistencies

| Gap / inconsistency | Evidence | Required resolution before T030/T031 is complete |
|---|---|---|
| Policy count is 29, not the old expected 27 | Live `pg_policies` output; section 1 count | T031 freezes all 29 entries; the spec's expectation of 27 was wrong |
| Current `group_students` has every table privilege granted to anon/authenticated/service_role | Live table grant result: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE; column grant result includes all four column privilege types | Revoke all anon and PUBLIC; authenticated SELECT/DELETE only; preserve only fixture-required service_role SELECT/INSERT/DELETE |
| Current `exam_attempts` has a baseline anon full-privilege weakness and authenticated write privileges | Live table grant result: anon full seven privileges; authenticated six privileges excluding SELECT table-level but safe-column SELECT and INSERT/UPDATE/DELETE/etc.; column grant includes anon `access_token` access | Revoke ALL including TRUNCATE/TRIGGER/REFERENCES from PUBLIC, anon, authenticated; grant authenticated only the seven safe SELECT columns; T031 checks `select=*` cannot expose access_token |
| Current `exam_permissions` has every table privilege granted to anon/authenticated/service_role and permits student_id column writes | Live table grant result: all seven privilege types for each role; live column grant result includes student_id SELECT/INSERT/UPDATE/REFERENCES | Revoke all anon/PUBLIC; authenticated owner-RLS CRUD only with INSERT/UPDATE limited to exam_id/group_id, enforcing student_id NULL; fixture-only minimum service_role privileges |
| New public functions inherit broad default EXECUTE privileges | `pre-0017-audit.md:132-197` raw `pg_default_acl`; live query evidence recorded there | Each new public function must explicitly revoke PUBLIC/anon/service_role and grant authenticated only when intended |
| fn_create_pending_attempts_at_start is anon-callable despite being a cron helper | Live proacl query, `pre-0017-audit.md:132-197`; return type void; live `cron.job` job 1 runs as postgres each minute | Treat as baseline weakness; revoke PUBLIC, anon, authenticated, service_role; assert a successful cron.job_run_details entry after 0017 |
| Cron commands use unqualified function names | Live `cron.job` rows 1 and 2 show unqualified SELECTs with username postgres | T031 verifies cron.job_run_details success after cutover; recommend schema-qualifying future command strings without changing jobs in this mapping |
| Task list treats T027–T033 as one coupled release; requested work does not authorize applying migration | tasks.md T030/T033 | Keep this mapping read-only; migration, TS/Edge, and service/UI changes stay coupled in their later authorized task |
| Invitation-management client callers and exact service wrappers are not demonstrated by cited source scan | task input says invitation RPCs already exist; the supplied search evidence establishes database functions but not every client call | Before T027, grep all invitation RPC callers and confirm create/rotate/revoke/status response contracts |
| `ExamPermissions.tsx` has no approved replacement interaction design | task input identifies current student search; group-only decision removes that path | Confirm group picker and assignment/revocation flow before editing screen/service |
| Source references to `admin_id` persist in group-service, exam-service, and types | `group-service.ts:23`; `exam-service.ts:71`; `types.ts:24,38`; tasks.md T039 | Move all three writes/types to `owner_id` together in T039 before 0018; rely on 0014 bridge during 0017 and keep T027 minimal |
| Legacy `profiles.role` references remain until 0019, by plan | tasks.md T049 and live role helpers/triggers | T017 must avoid relying on role for new authorization; T049 removes role column/helpers only after UI and authorization migration |
| Local source grep found `admin_id` in legacy migrations and test fixtures as well as the listed live app files | `rg -n "admin_id|profiles\.role" src supabase tests` results include migrations 0001/0014, before tests, fixture setup, owner-mirror tests, and listed service/type files | Distinguish historical migration/test fixture references from active post-0017 app use; T032/T045 scope their scans accordingly |
| Old caller search: group-service calls `search_student_by_email` and `list_group_students`; exam-permissions service calls `list_exam_permissions`; result service calls `fn_get_student_attempt_result` | `group-service.ts:60,69`; `exam-permissions-service.ts:18`; `results-service.ts:105`; `rpc-trigger-before.test.ts:47-59,179-182` | Update/remove all these callers and tests before asserting the old signatures absent |
| No production service_role table caller is evidenced; trusted test setup/cleanup uses admin/service credentials | Search of `supabase/functions`, `tests`, and `supabase/tests`: no direct table operation in functions; `http.ts:47,67` uses service client for RPC, while fixture setup and tests access the tables through admin/service clients | Retain only fixture-required table DML/SELECT for service_role until fixture setup moves to a privileged SQL path; revoke unused REFERENCES/TRIGGER/TRUNCATE and DML without an evidenced test need. `scripts/` is absent in this repository. |
| T024/T025/T026 after-state test files exist but do not prove migration is applied | `supabase/tests/007-unified-identity/cutover-0017.sql:1-142`; `security-definer-0017.sql:1-56`; `edge-cutover-0017.test.ts:1-108`; tasks.md T024–T026 checked | Treat as candidate assertions only; do not report passing behavior without running them against candidate migration |
| Membership trigger design must prohibit owner self-membership and owner self-exam permission while remaining role-free | Explicit user decision in pasted request; existing trigger functions listed in live function catalog | Implement replacement triggers before dropping old trigger functions; T024 must assert both forbidden writes |
| The catalog inventory excludes `fn_sync_owner_mirror_0014` appropriately | Live catalog says SECURITY INVOKER, path `pg_catalog`, no direct auth.uid; `pre-0017-audit.md:116` | Keep out of 46 SECURITY DEFINER count; separately test bridge behavior in T009/T011 evidence |

### Search evidence for section 1 and section 6

| Purpose | Search command / observed evidence |
|---|---|
| Section 1 policy inventory | `SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;` returned 29 policy rows, enumerated in section 1. |
| Section 6 caller and `admin_id` evidence | `rg -n "admin_id|profiles\.role|list_exam_permissions|list_group_students|search_student_by_email|fn_get_student_attempt_result" src supabase/migrations/0001_schema.sql supabase/migrations/0016_profile_projections.sql supabase/tests/007-unified-identity tests/security/007-unified-identity --glob '!**/node_modules/**'` returned active app callers at `group-service.ts:23,60,69`, `exam-permissions-service.ts:18`, `results-service.ts:105`, and `exam-service.ts:71`, plus historical migrations/tests/fixtures. |
| Section 6 current grants | Read-only `information_schema.table_privileges` + `information_schema.column_privileges` query for `group_students`, `exam_attempts`, `exam_permissions`; see grant findings in section 3. |
| Section 6 security-definer/default grant evidence | Read-only `pg_proc` query with `prosecdef`, `proconfig`, source `auth.uid()` reference, effective `has_function_privilege`; raw `proacl`, return type, and `pg_default_acl` output recorded unmodified in `pre-0017-audit.md:132-197`. |

## 7. Design principles applied

| Principle | Application to this cutover |
|---|---|
| Single authorization layer | Policies call private relationship helpers; keep predicates declarative and avoid inline ownership/membership logic in policies. |
| RPC-only sensitive writes | Attempt and membership-sensitive writes use SECURITY DEFINER RPCs that derive identity from auth.uid(); revoke direct anon/authenticated writes. |
| Least-privilege grants | Revoke PUBLIC/default grants explicitly; grant only required roles and columns. New functions and policies require allow and deny regression cases. |
| Explicit relationship triggers | Use explicitly named role-free triggers for owner self-membership and owner self-exam constraints, fixed empty search_path, schema-qualified references, and no client EXECUTE grants. |
| Extension pattern | Feature 008-courses should add relationship helpers following the same pattern without modifying existing policies. |

## 8. Decisions closed / remaining decision

| Item | Status |
|---|---|
| ExamPermissions replacement | Closed: group picker with grant/revoke controls; no student-by-email selection. |
| `group_students` deletion | Closed: direct DELETE remains, authenticated and owner-RLS scoped. |
| `exam_permissions` owner management | Closed: authenticated owner-RLS CRUD remains; do not convert to RPC-only. Direct INSERT/UPDATE are limited to exam_id/group_id; student_id remains NULL. |
| Cron EXECUTE | Closed by live evidence: both jobs run as postgres, so service_role needs no EXECUTE on either cron helper; explicitly revoke PUBLIC, anon, authenticated, service_role. T031 checks successful `cron.job_run_details` entries after 0017. |
| Existing student permission row | Closed: user approved separate pre-0017 deletion of only `38beaca6-05ae-49bf-93ba-0eb4f57fe590`; current SELECT confirms that id and all non-NULL `student_id` rows are absent, while the abandoned attempt remains. Migration still fail-fast asserts and does not delete data. |

## Files and evidence read

| Input | Use |
|---|---|
| User-pasted task text | Scope, decisions, required mappings, and output requirements |
| `specs/007-unified-identity/tasks.md` | T024–T033 cutover contracts and T039/T043 owner-field sequencing |
| `specs/007-unified-identity/security-baseline/0017/pre-0017-audit.md` | T029 function audit, raw function/grant/default-privilege output, prior function findings |
| Local Supabase catalog via read-only SELECT | Live RLS policies, SECURITY DEFINER/proconfig/prosrc/auth.uid/grants, and table/column privileges |
| `src/lib/services/group-service.ts` | Membership, participant lookup/list, owner field callers |
| `src/lib/services/exam-permissions-service.ts` | Permission-list RPC caller |
| `src/lib/services/results-service.ts` | Attempt result RPC caller |
| `src/lib/services/exam-service.ts` | Exam owner field write |
| `src/components/admin/ExamPermissions.tsx` | Current student lookup selection input |
| `src/app/admin/groups/[groupId]/page.tsx` | Group invitation/add-member UI target identified by task |
| `src/lib/types.ts` | Group/Exam owner field types |
| `supabase/functions/_shared/http.ts` and four attempt Edge handlers | JWT forwarding and RPC argument contract identified by T028 |
| `supabase/tests/007-unified-identity/cutover-0017.sql` | Candidate after-state SQL assertions |
| `supabase/tests/007-unified-identity/security-definer-0017.sql` | Candidate catalog/security assertions |
| `tests/security/007-unified-identity/edge-cutover-0017.test.ts` | Candidate Edge JWT/spoof tests |
| `tests/security/007-unified-identity/rpc-trigger-before.test.ts` | Existing callers of old list/search/result RPCs |
| `supabase/migrations/0001_schema.sql`, `0014_owner_id_bridge.sql`, `0015_relationship_helpers.sql`, `0016_profile_projections.sql` | Current schema provenance, owner mirror, relationship helpers, projections |

No migration, TS/Edge file, test, UI file, or database object was changed by this mapping. No migration was applied, no reset was run, and no commit/staging action was performed.

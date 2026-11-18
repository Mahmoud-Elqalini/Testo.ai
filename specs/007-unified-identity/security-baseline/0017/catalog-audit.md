# 0017 Catalog Audit (T032)

Date: 2026-11-19
Target: local Supabase database `supabase_db_05_Testo`, schema state after migration 0019.
Method: read-only `SELECT` queries run via `docker exec supabase_db_05_Testo psql -U postgres`. Raw outputs were captured to `%TEMP%\audit-secdef.txt`, `%TEMP%\audit-gs-insert.txt`, `%TEMP%\audit-policies.txt`.

## 1. SECURITY DEFINER functions (schemas public, private)

Query:

```sql
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       coalesce(array_to_string(p.proconfig,','),'NONE'),
       has_function_privilege('anon',p.oid,'EXECUTE'),
       has_function_privilege('authenticated',p.oid,'EXECUTE'),
       has_function_privilege('service_role',p.oid,'EXECUTE'),
       has_function_privilege('public',p.oid,'EXECUTE'),
       (pg_get_functiondef(p.oid) ~* 'auth\.uid\(\)')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prosecdef and n.nspname in ('public','private') order by 1,2;
```

Result: 37 functions.

- `search_path`: all 37 have `search_path=""` (none mutable or unset).
- `anon`, `service_role`, `PUBLIC` EXECUTE: false for all 37.
- Client-callable (`authenticated` = true): every one references `auth.uid()`: RPCs (`fn_start_attempt`, `fn_get_exam_questions`, `fn_save_attempt_answer`, `fn_submit_attempt`, `fn_get_student_attempt_result`, `create/get/rotate/revoke_group_invitation`, `redeem_group_invitation`, `list_associated_participants`, `lookup_associated_participant`, `list_my_joined_groups`, `list_owned_exam_permissions`) and `private.*` ownership/membership helpers.
- Not client-callable (`authenticated` = false): triggers, cron and internal helpers (`fn_create_pending_attempt_on_group_student`, `fn_create_pending_attempt_on_permission`, `fn_create_pending_attempts_at_start`, `fn_create_profile_on_signup`, `fn_preserve_in_progress_exam_permission`, `fn_preserve_in_progress_group_access`, `fn_protect_profile_role`, `fn_sync_user_role`, `fn_sweep_expired_attempts`, `private.group_invitation_code_hash`, `private.group_invitation_new_code`).
- Known legacy, scheduled for removal in 0021: `private.is_admin`, `private.is_student`, `fn_protect_profile_role`, `fn_sync_user_role`. None is client-callable and none is used by an active policy.

Limitation: the query shows that a function mentions `auth.uid()`, not that it enforces it correctly. Enforcement is covered by the security matrix (`catalog.user_rpc_auth_and_relationship_checks` and the allow/deny cases).

## 2. Paths that insert into group_students

Query:

```sql
select n.nspname, p.proname, p.prosecdef,
       has_function_privilege('authenticated',p.oid,'EXECUTE'),
       has_function_privilege('anon',p.oid,'EXECUTE')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prokind='f' and n.nspname in ('public','private')
  and case when p.prokind='f'
      then pg_get_functiondef(p.oid) ~* 'insert\s+into\s+(public\.)?group_students'
      else false end
order by 1,2;
```

Result: one function, `public.redeem_group_invitation` (SECURITY DEFINER, authenticated = true, anon = false).

Client table writes are separately denied: `authenticated`/`anon` have no INSERT/UPDATE on `group_students` (case `cutover.group_students.no_client_insert`). Fixture inserts run as superuser/service role and are not client-reachable.

## 3. Policies (schema public)

Query: `select tablename, policyname, cmd from pg_policies where schemaname='public' order by 1,2;`

Result: 26 policies.

| Table | Policies |
|---|---|
| answers | answers_attempt_participant_select, answers_exam_owner_select |
| exam_attempts | exam_attempts_exam_owner_select, exam_attempts_participant_select |
| exam_permissions | group_member_select, owner_select, owner_insert, owner_update, owner_delete |
| exams | group_member_select, owner_select, owner_insert, owner_update, owner_delete |
| group_students | owner_select, owner_delete (no client INSERT/UPDATE) |
| groups | owner_select, owner_insert, owner_update, owner_delete |
| profiles | profiles_self_select, profiles_self_update |
| questions | exam_owner_select, exam_owner_insert, exam_owner_update, exam_owner_delete |

All policies are owner-, membership- or self-based; none depends on a fixed role.

## Conclusion

No violations found: fixed empty `search_path` on every SECURITY DEFINER function, no anon/PUBLIC/service_role execute grants, every client-callable function checks `auth.uid()`, `redeem_group_invitation` is the only function that inserts into `group_students`, and the policy count is 26.
# Migration 0016 catalog scan

Run locally after applying `0016_profile_projections.sql`:

```powershell
npx supabase db query --local --file supabase/tests/007-unified-identity/catalog-0016.sql
```

## New projection functions

The catalog returned both functions. Each is `SECURITY DEFINER`, has the fixed empty `search_path`, checks `auth.uid()`, and is executable by `authenticated` only. `anon` and `service_role` cannot execute either function. No active RLS policy references either function, as expected for this additive, not-routed-by-the-UI migration.

## Existing SECURITY DEFINER inventory

- Total installed SECURITY DEFINER functions: **46**.
- Functions without a fixed `search_path`: **0**.
- The catalog reports **24** existing functions without a direct `auth.uid()` reference. This includes legacy attempt RPCs, role/invitation/profile helpers, trigger/cron functions, and extension functions; migration 0016 does not alter them. T029/T030 must audit and replace the relevant user-callable legacy functions during the atomic 0017 cutover.

Names reported by the scan:

`fn_create_pending_attempt_on_group_student()`, `fn_create_pending_attempt_on_permission()`, `fn_create_pending_attempts_at_start()`, `fn_create_profile_on_signup()`, `fn_get_exam_questions(uuid,uuid,uuid)`, `fn_preserve_in_progress_exam_permission()`, `fn_preserve_in_progress_group_access()`, `fn_protect_profile_role()`, `fn_require_student_exam_permission()`, `fn_require_student_group_member()`, `fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text)`, `fn_start_attempt(uuid,uuid,uuid)`, `fn_submit_attempt(uuid,uuid,uuid)`, `fn_sweep_expired_attempts()`, `fn_sync_user_role()`, `list_exam_permissions(uuid)`, `list_group_students(uuid)`, `pgbouncer.get_auth(text)`, `private.group_invitation_code_hash(text)`, `private.group_invitation_new_code()`, `search_student_by_email(text)`, `supabase_functions.http_request()`, `vault.create_secret(text,text,text,uuid)`, `vault.update_secret(uuid,text,text,text,uuid)`.

The 0016 before/after matrix reports are `before-0016.json` and `after-0016.json`.

# Migration 0022 Catalog and Source Scan

Date: 2026-11-22
Local schema: migrations `0001` through `0022`

## Fixed-role database state

Read-only queries against the local Supabase catalog found:

- `profiles.role` columns: **0**
- `public.private_user_roles` tables: **0**
- `public.user_role` types: **0**
- Active policies referencing fixed-role artifacts: **0**
- Active public/private routines referencing fixed-role artifacts: **0**
- Active public/auth triggers referencing fixed-role artifacts: **0**

## Function authorization and search paths

The final after-suite passed the SECURITY DEFINER catalog checks for fixed safe `search_path`, authenticated identity and resource-relationship checks on client-callable RPCs, no callable legacy `p_student_id` attempt signatures, and non-callable internal trigger/cron helpers. All 33 project-owned SECURITY DEFINER routines in `public` and `private` have a pinned empty or `pg_catalog` search path.

## Application source and tests

Command: `rg -n 'profiles\.role|private_user_roles|user_role|private\.is_admin|private\.is_student|get_my_role|fn_sync_user_role|fn_protect_profile_role' src supabase/functions tests/visual -g '!**/*.snap*'`

Result: **0 matches** across application, Edge Function, and visual-test sources.

## Final security evidence

`after-0022.json`: **259 cases**, 206 pass, 53 removed by design, 0 fail, 0 decision mismatches. All documented replacements passed. The report records migration `0022` as the final applied version.

The catalog and source scan is against local development only. Historical migrations and security tests intentionally retain legacy role names to describe and verify the transition.

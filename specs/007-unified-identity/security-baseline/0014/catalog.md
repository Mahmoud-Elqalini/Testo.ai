# Migration 0014 Catalog and Data Scan

- Scanned at: `2026-11-06 20:53:03 UTC`.
- Local applied migration version: `0014`.
- Scope: migration `0014_owner_id_bridge.sql` and the live local PostgreSQL catalog/data after the before/after matrix runs.

## Data and ownership bridge

| Table | Rows scanned | `owner_id` null | `owner_id IS DISTINCT FROM admin_id` | Result |
|---|---:|---:|---:|---|
| `groups` | 9 | 0 | 0 | PASS |
| `exams` | 34 | 0 | 0 | PASS |

Both `owner_id` columns are `uuid NOT NULL`, reference `profiles(id)` with `ON DELETE CASCADE`, and have btree indexes (`groups_owner_id_idx`, `exams_owner_id_idx`). Each table has an enabled equality check constraint (`owner_id = admin_id`).

## Triggers, function, and grants

- `trg_groups_sync_owner_mirror_0014` and `trg_exams_sync_owner_mirror_0014` are enabled `BEFORE INSERT OR UPDATE OF admin_id, owner_id` triggers.
- Both call `public.fn_sync_owner_mirror_0014()`. The function is invoker-security (not `SECURITY DEFINER`) with fixed `search_path=pg_catalog`.
- Function EXECUTE is false for `anon`, `authenticated`, and `service_role`; the privilege check also found no inherited PUBLIC EXECUTE.
- No table grants were added or changed. The migration only revokes direct EXECUTE on the trigger function.

## Existing authorization catalog

The catalog still contains the same nine policies on `groups` and `exams` (four group policies and five exam policies). Their predicates continue to use `admin_id = auth.uid()` and the existing `private.is_admin()` / `private.is_student()` helpers; migration 0014 did not replace or weaken these policies. The new owner fields are not used as authorization inputs until a later cutover.

The migration adds one trigger function and two triggers; it does not replace existing functions or alter their search paths/grants. No authorization policy or table grant change was found in the migration.

## T011 before/after matrix

- Before 0014: 134 frozen cases, 128 PASS and 6 known baseline failures.
- After 0014: 148 cases, 142 PASS and 6 known baseline failures; the 14 new T009 owner-mirror cases all PASS.
- All 134 frozen case IDs have the same PASS/FAIL decisions before and after (`decisionsUnchanged: true`). The same six baseline failures remain; see `before-0014.json` and `after-0014.json`.

# Migration 0015 catalog scan

Run locally after applying `0015_relationship_helpers.sql`:

```powershell
npx supabase db query --local --file supabase/tests/007-unified-identity/catalog-0015.sql
```

Result: **PASS**.

- All four additive helpers exist: `owns_group_by_owner(uuid)`, `owns_exam_by_owner(uuid)`, `is_current_group_member(uuid)`, and `can_access_exam_via_group(uuid)`.
- All four are `SECURITY DEFINER` and have `search_path=""`.
- `authenticated` can execute them; `anon` and `service_role` cannot.
- No existing RLS policy references any of the new helpers, confirming that migration 0015 did not change policy behavior.

Security matrix results are recorded in `before-0015.json` and `after-0015.json`. Both preserve the six known baseline failures; `decisionsUnchanged` is `true`.

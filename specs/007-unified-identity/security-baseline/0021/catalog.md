# Migration 0021 Catalog and Source Scan

Date: 2026-11-21
Branch: `007-unified-identity`
Local schema: migrations `0001` through `0021`

## Active database catalog

A read-only scan of `information_schema.columns`, `pg_policies`, callable routine definitions in `public` and `private`, non-internal trigger definitions, and `pg_views` searched for `admin_id` after migration 0021.

Result: **0 matching active database objects**.

The after-0021 harness also confirmed migration version `0021` and executed `supabase/tests/007-unified-identity/drop-admin-id-0021.sql` as part of its frozen matrix.

## Application source, types, and visual fixtures

Command: `rg -n 'admin_id' src tests/visual`

Result: **0 matches** across application source/types and visual test fixtures.

## Evidence

- `after-0021.json`: 244 cases; 210 pass, 0 fail, 0 decision mismatches; 34 cases documented as removed by design.
- SQL migration tests: 61/61 pass.
- Focused unit suite: 16/16 pass across 4 files.
- Chromium visual suite: 8/8 pass.

The scan is against the local schema only. Historical migration files retain references needed to create and transition earlier schemas.
# Local Security Validation Quickstart

This guide is the required validation sequence for implementation. Do not begin migration 0014 until the current schema baseline results have been exported and committed.

## Prerequisites

- Docker and the repository Supabase CLI dependency are available.
- `.env.local` contains only local Supabase credentials; no staging or production project is used.
- The committed migration state 0001–0013 is available locally.
- A test harness is added for the security matrix (SQL/pgTAP plus authenticated HTTP/Edge scripts). This planning document is not evidence that tests have run.

## Before change: freeze and commit first

1. Start local Supabase against the current committed schema without resetting existing local data. Generate deterministic baseline fixtures with fixed UUIDs and a versioned manifest for owner A, owner B, participant P, unrelated U, and their exact group/exam/attempt relationships:

   ```powershell
   npx supabase start
   ```

2. Run the migration-derived matrix from `plan.md`; every row needs an allow and deny result. Also run anon, client-id spoofing, answer-key, profile scope, direct `group_students` table INSERT allow/deny cases as currently governed by the role-based owner policy, and the separate participant-list and lookup tests.
3. Export the complete before results and fixture manifest. Record the manifest SHA-256, commit hash, migration version, exact command, UTC timestamp, and raw output under `security-baseline/before/`.
4. Commit these before-results **before any reset/reseed or authorization change**. Freeze that commit as the baseline source. Do not reset/reseed between producing the results and committing them.

The exact harness command is intentionally not named because the current project scripts do not include this security suite. Implementation must add the harness before 0014; do not substitute `npm test` unless it invokes and individually reports every inventory row.

## Fixture equivalence

After the baseline commit, local data may be reset/reseeded. The same versioned deterministic generator must create the same account/resource UUIDs and case IDs for the after suite. Former role labels become neutral owner/participant labels; ownership, membership, group permission, attempt relationships, and expected allow/deny decisions stay the same.

Serialize account UUIDs, resource UUIDs, ownership edges, group membership edges, group-to-exam permission edges, attempt rows/statuses, and case IDs in stable order. Compare before/after SHA-256 hashes while omitting only schema-specific role fields. Also assert identical IDs and relationship edges, equal row counts by entity, and unchanged decisions for every case. Where a prior direct exam permission is represented by a group membership plus group permission, record that mapping explicitly. No case may be silently removed.

## Migration progression

- For 0014–0016, apply each additive migration without reset and run the frozen matrix. Decisions must match the before baseline; test the owner mirror trigger for equality, single-column mirroring, and divergence rejection.
- 0017 is the single atomic cutover. Run migration-specific allow/deny assertions before commit where practical; commit only when they pass, then immediately run the full matrix. Direct INSERT and UPDATE on `group_students` as owner, member, unrelated user, and anon must all fail. Invitation redemption for the authenticated redeemer is the only membership-creation allow case. The pre-cutover baseline is expected to show the existing owner INSERT allow case; the post-cutover expectation changes to deny for every direct table caller.
- Apply 0018 and 0019 only after their catalog/security gates. Rerun the matrix after each. Keep role artifacts until 0019.

## After change

1. Run the same frozen matrix and attack-focused cases after 0019.
2. Audit final policies, function grants, SECURITY DEFINER search paths, remaining `profiles.role`/`admin_id` references, old attempt RPC signatures, group membership INSERT paths, and question/result columns.
3. Run the independent contracts in [participant-list.md](contracts/participant-list.md) and [associated-email-lookup.md](contracts/associated-email-lookup.md).
4. Save machine-readable and human-readable output under `security-baseline/after/`; compare case IDs, decisions, and fixture equivalence against the committed before evidence. Completion requires all expected allows and denies to match, with no extra disclosure.
5. Review UI in English/LTR and Arabic/RTL, light/dark, desktop/mobile using real authorized data and localized empty states.

No before or after suite has been executed as part of planning; the baseline must be run, exported, and committed before any reset/reseed or authorization change.

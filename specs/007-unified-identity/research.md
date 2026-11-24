# Research: Unified Identity and Relationship-Based Access

## Decision: Authorization follows identity and resource relationships

**Decision**: Replace `profiles.role`, the private role mirror, and role helpers with ownership (`owner_id`) and membership/participation checks rooted in `auth.uid()`.

**Rationale**: Current migrations already use scoped helpers such as `owns_group`, `owns_exam`, `owns_attempt`, and `can_access_exam`; they provide a migration path from role gates to exact resource relationships. Constitution XII requires identity + ownership/membership only.

**Alternatives considered**: Keep role as UI metadata; rejected because the spec and Constitution XII require dropping it entirely and because metadata can be mistaken for authority.

## Decision: Keep exam authorization group-based

**Decision**: Remove direct `exam_permissions.student_id` granting and use `group_students` membership plus group-targeted `exam_permissions`. Group invitations remain the mechanism for new group members; exam-level invitations are out of scope.

**Rationale**: The clarified FR-009 says lookup only returns already-associated users and never adds a participant. Direct email permissions would require a separate invitation contract and would leave a role-era authorization path. Group membership already supports the existing invitation flow.

**Data handling**: No production users/data exist. Before migration changes, preserve the baseline report and test fixtures. Local test data may be reset/reseeded so each previous direct-permission allow case is represented by an equivalent group membership and group permission. Do not claim that a local reset is a production conversion strategy.

**Alternatives considered**: Convert each direct exam permission to an owner group automatically; rejected for 007 because it creates persistent groups and can broaden access if an existing group has other exam grants. Preserve direct permission rows; rejected because it contradicts the stated group/invitation replacement.

## Decision: One atomic authorization cutover

**Decision**: Keep 0014–0016 additive and leave every current role-based policy/write path active. Combine membership and exam-permission replacement with invitation and attempt RPC changes in migration 0017, in one transaction. Run the unchanged frozen matrix after each earlier additive migration and the full matrix immediately after 0017.

**Rationale**: Replacing group membership/permission checks in 0015 while leaving role-dependent invitation redemption or attempt generation until 0017 could create a broken or less-secure intermediate contract. Atomic cutover closes that gap without relying on permissive RLS policies to combine conjunctively.

## Decision: Dual owner columns during transition

**Decision**: 0014 adds `owner_id` while retaining `admin_id`. A BEFORE INSERT/UPDATE trigger on both `groups` and `exams` fills a missing column from the other, mirrors a single changed value, and raises on divergent values. Existing RLS checks still bind the legacy column to `auth.uid()` during the bridge. After 0017 passes, 0018 drops the equality triggers and `admin_id`; there is no rollback column in local development.

**Rationale**: Existing clients and policies continue reading `admin_id` during additive preparation, while new code can validate against `owner_id`. The equality invariant prevents the two owner representations from drifting.

## Decision: Membership only through invitation redemption

**Decision**: `redeem_group_invitation` is the only runtime path allowed to create `group_students` rows. The current direct insert/upsert from `src/lib/services/group-service.ts` is removed in the 0017 cutover; client table INSERT/UPDATE grants and RLS write policies are removed. An authenticated direct table INSERT test must fail.

**Rationale**: The existing INSERT policy permits group owners to submit an arbitrary `student_id`, while the clarified lookup cannot identify unassociated accounts. A valid invitation binds the new membership to the authenticated redeemer and retains the existing redemption throttle.

## Decision: Exam participant visibility follows membership or retained attempt

**Decision**: An exam owner sees the union of current members of all groups linked to the exam and all accounts with an existing attempt row for that exam. Removing someone from a linked group removes them from that group's list immediately; if an attempt row remains, they remain visible to the exam owner for grade review until the attempt row is deleted, regardless of status.

**Rationale**: Attempt rows are the durable exam relationship needed for review after membership removal. It avoids hiding a learner's result from the exam owner while limiting visibility to an extant attempt relationship.

## Decision: Two distinct participant data functions

**Decision**: Provide separate server-side, column-limited functions for (1) associated participant list (`id`, display name, email) and (2) exact email lookup (`id`, display name only, never email). Each checks `auth.uid()`, owned context, and current association server-side.

**Rationale**: FR-008 allows an owner to see associated participant email; FR-009 forbids lookup from returning email and restricts lookup to already-associated people. One shared endpoint could accidentally leak email or broaden lookup results.

**Alternatives considered**: Direct profile/auth.users queries from the client; rejected because they make broad profile/email reads easier and cannot reliably enforce separate disclosure shapes.

## Decision: Preserve question and result confidentiality

**Decision**: Keep question delivery behind a safe server-side projection; never include `correct_choice` or `reference_answers` during an active attempt. Results remain available only to the attempt owner after completion and to the owner of the relevant exam through owner-scoped review operations.

**Rationale**: Existing migrations 0008–0012 introduced server-side attempt operations and completed-result access; role removal must not weaken those invariants.

## Decision: Authenticated RPC and trusted trigger/cron function audit

**Decision**: Require every user-callable SECURITY DEFINER function to use a fixed `search_path`, schema-qualified objects, and `auth.uid()` plus exact ownership/membership checks. Internal trigger/cron helpers also use fixed paths, must not be executable directly by `anon`/`authenticated`, and must derive trust only from the database event or scheduler context.

**Rationale**: Trigger functions run within a trusted row event and cron functions run as a privileged scheduled job; an end-user `auth.uid()` is not necessarily present in those contexts. Forcing `auth.uid()` into those functions would either break their lifecycle or create a misleading check. Their safe boundary is fixed search path, narrow execute grants, and no client-controlled identity. User-facing security-definer RPCs must always check auth identity.

**Current findings**: `0005` and `0006` helpers mostly pin empty `search_path`; `0007` pins empty path. Several earlier functions use `SET search_path = public, pg_temp` (`0003`, `0008`–`0012`), with `pg_temp` listed after `public`; these require migration review and hardening to a fixed safe path before relying on them in the new state. Existing role-sensitive functions in 0008 pass `p_student_id`; Edge shared code currently sets it from a verified bearer user id, but the replacement must remove that parameter and bind database authorization to `auth.uid()` from the forwarded caller JWT.

## Decision: Local baseline and after-state evidence

**Decision**: Use local Supabase as the validation database. Store the exact pre-change inventory, fixtures, test command, migration version, and machine-readable results before implementation; run the same allow/deny matrix after the final role-drop migration.

**Rationale**: No staging project exists and the spec requires a real before/after comparison, not a retrospective reconstruction. The before suite must execute on the applied 0001–0013 role-based schema before 0014.

**Alternatives considered**: Test only the final schema; rejected because it cannot prove role-era behavior or compare blocked actions.

# Contract: Relationship-Authorized Operations

## Ownership operations

Create group/exam derives `owner_id` from the authenticated identity. Read/update/delete and management actions require `owner_id=auth.uid()` at the database boundary. Supplying another owner id is denied.

## Membership and invitation operations

Invitation creation, rotation, revocation and status require authenticated ownership of the group. Redemption validates code digest, expiry, revocation and throttle, creates membership for `auth.uid()` only, and rejects when the caller owns the group. No request may nominate a different member.

`redeem_group_invitation` is the only permitted membership creation path. Remove direct client INSERT/UPDATE grants and permissive RLS write policies on `group_students`; authenticated direct table INSERT and UPDATE must fail for owners, members and unrelated users, and anon must also fail. No service function, trigger, Edge Function or alternate RPC may insert a membership. Audit all `INSERT INTO group_students` references in migrations/functions/application code; only invitation redemption and controlled test fixture setup may appear. Attempt-generation triggers may create attempts from existing membership but do not create membership. The before baseline records the current owner INSERT allow case; the post-cutover direct write expectation is deny for every caller.

## Exam permission and attempts

Exam permission targets an owned group and exam with the same owner. Attempt generation requires current group membership. Attempt creation/start/question/save/submit operations bind the learner to `auth.uid()` from the caller JWT, reject exam owner self-attempts, and preserve publication, time, session, attempt-state, grading and rate-limit rules. Revoke EXECUTE from `PUBLIC`, `anon`, `authenticated`, and `service_role` on each old RPC signature accepting `p_student_id`, then drop those signatures; only JWT-based signatures remain callable. Safe question payloads omit correctness/reference-answer data.

## Owner-only exam operations

Viewing attempts/results, voiding, and overriding grades require ownership of the relevant exam and retain existing audit behavior. Non-owners are denied even if they can participate in that exam.

## SECURITY DEFINER requirements

Every user-callable function uses a fixed safe search path, schema-qualified references, explicit execute grants, `auth.uid()` and the relevant owner/membership predicate. Trigger/cron helpers use a fixed safe path, have no direct `anon`/`authenticated` execute grant, and operate only in their trusted database event/scheduler context. No RLS policy treats client-provided identity or ownership fields as proof.

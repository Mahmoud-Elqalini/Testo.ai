# Data Model: Unified Identity and Relationship-Based Access

This model describes the planned role-free state for 007. Course entities are excluded.

## Account and profile

| Field | Rule |
|---|---|
| `id` | UUID equal to the authenticated Supabase user id; immutable identity. |
| `full_name` | Display name; returned only in allowed profile projections. |
| `preferred_language` | Self-readable/self-editable preference; never visible to resource owners. |
| `preferred_theme` | Self-readable/self-editable preference; never visible to resource owners. |
| `role` | Removed only in final migration 0019 after all consumers and policies are replaced. |

The profile owner may read/update allowed self fields. No general profile table read is exposed. Owner access to another profile is through the contextual participant functions below.

## Groups and memberships

| Entity | Key fields | Relationships / validation |
|---|---|---|
| `groups` | `id`, `name`, `owner_id` | `owner_id` references the creator/account. Only owner can manage. Client cannot assign another owner. During 0014–0017, `admin_id` is retained and equality-enforced by a trigger; 0018 drops it after verification. |
| `group_students` | `group_id`, `student_id` (membership account id) | Unique `(group_id, student_id)`. A group owner cannot be its own member. After 0017, membership can only be created by `redeem_group_invitation`, which inserts `auth.uid()`; direct REST/table INSERT and every other creation path are denied. |
| `group_invitations` (private) | existing `group_id`, code digest, creator, expiry/revocation fields | One invitation per group; digest only stored; group owner creates/rotates/revokes; redemption binds membership to `auth.uid()` and retains throttle. |

## Exams and exam access

| Entity | Key fields | Relationships / validation |
|---|---|---|
| `exams` | `id`, exam data, `owner_id`, publication/state fields | Owner manages; `owner_id` is immutable to clients. During 0014–0017, `admin_id` is retained and equality-enforced by a trigger; 0018 drops it after verification. |
| `exam_permissions` | `id`, `exam_id`, `group_id` | Group-only target; unique `(exam_id, group_id)`. Group and exam must share the same owner. Remove `student_id` direct-target column and associated index/constraint/trigger. |
| `exam_attempts` | existing attempt state plus `exam_id`, `student_id` | Participant identity is server-derived. Must have group access for an exam permission, must not equal exam owner, and must satisfy publication/time/session/attempt state rules. |
| `questions` | existing fields | Owner management by exam ownership. Learner delivery stays a safe projection that excludes answer keys. |
| `answers` | existing answer and score fields | Access follows own attempt or owned exam review. Answers and correctness data are not exposed through the active-attempt question API. |

Direct exam permissions by email are replaced by group membership: an owner associates an exam with an owned group; a participant joins that group through its invitation; the exam access check joins `exam_permissions.group_id` to `group_students.group_id` and `group_students.student_id=auth.uid()`. Tests verify that this does not create access to unrelated groups/exams.

## Contextual profile projections

These are two separate server-side operations, not a general profile table policy:

1. **Associated participant list (FR-008)**: input is a group or exam context id; require authenticated caller owns it. For a group, include current members only. For an exam, include the union of current members of all groups linked to that exam and all accounts with an existing attempt row for that exam. A member removed from a linked group remains visible to the exam owner for grade review while that attempt row exists, regardless of status; they disappear from the group list immediately. Deleting the attempt removes exam-list visibility. Return `id`, display name and email only. Do not return the owner or peer emails to participants. Re-evaluate the relationship on every read.
2. **Associated email lookup (FR-009)**: exact email plus owned group/exam context. Require existing association in that context. Return `id` and display name only; never email. Unknown and unassociated accounts have identical response shape and normalized timing. Rate-limit per requester and context. Lookup never adds access.

The SQL representation of context kind and association predicate must be implemented with a fixed search path, explicit column list, and `auth.uid()` plus ownership checks. The participant list is read-only; it cannot add membership or permission.

## Ownership / membership invariants

- One account can own resources and be a member/participant elsewhere simultaneously.
- `owner_id` is copied from `auth.uid()` or verified in the database, never trusted from a client payload.
- Owner cannot be a member of their own group and cannot own an attempt on their own exam.
- Membership and permission removal takes effect for subsequent reads immediately, while existing exam lifecycle protections for in-progress attempts remain intact.
- No authorization decision reads account role, client route, request-supplied user id, or profile preference fields.

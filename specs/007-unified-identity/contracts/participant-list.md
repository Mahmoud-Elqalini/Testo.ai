# Contract: Owner-Scoped Associated Participant List (FR-008)

## Purpose

Return contact details only for people currently associated with a group or exam owned by the caller. This is separate from email lookup.

## Request

- Authenticated RPC/function call.
- Context kind: `group` or `exam`.
- Context id: UUID.
- No caller or target user id is accepted as authorization evidence.

## Authorization

- Require non-null `auth.uid()`.
- Verify the caller owns the exact group/exam in the request.
- Re-check current association for every returned participant.
- For group context, include current members of that group only.
- For exam context, include the union of (a) current members of every group linked to the exam through `exam_permissions` and (b) every account with an existing `exam_attempts` row for that exam.
- An account removed from a linked group remains in the exam participant list for grade review while its attempt row exists, regardless of attempt status. It disappears immediately from the group participant list. Deleting the attempt removes it from the exam participant list.

## Response

Each result contains exactly `id`, `display_name`, and `email`. Do not return preferences, role, auth metadata, or other profile fields. Do not return the owner's own address or peer addresses to a participant-facing view.

## Denial

Unauthenticated and non-owner calls return no participant data. Group membership removal removes visibility from that group list immediately; an existing attempt keeps exam-list visibility until that attempt row is deleted.

## Required independent tests

- Owner sees associated participant name+email.
- Non-owner and anon receive no data.
- Unassociated account omitted.
- Group membership removal removes group-list visibility immediately; attempt deletion removes exam-list visibility.
- No preference/extra columns appear.
- Participant-facing group/exam surfaces reveal neither owner nor peer email.
- This operation never accepts an email search term and is not reused as the lookup operation.

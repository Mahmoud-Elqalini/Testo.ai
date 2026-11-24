# Contract: Exact Lookup of an Already-Associated Participant (FR-009)

## Purpose

Resolve an exact email only within a caller-owned group/exam context, and only when the account is already associated with that context. It does not add a participant.

## Request

- Authenticated RPC/function call.
- Exact email string.
- Context kind (`group` or `exam`) and context UUID.
- No supplied user id or role is trusted.

## Authorization and anti-enumeration

- Require `auth.uid()` and verify ownership of the exact context server-side.
- Require that the matching account is already associated with that context.
- Rate-limit by requester and context.
- Missing and unassociated addresses produce the same status and response shape; response timing is normalized so the two cases do not expose existence.
- Exact match only; do not perform prefix, fuzzy, or partial matching.

## Response

Successful associated match: `id` and `display_name` only. Email is never returned by this operation. Empty/not-found/unassociated response has no account id or name and does not distinguish these cases.

## Required independent tests

- Associated exact match returns only id/name.
- Email is absent from success and failure payloads.
- Unassociated and nonexistent address have same status/shape and normalized timing distribution.
- Non-owner, anon, malformed, partial and case-normalized query cases cannot enumerate accounts.
- Rate limits are isolated per requester/context and enforced.
- Lookup does not insert group membership or exam permission.
- These tests are separate from participant-list tests.

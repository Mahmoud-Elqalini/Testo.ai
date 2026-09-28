# Group Invitation Contract

These database functions are the only supported invitation interface. They are exposed through authenticated Supabase RPC calls. Every privileged function pins an empty `search_path`, schema-qualifies all objects, verifies the caller role, and has EXECUTE revoked from `PUBLIC` and `anon`.

## Admin Operations

### `create_group_invitation(target_group_id uuid)`

- **Caller**: Authenticated Admin who owns `target_group_id`.
- **Returns**: One-time `{ code: string, expires_at: timestamptz }`.
- **Behavior**: Generates a cryptographically random 128-bit code, stores only its digest, and sets expiry to 30 days from database time. If a previous invitation row exists, its code is invalidated by replacing it.
- **Denials**: Unauthenticated callers, Students, missing groups, and non-owning Admins receive no code.

### `rotate_group_invitation(target_group_id uuid)`

- **Caller**: Authenticated Admin who owns the group.
- **Returns**: One-time `{ code: string, expires_at: timestamptz }`.
- **Behavior**: Replaces the stored digest and expiry atomically. The previous code stops working immediately; current members and attempts are unchanged.

### `revoke_group_invitation(target_group_id uuid)`

- **Caller**: Authenticated Admin who owns the group.
- **Returns**: `{ revoked: boolean }`.
- **Behavior**: Marks the current invitation revoked. Does not alter group membership or exam attempts. Repeated revocation is idempotent.

### `get_group_invitation_status(target_group_id uuid)`

- **Caller**: Authenticated Admin who owns the group.
- **Returns**: `{ exists: boolean, created_at: timestamptz | null, expires_at: timestamptz | null, revoked_at: timestamptz | null }`.
- **Behavior**: Returns lifecycle metadata only. Never returns the code or its digest.

## Student Operation

### `redeem_group_invitation(invitation_code text)`

- **Caller**: Authenticated Student.
- **Arguments**: Code only. The caller cannot specify a group ID or student ID.
- **Returns**: `{ success: boolean }`. `success: true` covers a new membership and an already-existing membership, making retries idempotent. Unknown, malformed, expired, revoked, and rate-limited codes return the same generic failure.
- **Rate limit**: Five failed submissions per Student per 15-minute window; subsequent attempts are blocked until the window resets.
- **Behavior**: On a valid code, inserts `(group_id, auth.uid())` conflict-safely. The existing database trigger handles any pending-attempt creation. No direct Student write access to `group_students` is added.

## Security and Consistency

- Invitations are bound to the original group by their stored digest and cannot be redirected by request parameters.
- Admin operations check exact group ownership inside the database function, not only in the interface.
- Invitation hashes and throttle state remain in the non-exposed `private` schema with RLS enabled and no application-role table grants.
- Redemption and rotation lock the same invitation row so an old code cannot redeem after a completed rotation.
- Responses must not disclose group name/existence for invalid codes.

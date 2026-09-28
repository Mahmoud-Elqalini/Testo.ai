# Research: Group Invitation Codes

**Feature**: `005-group-invitations`
**Date**: 2026-09-28

## Decisions

### Invitation entropy and storage

- **Decision**: Generate 16 cryptographically random bytes (128 bits) in PostgreSQL, display the 32-character hex code once, and persist only its SHA-256 digest. Compare a normalized submitted code by digest.
- **Rationale**: The code is a bearer credential. High entropy makes online guessing impractical, while hashing means a database read does not reveal usable invitation codes. The existing `001-foundation` migration already enables `pgcrypto`; use its functions in the extension schema and schema-qualify them inside privileged functions.
- **Alternatives considered**: A short numeric code is easier to type but has a much smaller search space and needs aggressive throttling. Storing plaintext would allow database readers to redeem every active invitation.
- **Sources**: [PostgreSQL pgcrypto random-data and digest functions](https://www.postgresql.org/docs/17/pgcrypto.html); [Supabase extension schemas](https://supabase.com/docs/guides/database/extensions).

### Privileged database operations

- **Decision**: Keep invitation and throttle tables in the non-exposed `private` schema. Expose narrow RPCs in `public` for Admin create/status/rotate/revoke and Student redemption. Revoke EXECUTE from `PUBLIC` and `anon`, grant only `authenticated`, pin `search_path` to empty, and qualify object names. Each RPC checks the caller role and group ownership itself.
- **Rationale**: Redemption must validate a secret and add membership atomically while Students have no direct write policy for `group_students`. The existing database trigger on membership insertion then provisions any required pending attempt within the same transaction.
- **Alternatives considered**: Client-side lookup followed by a client-side insert creates a race and requires exposing invitation state; a broad service-role endpoint would add another trust boundary and more infrastructure.
- **Sources**: [Supabase Database Functions](https://supabase.com/docs/guides/database/functions); [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

### Invitation lifecycle

- **Decision**: One row per group, one active reusable code, fixed 30-day expiration. Rotation replaces the digest and expiry atomically. Revocation sets a timestamp. Neither operation modifies `group_students` or attempts. The usable code is returned only by create/rotate.
- **Rationale**: This matches the requested Teams-style reusable group code while providing bounded lifetime and immediate control after a leak. The one-active-code rule keeps the Admin UI and invalidation semantics simple.
- **Alternatives considered**: Per-student links would not support sharing a single group code; multiple simultaneously active codes add lifecycle complexity without a stated need.

### Failed-redemption rate limit

- **Decision**: Allow five failed redemptions per authenticated Student in a fixed 15-minute window, maintained in a private per-user state row by the redemption RPC. Return one generic invalid-code response for unknown, malformed, expired, revoked, and currently throttled codes.
- **Rationale**: Requiring authentication removes anonymous traffic; per-user throttling limits online enumeration without storing IP addresses or adding a paid rate-limiting service. A 128-bit code remains the primary guessing defense.
- **Alternatives considered**: IP-based rate limiting requires trusted proxy metadata and more infrastructure; no rate limit conflicts with FR-009.

### Frontend placement

- **Decision**: Add invitation controls to the existing Admin group detail screen and a Student `/student/join-group` screen, with a dashboard link visible only to Student-role accounts.
- **Rationale**: These locations match the existing group workflow and give Students an obvious redemption entry point while preserving the established role guard.
- **Alternatives considered**: A one-off emailed link or a standalone invitation page for Admins would duplicate existing group management navigation.

## Constitution Review

- The database remains the authority for role, group ownership, code validity, expiry, throttling, and membership changes.
- Student writes remain denied by RLS; the narrowly granted transaction function enforces Student role and executes membership insertion.
- Existing exam permission and pending-attempt triggers are reused, not bypassed.
- No paid infrastructure or external service is introduced.

# Feature Specification: Group Invitation Codes

**Feature Branch**: `005-group-invitations`
**Created**: 2026-09-28
**Status**: Draft
**Depends on**: `001-foundation` (authenticated Students, Admin-owned groups, group membership, and group-based exam permissions)
**Input**: Add a Teams-style way for an Admin to invite Students into an owned group using a shareable join code.

## User Scenarios & Testing

### User Story 1 — Student Joins a Group with an Invitation Code (Priority: P1)

An Admin creates and shares an invitation code for one of their groups. An authenticated Student enters that code and joins the group without the Admin having to add the Student by email.

**Why this priority**: This is the core self-service enrollment journey and the main value of the feature.

**Independent Test**: Create a group and invitation as an Admin, redeem it as a Student, and verify the Student becomes a member and can see exams shared with that group.

**Acceptance Scenarios**:

1. **Given** an Admin owns a group, **When** they create an invitation, **Then** the system gives them a code they can copy and share for that group.
2. **Given** a valid invitation code, **When** an authenticated Student redeems it, **Then** that Student becomes a member of the associated group.
3. **Given** the Student has joined a group with exam access, **When** they view their available exams, **Then** they receive the same group-based access as any other member, including a tracked pending attempt when required by `001-foundation`.
4. **Given** a Student has already joined the group, **When** they redeem the same still-valid code again, **Then** the operation succeeds without creating duplicate membership or duplicate attempts.
5. **Given** a user is unauthenticated or has the Admin role, **When** they try to redeem a code, **Then** no group membership is created.

### User Story 2 — Admin Rotates or Revokes a Group Invitation (Priority: P2)

An Admin can replace a shared code if it has been exposed, or disable enrollment when they no longer want new Students to join through it.

**Why this priority**: Admins need control over who can join while preserving existing memberships and exam attempts.

**Independent Test**: Generate an invitation, rotate it and verify only the new code works; then revoke it and verify neither code can add new members while existing members remain.

**Acceptance Scenarios**:

1. **Given** an active invitation for a group the Admin owns, **When** the Admin rotates it, **Then** the previous code stops working immediately and a new code is shown.
2. **Given** an active invitation, **When** the Admin revokes it, **Then** it can no longer create memberships.
3. **Given** a code is rotated, revoked, or expired, **When** a Student submits it, **Then** the system reports that the code is invalid without disclosing group details.
4. **Given** a code is revoked, **When** the group has existing members, **Then** those memberships and their current exam attempts remain unchanged.
5. **Given** an Admin does not own the group, **When** they attempt to create, rotate, or revoke its invitation, **Then** the action is denied.

## Edge Cases

- The same code is submitted simultaneously by the same Student more than once → membership remains unique and any pending attempt is created at most once.
- A code expires between being displayed and redeemed → redemption is denied using the server's current time.
- An unknown, malformed, expired, rotated, or revoked code is entered → the response does not reveal whether a group or invitation exists.
- A Student redeems a valid code for a group they already belong to → return a safe success/no-op without duplicate side effects.
- A code is leaked → the owning Admin can rotate or revoke it; rotation and revocation do not remove current members.
- A Student joins while the group's exam permission is active for an already-started exam → `001-foundation` rules create any required pending attempt immediately and preserve the fixed exam deadline.
- A non-Student or unauthenticated caller tries to redeem a code → membership is not created.
- A student invitation is used to target a group owned by another Admin → the code only resolves to its original group and cannot be changed by the caller.
- Repeated guesses are made → redemption attempts are rate-limited and do not allow practical code enumeration.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow an Admin to create an invitation for a group they own.
- **FR-002**: An invitation MUST apply to exactly one group and MUST be usable by authenticated Student accounts only.
- **FR-003**: A valid invitation MUST add the redeeming Student to the associated group without allowing the client to choose or alter the target group.
- **FR-004**: Invitation redemption MUST be safe to retry; the same Student joining more than once MUST NOT create duplicate group membership or duplicate pending attempts.
- **FR-005**: An invitation MUST expire after a bounded lifetime and MUST be revocable by its owning Admin. Its owner MUST be able to rotate it, immediately invalidating the previous code.
- **FR-006**: Revoking, rotating, or expiring an invitation MUST NOT remove existing group members or invalidate their existing exam attempts.
- **FR-007**: System MUST enforce group ownership for invitation creation, rotation, and revocation; an Admin MUST NOT manage invitations for another Admin's group.
- **FR-008**: Invitation codes MUST be generated with enough randomness to resist guessing, and the system MUST NOT store the usable code in plaintext.
- **FR-009**: System MUST rate-limit failed redemption attempts and return a generic invalid-code response that does not disclose whether the group or code exists.
- **FR-010**: The Admin MUST be able to copy a newly created or rotated code to share it. The usable code MUST be shown only at creation or rotation; if it is lost, the Admin can rotate the invitation to obtain a new one.
- **FR-011**: Group membership created by redemption MUST follow the existing group-based exam access and pending-attempt rules from `001-foundation`.
- **FR-012**: The Student and Admin flows MUST support Arabic and English, RTL and LTR layout, and light and dark themes.

### Key Entities

- **Group Invitation**: A revocable, expiring invitation associated with exactly one Admin-owned group. It records the group, the protected code representation, creation and expiration times, and revocation/rotation state.
- **Group Membership**: The existing relationship between a Student and a Group. Redeeming an invitation creates this relationship and does not change its ownership or exam permission rules.

## Success Criteria

- **SC-001**: A Student with a valid code can join a group in under one minute without Admin assistance.
- **SC-002**: 100% of valid redemptions create at most one membership per Student and group, including concurrent duplicate submissions.
- **SC-003**: 100% of invalid, expired, rotated, or revoked codes are denied without creating membership or revealing group existence.
- **SC-004**: 100% of attempts by non-Students or by Admins who do not own the group fail to create a membership.
- **SC-005**: Rotating or revoking a code never removes current members or disrupts their in-progress attempts.
- **SC-006**: Students and Admins can complete the invitation flows in Arabic and English, in light and dark themes.

## Assumptions

- Invitation codes are reusable until expiration, rotation, or revocation, as with a team join code; they are not one-time links.
- Each group has at most one active invitation at a time. Rotating replaces the active code.
- New invitations expire 30 days after creation by default. The Admin may revoke or rotate sooner; configurable expiration choices are not part of this feature.
- Existing Admin email-based membership management remains available as an alternative.
- Joining a group grants access to exams assigned to that group, subject to the existing exam timing and attempt rules. Invitation codes do not grant access to an exam directly.
- A usable code is displayed once when created or rotated. Recovery is performed by rotation, which invalidates the previous code.
- The platform's authenticated sessions and role definitions from `001-foundation` remain authoritative.

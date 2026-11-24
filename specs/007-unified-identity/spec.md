# Feature Specification: Unified Identity and Relationship-Based Access

<!--
Project governance: read AGENTS.md and .specify/memory/constitution.md for all new specs and
all edits to existing specs. Keep this document user-focused and technology-agnostic: express
observable outcomes and constraints, not class structure, frameworks, APIs, SOLID labels, or
named design patterns. Preserve unrelated requirements when revising an existing spec. Put
technical boundaries, SOLID assessment, and justified pattern choices in plan.md.
-->

**Feature Branch**: `[007-unified-identity]`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Remove fixed learner/teacher roles so each account can join groups and take exams while creating and managing its own groups and exams. Base access on ownership and membership, preserve existing legitimate access without granting access to others, prevent email enumeration, scope profile visibility to owned resources, and provide a unified bilingual, theme-adaptive dashboard."

## Clarifications

### Session 2026-11-05

- Q: Should the existing `profiles.role` values be dropped entirely, or retained as non-authoritative legacy metadata? → A: Drop `profiles.role` entirely, including its mirror and helpers; only remove it after replacing every role-based authorization check with an ownership/membership check so no intermediate state is less secure.
- Q: Should email lookup remain exact-match, rate-limited, and limited to people associated with groups or exams the requester owns? → A: Require an exact match, an owned group or exam context verified server-side, and rate limits per requester and context; return only id and display name for accounts already associated with that context, never email. Unassociated and not-found responses must have the same shape and uniform timing. Add new group participants through invitation codes; an exam-level invitation may be a later feature.
- Q: For another person's profile within a group or exam you own, which fields should be visible? → A: An owner may see only display name and email for participants already associated with an owned group or exam through membership, permission, or an attempt. No preferences or other profile data are exposed; access ends immediately when the relationship ends. Participants cannot see the owner's or other participants' emails. Profile reads must be narrowly owner-authorized, never general. Implementation-plan constraint: serve this through a column-limited server-side function/view using SECURITY DEFINER, a fixed `search_path`, authenticated `auth.uid()`, and an ownership check.
- Q: Must the before-change security suite cover every existing role-based access path, or is representative coverage sufficient? → A: Inventory every role-based read, write, and protected action across all RLS policies, SECURITY DEFINER functions, triggers, and Edge Function paths that depend on `profiles.role`, `private.is_admin`/`private.is_student`, or `admin_id`. Generate and freeze the inventory from the migrations before implementation; record at least one allow and one deny case for each path before the change and re-run those cases after.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Learn and teach with one account (Priority: P1)

A person uses one account to participate as a learner in groups and exams, and to create and manage their own groups and exams. They do not need separate accounts or an account-wide learner/teacher mode to use both sides of the platform.

**Why this priority**: A unified identity is the central product change and must support both sides of the platform without weakening access boundaries.

**Independent Test**: Use one account to create and manage its own groups and exams, and to participate in groups and exams owned by another account. Confirm each action is allowed only where the account has the relevant ownership or membership relationship.

**Acceptance Scenarios**:

1. **Given** an authenticated account, **When** it creates a group or exam, **Then** that account is recorded as the owner and can manage that resource.
2. **Given** an account owns resources and is also a member of another user's group or has legitimate access to another user's exam, **When** it views its learning and teaching activities, **Then** both sets of activities are available under the same identity.
3. **Given** an account is not an owner or member/participant for a resource, **When** it requests that resource or attempts to change it, **Then** access is denied.
4. **Given** an account owns an exam, **When** it attempts to take that exam, **Then** the attempt is denied.
5. **Given** an account owns a group, **When** it tries to join that group as a member, **Then** membership is denied.

---

### User Story 2 - Find only profiles within a legitimate scope (Priority: P1)

A user sees profile information only for themselves and people associated with groups or exams they own. Exact email lookup can identify an already-associated participant for a specific owned context, but never reveals whether an unassociated email address belongs to an account.

**Why this priority**: Removing fixed roles must not broaden access to identity or personal information.

**Independent Test**: As two unrelated users, attempt profile reads and exact email lookups across unrelated resources, then repeat in an owned group or exam context for an already-associated participant. Verify only scoped requests return permitted profile information and lookup responses do not enable enumeration.

**Acceptance Scenarios**:

1. **Given** a user requests their own profile, **When** they are authenticated, **Then** they can read their own profile.
2. **Given** a user owns a group or exam, **When** they view a participant's profile associated with that resource, **Then** they see only the participant's display name and email, with no preferences or other profile fields.
3. **Given** the participant's membership, permission, or attempt relationship with the owned resource ends, **When** the owner requests their profile, **Then** access to that profile information ends immediately.
4. **Given** a participant views an owned group or exam, **When** they view participant information, **Then** they cannot see the owner's or other participants' email addresses.
5. **Given** a user requests a profile outside their own groups and exams, **When** they are not otherwise authorized, **Then** the profile is not disclosed.
6. **Given** a user looks up an email address in an owned group or exam context, **When** the account is not already associated with that context or does not exist, **Then** both responses have the same shape and uniform timing and reveal no account existence.
7. **Given** a user looks up an exact email for an account already associated with the owned context, **When** the lookup is permitted, **Then** only the account ID and display name are returned; the email is never returned by lookup.
8. **Given** a user is unauthenticated, **When** they request any private profile information, **Then** no private profile information is returned.

---

### User Story 3 - Use one Learning and Teaching dashboard (Priority: P1)

A user opens one dashboard and sees their learning activities and teaching activities in distinct sections. They can manage groups and exams they own and continue learning from groups and exams they are authorized to access, in English or Arabic and in light or dark themes.

**Why this priority**: A unified identity needs a unified way to navigate both sets of activities without implying mutually exclusive user types.

**Independent Test**: Sign in to an account with owned and joined/authorized group and exam activity, and verify both sections, actions, and empty states in English/LTR, Arabic/RTL, light, and dark settings.

**Acceptance Scenarios**:

1. **Given** a user has owned and joined/authorized group and exam activities, **When** they open the dashboard, **Then** they see separate “Learning” and “Teaching” sections containing only resources they are allowed to access.
2. **Given** a user has no resources in one section, **When** they open the dashboard, **Then** that section shows a localized empty state without hiding the other section.
3. **Given** a user changes language or theme, **When** they use the dashboard, **Then** English renders left-to-right and Arabic right-to-left, and both themes remain readable and usable.
4. **Given** a dashboard action is shown, **When** the user selects it, **Then** it opens an existing authorized destination for that user's ownership or membership/participation relationship.
5. **Given** course functionality is not yet available, **When** a user views the dashboard, **Then** they see a concise localized statement that course items will appear once feature `008-courses` exists.

---

### User Story 4 - Protect existing access during the identity change (Priority: P1)

Existing account owners, legitimate group members, and exam participants continue to have the access their relationships grant. Accounts that previously lacked access do not gain access as a side effect of removing fixed roles.

**Why this priority**: An identity-model change is acceptable only if legitimate access is retained and no authorization boundary is weakened.

**Independent Test**: Run a security suite against the current role-based authorization state before making any change, record its results, then run the comparable suite after the change. Compare allowed and denied actions, including unrelated users, unauthenticated callers, ownership, memberships, and role-limited owner actions.

**Acceptance Scenarios**:

1. **Given** an existing legitimate owner or group member/exam participant, **When** the identity change is applied, **Then** their previously authorized actions remain available.
2. **Given** an action was blocked before the identity change, **When** the same user repeats it afterward without a valid ownership or membership relationship, **Then** it remains blocked.
3. **Given** a user attempts to read or modify another user's data without a legitimate relationship, **When** the request is evaluated before and after the change, **Then** it is denied in both states.
4. **Given** an unauthenticated caller attempts to access private data or perform a protected action, **When** the request is evaluated before and after the change, **Then** it receives no private data and cannot perform the action.
5. **Given** an account can perform actions formerly limited by the Admin role, **When** it targets another user's group or exam, **Then** participant lookup, invitation management, and attempt/result viewing remain unavailable to that non-owner. Void-attempt and grade-override actions do not exist yet; if implemented later in feature `004`, they MUST be owner-only and include non-owner denial tests.

---

### Supersedes

This feature supersedes only the following role-dependent portions of earlier specifications; unrelated requirements remain in force unless this feature explicitly changes them:

- **`001-foundation`**: fixed `student`/`admin` identity and role-based authorization; role-based route/dashboard split; role-scoped profile reads; assumptions that groups and exams are exclusively admin-owned and student actions are restricted to student accounts. Exam timing, grading-criteria protection, attempt integrity, and other unrelated exam lifecycle requirements remain applicable.
- **`002-automated-grading`**: assumptions that grading visibility, review, override, and related actions are available only to an Admin role. Those actions are available according to ownership of the relevant exam; grading integrity and audit requirements remain applicable.
- **`003-notifications`**: assumptions that Admin and Student are exclusive account types, including who manages exams and who receives notifications. Managers and recipients are determined by the applicable exam ownership and participation relationships; delivery and reliability requirements remain applicable.
- **`004-admin-insights`**: Admin-only access language and fixed Admin role assumptions for monitoring, results, voiding, and overrides. Access is based on ownership of the relevant exam and its associated data; audit and integrity requirements remain applicable.
- **`005-group-invitations`**: fixed Admin ownership management and Student-only redemption assumptions. Invitation management follows group ownership, redemption creates membership for the authenticated user, and a group owner cannot join their own group. Invitation protections and lifecycle requirements remain applicable.

## Edge Cases

- A user owns one group or exam and is a member or authorized participant in another; the dashboard and authorization checks preserve both independent relationships.
- A group owner attempts to join their own group through an invitation or any other membership path; no membership is created.
- An exam owner attempts to start an exam as a participant, including through a stale or previously issued attempt link; no attempt is started or exam content disclosed.
- A user changes ownership or membership relationships while viewing a resource; subsequent access reflects the current authorized relationships and does not retain access that has been revoked.
- An exact email lookup in an owned context targets an unknown or unassociated account; its response is indistinguishable in shape and uniform timing from a not-found response, and is rate-limited per requester and context.
- A user owns multiple groups and exams, and participates in resources owned by multiple other users; each resource remains scoped to its own relationships.
- One dashboard section is empty, or a resource is no longer available to the user; the other section remains usable and empty/error states are localized.
- A user is unauthenticated, has an expired session, or attempts to supply another user's identity or relationship details; private data and protected actions remain unavailable.
- Legacy account or test data contains a former role assignment inconsistent with its actual ownership and group/exam relationships; only access supported by legitimate relationships is retained.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST treat each account as a unified identity with no fixed learner or teacher role. An account MUST be able to learn and teach using the same identity.
- **FR-002**: The system MUST authorize access to each resource using the authenticated account's identity and its legitimate ownership or membership/participation relationship to that resource. Client-supplied identity or relationship claims MUST NOT grant access.
- **FR-003**: An authenticated user MUST be able to create and manage their own groups and exams.
- **FR-004**: An authenticated user MUST be able to join groups and participate in exams for which they have legitimate access.
- **FR-005**: The system MUST deny a user from attempting an exam that they own.
- **FR-006**: The system MUST deny a user from becoming a member of a group that they own.
- **FR-007**: The system MUST preserve legitimate access for existing owners, group members, and exam participants through the identity change, and MUST NOT grant access to users who lack the applicable relationship.
- **FR-008**: Profile information MUST be readable by the profile owner, or by the owner of a group or exam only while the participant has a membership, permission, or attempt relationship with that resource. In that owner scope, only display name and email may be visible; preferences and all other profile data MUST remain private. Participants MUST NOT see the owner's or other participants' email addresses. The system MUST NOT provide a general, unscoped profile read; self-reads remain limited to the profile owner.
- **FR-009**: Participant lookup MUST require an exact email and a specific group or exam context that the authenticated requester owns; ownership of that context MUST be verified server-side. Lookup MUST return a match only if the account is already associated with that context, and MUST return only the account ID and display name, never the email. An unassociated account and a nonexistent account MUST produce the same response shape and uniform timing. Lookup MUST be rate-limited per requester and per context. New group participants MUST be added through group invitation codes; direct email lookup MUST NOT add them.
- **FR-010**: Unauthenticated users MUST NOT read private profiles or resources, create or change protected resources, or create group memberships.
- **FR-011**: The signed-in experience MUST provide one dashboard with distinct “Learning” and “Teaching” sections. Learning content MUST reflect legitimate group membership or exam participation; teaching content MUST reflect ownership.
- **FR-012**: The dashboard MUST show localized, truthful empty and error states for each section, and MUST keep one section usable when the other section has no data or an error.
- **FR-013**: The dashboard and account-facing flows MUST support English/LTR and Arabic/RTL, and light and dark themes, using the user's saved preferences where available.
- **FR-014**: Before any authorization change is made, an inventory MUST be generated from the migrations and frozen before implementation. It MUST include every role-based read, write, and protected action in each RLS policy, SECURITY DEFINER function, trigger, and Edge Function path that depends on `profiles.role`, `private.is_admin`, `private.is_student`, or `admin_id`. The security suite MUST include at least one allow case and one deny case for every inventoried path, MUST be written and run against the current role-based authorization state, and its results MUST be recorded as the baseline for comparison with the same cases after the change. Every role-based authorization check MUST be replaced by an ownership or membership check before `profiles.role`, its mirror, or its helpers are removed; no intermediate state may be less secure.
- **FR-015**: Existing actions previously limited to the Admin role MUST remain restricted to the owner of the relevant group or exam: student/participant lookup and invitation management MUST be scoped to the owned group; viewing attempts/results MUST be scoped to the owned exam. Tests MUST prove that non-owners cannot access another owner's data or perform these existing actions. Void-attempt and grade-override actions do not exist yet; if implemented later in feature `004`, they MUST be restricted to the relevant exam owner and include non-owner denial tests.
- **FR-016**: Before-and-after security tests MUST verify that users cannot read or modify another user's data without a legitimate relationship, unauthenticated users receive no private data or protected access, and all previously blocked actions remain blocked. Every inventoried path MUST have at least one passing allow case and one passing deny case both before and after the change.
- **FR-017**: The before-and-after security tests MUST also verify that legitimate existing owners and participants retain their access, and that users cannot take their own exams or join their own groups.

### Key Entities *(include if feature involves data)*

- **Account and profile**: A person's authenticated identity and their own profile information, with no fixed learner or teacher role.
- **Owned resource**: A group or exam created and managed by its owner.
- **Group membership**: A relationship connecting an account to a group it does not own.
- **Exam participation**: A relationship granting an account access to participate in an exam it does not own, subject to existing exam rules.
- **Learning activity**: A group or exam the account may use through membership or participation.
- **Teaching activity**: A group or exam the account owns and may manage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Before implementation, the complete migration-derived authorization inventory is frozen. Before any authorization change, the security suite is run against the current role-based state, with at least one recorded allow and deny result for every inventory entry; the same cases are re-run after the change.
- **SC-002**: Before-and-after security tests pass with zero unauthorized reads or modifications of another user's data across profiles, groups, and exams; owner-scoped participant profile access exposes only display name and email and ends when the relationship is removed.
- **SC-003**: Before-and-after security tests pass with zero private-data disclosures or protected actions available to unauthenticated users.
- **SC-004**: 100% of previously blocked actions represented in the security suite remain blocked after the identity change.
- **SC-005**: 100% of legitimate existing ownership, group membership, and exam participation cases represented in the security suite retain their authorized access.
- **SC-006**: The security suite confirms that no user can take an exam they own or join a group they own.
- **SC-007**: Email lookup tests reveal no account-existence information for arbitrary addresses outside a legitimate scope.
- **SC-008**: Exact email lookup returns only ID and display name for an account already associated with the owned context; an unassociated account and a nonexistent account produce the same response shape and uniform timing, with rate limits enforced per requester and context.
- **SC-009**: A user with both owned and joined/authorized group and exam activities can find them in the correct Learning and Teaching dashboard sections in both languages and themes.
- **SC-010**: Tests confirm that participant lookup and invitation management are limited to the owner of the relevant group, and that attempt/result viewing is limited to the owner of the relevant exam, with zero leakage to non-owners. Void-attempt and grade-override actions do not exist yet; any future implementation in feature `004` MUST be owner-only and include non-owner denial tests.
- **SC-011**: At 320 CSS pixels and wider, dashboard content remains usable in Arabic and English without clipped controls or horizontal page scrolling.

## Assumptions

- The authenticated identity and existing account recovery/sign-in flows remain in place; this feature changes authorization semantics, not the authentication method.
- Development has no real users or production data. Local test data may be reset, but the security baseline must still be run against the current role-based state and recorded before authorization changes; before/after tests must verify legitimate access and denied actions.
- A single clean authorization migration may be planned for the development environment. It must satisfy Constitution III's migration safety and before-and-after security-test requirements.
- Group and exam owners are the accounts that create those resources. Ownership cannot be set or reassigned through an untrusted client claim.
- Direct per-student exam permission by email is replaced by group membership and invitation-based access. New group participants join through existing group invitation codes; an exam-level invitation flow may be considered separately later.
- Existing exam lifecycle, question confidentiality, grading, notification, and audit guarantees remain applicable unless explicitly superseded above.
- Platform-level administration is not a user-facing role and is outside this feature unless a separate server-controlled operational need is approved.

## Out of scope

- Course functionality is deferred to future feature `008-courses` and is outside the scope of 007.

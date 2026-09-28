# Quickstart & Validation: Group Invitation Codes

## Prerequisites

- Local Supabase is running and migrations for `001-foundation` plus this feature are applied.
- `.env.local` contains local Supabase URL, anon key, and service-role key for the integration fixtures.
- An Admin test account, a Student test account, and a second Admin account are available.
- The app is running with `npm run dev` for the manual UI scenario.

## Scenario 1: Admin Creates and Shares a Group Code

1. Sign in as an Admin and open a group the Admin owns.
2. Create an invitation.
3. Copy the displayed code and note its expiry.
4. Reload the group page.

**Expected**: The Admin sees the expiry and active/revoked status, but the previously generated code is not shown again.

## Scenario 2: Student Redeems and Receives Group Access

1. Sign in as a Student and open the Join Group page.
2. Paste the code from Scenario 1 and submit it.
3. Open the Student's group/exam area.

**Expected**: The Student joins the correct group. Any exams assigned to that group appear according to `001-foundation`; pending attempts are created if required by the existing rules. Repeating redemption does not duplicate membership or attempts.

## Scenario 3: Rotation and Revocation

1. As the owning Admin, rotate the group invitation and copy the new code.
2. As a different Student, try the old code, then try the new code.
3. Revoke the invitation as the Admin; try the new code as another Student.

**Expected**: Old and revoked codes fail with the same generic response; the new code works before revocation. Existing group members and their attempts are unchanged.

## Scenario 4: Authorization and Abuse Cases

1. As an Admin, attempt to manage a group owned by a second Admin.
2. As a Student, attempt to call Admin invitation RPCs.
3. Submit five wrong codes as a Student, then submit a valid code inside the same 15-minute window.
4. Attempt redemption while signed out.

**Expected**: Cross-Admin management, non-Student redemption, and signed-out redemption do not create memberships. After five failed submissions, additional attempts are rate-limited without revealing whether a code/group exists.

## Automated Validation

- Apply migrations: `npx supabase migration up --local`.
- Run invitation integration, service, and component tests: `npx vitest run --configLoader native tests/unit/services/group-invitation-redemption.test.ts tests/unit/services/group-invitation-admin.test.ts tests/unit/services/group-invitation-lifecycle.test.ts tests/unit/services/group-invitation-service.test.ts tests/unit/components/group-invitations.test.tsx`.
- Run visual tests: `npx playwright test tests/visual/group-invitations.spec.ts --project=chromium --workers=1`.
- Expected: integration scenarios pass against local Supabase; screenshots cover Arabic/English and light/dark for Admin and Student flows.

See [the RPC contract](contracts/group-invitations.md) and [the data model](data-model.md) for exact boundaries.

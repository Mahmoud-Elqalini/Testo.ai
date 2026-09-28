import { afterEach, describe, expect, it } from 'vitest'
import { createInvitationTestGroup, createInvitationTestUser, type InvitationTestUser } from './group-invitation-test-context'

describe('group invitation administration (local Supabase)', () => {
  let admin: InvitationTestUser | undefined
  let otherAdmin: InvitationTestUser | undefined

  afterEach(async () => {
    if (otherAdmin) { await otherAdmin.cleanup(); otherAdmin = undefined }
    if (admin) { await admin.cleanup(); admin = undefined }
  }, 30_000)

  it('creates a random code once, exposes lifecycle metadata only, and enforces group ownership', async () => {
    admin = await createInvitationTestUser('admin')
    otherAdmin = await createInvitationTestUser('admin')
    const groupId = await createInvitationTestGroup(admin)

    const { data: created, error: createError } = await admin.client.rpc('create_group_invitation', { target_group_id: groupId })
    expect(createError).toBeNull()
    expect(created).toMatchObject({ code: expect.stringMatching(/^[a-f0-9]{32}$/), expires_at: expect.any(String) })
    const code = (created as { code: string; expires_at: string }).code
    const expiresAt = Date.parse((created as { expires_at: string }).expires_at)
    expect(expiresAt).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000)
    expect(expiresAt).toBeLessThan(Date.now() + 31 * 24 * 60 * 60 * 1000)

    const { data: status, error: statusError } = await admin.client.rpc('get_group_invitation_status', { target_group_id: groupId })
    expect(statusError).toBeNull()
    expect(status).toMatchObject({ exists: true, revoked_at: null, expires_at: expect.any(String) })
    expect(Object.keys(status as object).sort()).toEqual(['created_at', 'exists', 'expires_at', 'revoked_at'])
    expect(JSON.stringify(status)).not.toContain(code)

    const foreignCreate = await otherAdmin.client.rpc('create_group_invitation', { target_group_id: groupId })
    expect(foreignCreate.data).toBeNull()
    expect(foreignCreate.error).not.toBeNull()
    const foreignStatus = await otherAdmin.client.rpc('get_group_invitation_status', { target_group_id: groupId })
    expect(foreignStatus.data).toBeNull()
    expect(foreignStatus.error).not.toBeNull()

  }, 30_000)

  it('denies student access to invitation management functions', async () => {
    admin = await createInvitationTestUser('admin')
    const student = await createInvitationTestUser('student')
    try {
      const groupId = await createInvitationTestGroup(admin)
      const denied = await student.client.rpc('create_group_invitation', { target_group_id: groupId })
      expect(denied.data).toBeNull()
      expect(denied.error).not.toBeNull()
    } finally {
      await student.cleanup()
    }
  }, 30_000)
})

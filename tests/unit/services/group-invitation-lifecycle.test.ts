import { afterEach, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createInvitationTestGroup, createInvitationTestUser, type InvitationTestUser } from './group-invitation-test-context'

describe('group invitation lifecycle (local Supabase)', () => {
  let admin: InvitationTestUser | undefined
  let student: InvitationTestUser | undefined
  let secondStudent: InvitationTestUser | undefined
  let otherAdmin: InvitationTestUser | undefined

  afterEach(async () => {
    if (student) { await student.cleanup(); student = undefined }
    if (secondStudent) { await secondStudent.cleanup(); secondStudent = undefined }
    if (otherAdmin) { await otherAdmin.cleanup(); otherAdmin = undefined }
    if (admin) { await admin.cleanup(); admin = undefined }
  }, 30_000)

  it('rotates and revokes codes without changing existing memberships or attempts', async () => {
    admin = await createInvitationTestUser('admin')
    student = await createInvitationTestUser('student')
    secondStudent = await createInvitationTestUser('student')
    otherAdmin = await createInvitationTestUser('admin')
    const groupId = await createInvitationTestGroup(admin)
    const { data: first, error: firstError } = await admin.client.rpc('create_group_invitation', { target_group_id: groupId })
    expect(firstError).toBeNull()

    const firstCode = (first as { code: string }).code
    const firstJoin = await student.client.rpc('redeem_group_invitation', { invitation_code: firstCode })
    expect(firstJoin.error).toBeNull()
    expect(firstJoin.data).toEqual({ success: true })

    const { data: exam, error: examError } = await adminClient.from('exams').insert({
      title: 'Invitation lifecycle exam',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      duration_minutes: 60,
      admin_id: admin.userId,
      is_published: true,
    }).select('id').single()
    expect(examError).toBeNull()
    const { error: permissionError } = await adminClient.from('exam_permissions').insert({ exam_id: exam!.id, group_id: groupId })
    expect(permissionError).toBeNull()
    const { data: originalAttempts, error: originalAttemptsError } = await adminClient.from('exam_attempts')
      .select('id, status').eq('exam_id', exam!.id).eq('student_id', student.userId)
    expect(originalAttemptsError).toBeNull()
    expect(originalAttempts).toHaveLength(1)

    const { data: rotated, error: rotateError } = await admin.client.rpc('rotate_group_invitation', { target_group_id: groupId })
    expect(rotateError).toBeNull()
    expect(rotated).toMatchObject({ code: expect.stringMatching(/^[a-f0-9]{32}$/) })
    const rotatedCode = (rotated as { code: string }).code
    expect(rotatedCode).not.toBe(firstCode)

    const oldCode = await secondStudent.client.rpc('redeem_group_invitation', { invitation_code: firstCode })
    expect(oldCode.error).toBeNull()
    expect(oldCode.data).toEqual({ success: false })
    const rotatedJoin = await secondStudent.client.rpc('redeem_group_invitation', { invitation_code: rotatedCode })
    expect(rotatedJoin.error).toBeNull()
    expect(rotatedJoin.data).toEqual({ success: true })

    const { data: membersBeforeRevoke } = await adminClient.from('group_students').select('student_id').eq('group_id', groupId)
    const { data: attemptsBeforeRevoke } = await adminClient.from('exam_attempts').select('id, status').eq('exam_id', exam!.id)
    const { data: revoked, error: revokeError } = await admin.client.rpc('revoke_group_invitation', { target_group_id: groupId })
    expect(revokeError).toBeNull()
    expect(revoked).toEqual({ revoked: true })
    const revokedRedeem = await student.client.rpc('redeem_group_invitation', { invitation_code: rotatedCode })
    expect(revokedRedeem.error).toBeNull()
    expect(revokedRedeem.data).toEqual({ success: false })

    const { data: membersAfterRevoke } = await adminClient.from('group_students').select('student_id').eq('group_id', groupId)
    const { data: attemptsAfterRevoke } = await adminClient.from('exam_attempts').select('id, status').eq('exam_id', exam!.id)
    expect(membersAfterRevoke).toEqual(membersBeforeRevoke)
    expect(attemptsAfterRevoke).toEqual(attemptsBeforeRevoke)
    const repeatedRevoke = await admin.client.rpc('revoke_group_invitation', { target_group_id: groupId })
    expect(repeatedRevoke.error).toBeNull()
    expect(repeatedRevoke.data).toEqual({ revoked: true })
  }, 30_000)

  it('prevents another admin from rotating or revoking the invitation', async () => {
    admin = await createInvitationTestUser('admin')
    otherAdmin = await createInvitationTestUser('admin')
    const groupId = await createInvitationTestGroup(admin)
    const { error: createError } = await admin.client.rpc('create_group_invitation', { target_group_id: groupId })
    expect(createError).toBeNull()

    const rotate = await otherAdmin.client.rpc('rotate_group_invitation', { target_group_id: groupId })
    expect(rotate.data).toBeNull()
    expect(rotate.error).not.toBeNull()
    const revoke = await otherAdmin.client.rpc('revoke_group_invitation', { target_group_id: groupId })
    expect(revoke.data).toBeNull()
    expect(revoke.error).not.toBeNull()
  }, 30_000)
})

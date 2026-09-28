import { afterEach, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createInvitationTestGroup, createInvitationTestUser, type InvitationTestUser } from './group-invitation-test-context'

describe('group invitation redemption (local Supabase)', () => {
  let admin: InvitationTestUser | undefined
  let student: InvitationTestUser | undefined

  afterEach(async () => {
    if (student) { await student.cleanup(); student = undefined }
    if (admin) { await admin.cleanup(); admin = undefined }
  }, 30_000)

  it('joins only the bound group, is idempotent, and preserves pending-attempt behavior', async () => {
    admin = await createInvitationTestUser('admin')
    student = await createInvitationTestUser('student')
    const groupId = await createInvitationTestGroup(admin)
    const unrelatedGroupId = await createInvitationTestGroup(admin)
    const { data: exam, error: examError } = await adminClient.from('exams').insert({
      title: 'Invitation late-join exam',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      duration_minutes: 60,
      admin_id: admin.userId,
      is_published: true,
    }).select('id').single()
    expect(examError).toBeNull()
    const { error: permissionError } = await adminClient.from('exam_permissions').insert({ exam_id: exam!.id, group_id: groupId })
    expect(permissionError).toBeNull()

    const { data: invitation, error: createError } = await admin.client.rpc('create_group_invitation', { target_group_id: groupId })
    expect(createError).toBeNull()
    expect(invitation).toMatchObject({ code: expect.stringMatching(/^[a-f0-9]{32}$/) })
    const code = (invitation as { code: string }).code

    const first = await student.client.rpc('redeem_group_invitation', { invitation_code: code })
    expect(first.error).toBeNull()
    expect(first.data).toEqual({ success: true })
    const retry = await student.client.rpc('redeem_group_invitation', { invitation_code: code })
    expect(retry.error).toBeNull()
    expect(retry.data).toEqual({ success: true })

    const { data: membership, error: membershipError } = await adminClient.from('group_students')
      .select('group_id, student_id').eq('group_id', groupId).eq('student_id', student.userId)
    expect(membershipError).toBeNull()
    expect(membership).toHaveLength(1)
    const { data: attempts, error: attemptsError } = await adminClient.from('exam_attempts')
      .select('id, status').eq('exam_id', exam!.id).eq('student_id', student.userId)
    expect(attemptsError).toBeNull()
    expect(attempts).toHaveLength(1)
    expect(attempts![0].status).toBe('pending')

    const directInsert = await student.client.from('group_students').insert({ group_id: unrelatedGroupId, student_id: student.userId })
    expect(directInsert.error).not.toBeNull()
    const { data: unrelatedMembership } = await adminClient.from('group_students')
      .select('student_id').eq('group_id', unrelatedGroupId).eq('student_id', student.userId)
    expect(unrelatedMembership).toEqual([])
  }, 30_000)

  it('returns the same generic failure for invalid and throttled submissions and rejects admins', async () => {
    admin = await createInvitationTestUser('admin')
    student = await createInvitationTestUser('student')
    const groupId = await createInvitationTestGroup(admin)
    const { data: invitation, error: createError } = await admin.client.rpc('create_group_invitation', { target_group_id: groupId })
    expect(createError).toBeNull()
    const code = (invitation as { code: string }).code

    const adminRedemption = await admin.client.rpc('redeem_group_invitation', { invitation_code: code })
    expect(adminRedemption.error).toBeNull()
    expect(adminRedemption.data).toEqual({ success: false })

    const invalidResponses = []
    for (let attempt = 0; attempt < 5; attempt += 1) {
      invalidResponses.push(await student.client.rpc('redeem_group_invitation', { invitation_code: `invalid-${attempt}` }))
    }
    expect(invalidResponses.every(({ error, data }) => error === null && JSON.stringify(data) === JSON.stringify({ success: false }))).toBe(true)
    const throttled = await student.client.rpc('redeem_group_invitation', { invitation_code: code })
    expect(throttled.error).toBeNull()
    expect(throttled.data).toEqual({ success: false })
    const { data: membership } = await adminClient.from('group_students').select('student_id').eq('group_id', groupId)
    expect(membership).toEqual([])
  }, 30_000)
})

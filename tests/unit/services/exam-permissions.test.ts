import { afterEach, describe, expect, it } from 'vitest'
import {
  grantExamGroupAccess,
  listExamPermissions,
  revokeExamPermission,
} from '../../../src/lib/services/exam-permissions-service'
import { createExam, deleteExam } from '../../../src/lib/services/exam-service'
import { createGroup } from '../../../src/lib/services/group-service'
import { createGroupInvitation } from '../../../src/lib/services/group-invitation-service'
import { createTestAdmin, createTestStudent } from './test-context'
import { adminClient } from '../helpers/supabase-admin'

describe('exam permissions service (local Supabase)', () => {
  let admin: Awaited<ReturnType<typeof createTestAdmin>> | undefined
  let student: Awaited<ReturnType<typeof createTestStudent>> | undefined
  let nonMember: Awaited<ReturnType<typeof createTestStudent>> | undefined
  let examId: string | undefined
  let foreignGroupId: string | undefined
  let foreignOwnerId: string | undefined

  afterEach(async () => {
    if (examId) await adminClient.from('exam_attempts').update({ status: 'submitted' }).eq('exam_id', examId)
    if (admin && examId) await deleteExam(examId)
    examId = undefined
    if (admin) { await admin.cleanup(); admin = undefined }
    if (student) { await student.cleanup(); student = undefined }
    if (nonMember) { await nonMember.cleanup(); nonMember = undefined }
    if (foreignGroupId) {
      const { error } = await adminClient.from('groups').delete().eq('id', foreignGroupId)
      expect(error).toBeNull()
      foreignGroupId = undefined
    }
    if (foreignOwnerId) {
      const { error } = await adminClient.auth.admin.deleteUser(foreignOwnerId)
      expect(error).toBeNull()
      foreignOwnerId = undefined
    }
  }, 60_000)

  it('grants group access and revokes an unstarted permission', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    const exam = await createExam({ title: 'Permissions exam', start_time: new Date(Date.now() + 3600_000).toISOString(), duration_minutes: 30 })
    expect(exam.error).toBeNull()
    examId = exam.data!.id
    const group = await createGroup({ name: 'Exam cohort' })
    expect(group.error).toBeNull()

    expect((await grantExamGroupAccess(examId, group.data!.id)).error).toBeNull()
    const invitation = await createGroupInvitation(group.data!.id)
    expect(invitation.error).toBeNull()
    const joined = await student.client.rpc('redeem_group_invitation', { invitation_code: invitation.data!.code })
    expect(joined.error).toBeNull()
    expect(joined.data).toEqual({ success: true })

    const permissions = await listExamPermissions(examId)
    expect(permissions.error).toBeNull()
    expect(permissions.data).toEqual([
      expect.objectContaining({ exam_id: examId, group_id: group.data!.id }),
    ])

    const revoked = await revokeExamPermission(examId, group.data!.id)
    expect(revoked.error).toBeNull()
    expect((await listExamPermissions(examId)).data).toHaveLength(0)
  }, 60_000)

  it('shows a published exam to a group member but not to a non-member', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    nonMember = await createTestStudent()

    const exam = await createExam({
      title: 'Group visibility exam',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      duration_minutes: 30,
    })
    expect(exam.error).toBeNull()
    examId = exam.data!.id

    const group = await createGroup({ name: 'Visibility cohort' })
    expect(group.error).toBeNull()
    const invitation = await createGroupInvitation(group.data!.id)
    expect(invitation.error).toBeNull()
    const joined = await student.client.rpc('redeem_group_invitation', { invitation_code: invitation.data!.code })
    expect(joined.error).toBeNull()
    expect(joined.data).toEqual({ success: true })
    expect((await grantExamGroupAccess(examId, group.data!.id)).error).toBeNull()

    const { error: publishError } = await adminClient
      .from('exams')
      .update({ is_published: true })
      .eq('id', examId)
    expect(publishError).toBeNull()

    const [memberResult, nonMemberResult] = await Promise.all([
      student.client.from('exams').select('id').eq('id', examId),
      nonMember.client.from('exams').select('id').eq('id', examId),
    ])

    expect(memberResult.error).toBeNull()
    expect(memberResult.data).toEqual([{ id: examId }])
    expect(nonMemberResult.error).toBeNull()
    expect(nonMemberResult.data).toEqual([])
  }, 60_000)

  it('rejects a group not owned by the exam owner and invalid permission targets', async () => {
    admin = await createTestAdmin()
    const exam = await createExam({ title: 'Ownership exam', start_time: new Date(Date.now() + 3600_000).toISOString(), duration_minutes: 30 })
    expect(exam.error).toBeNull()
    examId = exam.data!.id

    const { data: foreignOwner, error: userError } = await adminClient.auth.admin.createUser({
      email: `foundation-foreign-owner-${crypto.randomUUID()}@testo.local`,
      password: 'Testo-service-test-password-123!',
      email_confirm: true,
    })
    expect(userError).toBeNull()
    expect(foreignOwner.user).toBeDefined()
    foreignOwnerId = foreignOwner.user!.id
    const { data: foreignGroup, error: groupError } = await adminClient.from('groups')
      .insert({ name: 'Foreign group', owner_id: foreignOwner.user!.id }).select('id').single()
    expect(groupError).toBeNull()
    foreignGroupId = foreignGroup!.id
    expect((await grantExamGroupAccess(examId, foreignGroup!.id)).error).not.toBeNull()
    expect((await grantExamGroupAccess(examId, '00000000-0000-0000-0000-000000000000')).error).not.toBeNull()
    expect((await revokeExamPermission(examId, '')).error?.code).toBe('validation_error')
  }, 60_000)

  it('preserves group access while a member has an in-progress attempt', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    const exam = await createExam({ title: 'Active access exam', start_time: new Date(Date.now() - 60_000).toISOString(), duration_minutes: 30 })
    expect(exam.error).toBeNull()
    examId = exam.data!.id
    const group = await createGroup({ name: 'Active cohort' })
    expect(group.error).toBeNull()
    expect((await grantExamGroupAccess(examId, group.data!.id)).error).toBeNull()
    const invitation = await createGroupInvitation(group.data!.id)
    expect(invitation.error).toBeNull()
    const joined = await student.client.rpc('redeem_group_invitation', { invitation_code: invitation.data!.code })
    expect(joined.error).toBeNull()
    expect(joined.data).toEqual({ success: true })

    const { error: attemptError } = await adminClient.from('exam_attempts').insert({
      exam_id: examId,
      student_id: student.userId,
      access_token: crypto.randomUUID(),
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    expect(attemptError).toBeNull()

    expect((await revokeExamPermission(examId, group.data!.id)).error).not.toBeNull()
    expect((await listExamPermissions(examId)).data).toHaveLength(1)
  }, 60_000)
})

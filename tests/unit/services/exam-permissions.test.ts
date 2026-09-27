import { afterEach, describe, expect, it } from 'vitest'
import {
  grantExamGroupAccess,
  grantExamStudentAccess,
  listExamPermissions,
  revokeExamPermission,
} from '../../../src/lib/services/exam-permissions-service'
import { createExam, deleteExam } from '../../../src/lib/services/exam-service'
import { createGroup } from '../../../src/lib/services/group-service'
import { createTestAdmin, createTestStudent } from './test-context'
import { adminClient } from '../helpers/supabase-admin'
import { addStudentToGroup, removeStudentFromGroup } from '../../../src/lib/services/group-service'

describe('exam permissions service (local Supabase)', () => {
  let admin: Awaited<ReturnType<typeof createTestAdmin>> | undefined
  let student: Awaited<ReturnType<typeof createTestStudent>> | undefined
  let groupStudent: Awaited<ReturnType<typeof createTestStudent>> | undefined
  let foreignAdminId: string | undefined
  let examId: string | undefined

  afterEach(async () => {
    if (examId) await adminClient.from('exam_attempts').update({ status: 'submitted' }).eq('exam_id', examId)
    if (admin && examId) await deleteExam(examId)
    examId = undefined
    if (admin) { await admin.cleanup(); admin = undefined }
    if (student) { await student.cleanup(); student = undefined }
    if (groupStudent) { await groupStudent.cleanup(); groupStudent = undefined }
    if (foreignAdminId) { await adminClient.auth.admin.deleteUser(foreignAdminId); foreignAdminId = undefined }
  })

  it('grants individual, group, and mixed access and allows revoking an unstarted permission', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    groupStudent = await createTestStudent()
    const exam = await createExam({ title: 'Permissions exam', start_time: new Date(Date.now() + 3600_000).toISOString(), duration_minutes: 30 })
    expect(exam.error).toBeNull()
    examId = exam.data!.id
    const group = await createGroup({ name: 'Exam cohort' })
    expect(group.error).toBeNull()

    expect((await grantExamStudentAccess(examId, student.userId)).error).toBeNull()
    expect((await grantExamGroupAccess(examId, group.data!.id)).error).toBeNull()
    const { addStudentToGroup } = await import('../../../src/lib/services/group-service')
    expect((await addStudentToGroup(group.data!.id, groupStudent.userId)).error).toBeNull()

    const permissions = await listExamPermissions(examId)
    expect(permissions.error).toBeNull()
    expect(permissions.data).toHaveLength(2)
    expect(permissions.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ exam_id: examId, student_id: student.userId, group_id: null }),
      expect.objectContaining({ exam_id: examId, group_id: group.data!.id, student_id: null }),
    ]))

    const revoked = await revokeExamPermission(examId, { studentId: student.userId })
    expect(revoked.error).toBeNull()
    expect((await listExamPermissions(examId)).data).toHaveLength(1)
  }, 30_000)

  it('rejects a group not owned by the exam admin and invalid permission targets', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    const exam = await createExam({ title: 'Ownership exam', start_time: new Date(Date.now() + 3600_000).toISOString(), duration_minutes: 30 })
    examId = exam.data!.id
    expect((await grantExamStudentAccess(examId, admin.userId)).error).not.toBeNull()
    const { data: other, error: userError } = await adminClient.auth.admin.createUser({
      email: `foundation-foreign-admin-${crypto.randomUUID()}@testo.local`,
      password: 'Testo-service-test-password-123!',
      email_confirm: true,
    })
    expect(userError).toBeNull()
    foreignAdminId = other.user!.id
    await adminClient.from('profiles').update({ role: 'admin' }).eq('id', other.user!.id)
    const { data: foreignGroup, error: groupError } = await adminClient.from('groups')
      .insert({ name: 'Foreign group', admin_id: other.user!.id }).select('id').single()
    expect(groupError).toBeNull()
    expect((await grantExamGroupAccess(examId, foreignGroup!.id)).error).not.toBeNull()
    expect((await grantExamGroupAccess(examId, '00000000-0000-0000-0000-000000000000')).error).not.toBeNull()
    expect((await revokeExamPermission(examId, {})).error?.code).toBe('validation_error')
  }, 30_000)

  it('preserves exam and group access while the student has an in-progress attempt', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    groupStudent = await createTestStudent()
    const exam = await createExam({ title: 'Active access exam', start_time: new Date(Date.now() - 60_000).toISOString(), duration_minutes: 30 })
    examId = exam.data!.id
    const group = await createGroup({ name: 'Active cohort' })
    expect((await grantExamStudentAccess(examId, student.userId)).error).toBeNull()
    expect((await grantExamGroupAccess(examId, group.data!.id)).error).toBeNull()
    expect((await addStudentToGroup(group.data!.id, groupStudent.userId)).error).toBeNull()

    const { error: attemptError } = await adminClient.from('exam_attempts').insert([
      { exam_id: examId, student_id: student.userId, access_token: crypto.randomUUID(), status: 'in_progress', started_at: new Date().toISOString() },
      { exam_id: examId, student_id: groupStudent.userId, access_token: crypto.randomUUID(), status: 'in_progress', started_at: new Date().toISOString() },
    ])
    expect(attemptError).toBeNull()

    expect((await revokeExamPermission(examId, { studentId: student.userId })).error).not.toBeNull()
    expect((await revokeExamPermission(examId, { groupId: group.data!.id })).error).not.toBeNull()
    expect((await removeStudentFromGroup(group.data!.id, groupStudent.userId)).error).not.toBeNull()
    expect((await listExamPermissions(examId)).data).toHaveLength(2)
  }, 30_000)
})

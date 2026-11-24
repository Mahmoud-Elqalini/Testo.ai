import { afterEach, describe, expect, it } from 'vitest'
import { createExam, getExamPermissionSummary, hasExamStartedAttempts, publishExam, unpublishExam, updateExam } from '../../../src/lib/services/exam-service'
import { createQuestion, updateQuestion } from '../../../src/lib/services/question-service'
import { grantExamGroupAccess } from '../../../src/lib/services/exam-permissions-service'
import { createGroupInvitation } from '../../../src/lib/services/group-invitation-service'
import { adminClient } from '../helpers/supabase-admin'
import { createTestAdmin, createTestStudent } from './test-context'

describe('exam publishing and immutability (local Supabase)', () => {
  let admin: Awaited<ReturnType<typeof createTestAdmin>> | undefined
  let student: Awaited<ReturnType<typeof createTestStudent>> | undefined

  afterEach(async () => {
    if (admin) {
      await admin.cleanup()
      admin = undefined
    }
    if (student) {
      await student.cleanup()
      student = undefined
    }
  })

  it('publishes and unpublishes an owned exam', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    const created = await createExam({
      title: 'Publishing test',
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
    })
    expect(created.error).toBeNull()

    const { data: group, error: groupError } = await adminClient
      .from('groups')
      .insert({ name: 'Publish summary fixture', owner_id: admin.userId })
      .select('id')
      .single()
    expect(groupError).toBeNull()
    const invitation = await createGroupInvitation(group!.id)
    expect(invitation.error).toBeNull()
    const joined = await student.client.rpc('redeem_group_invitation', {
      invitation_code: invitation.data!.code,
    })
    expect(joined.error).toBeNull()
    expect(joined.data).toEqual({ success: true })
    const permission = await grantExamGroupAccess(created.data!.id, group!.id)
    expect(permission.error).toBeNull()

    const audience = await getExamPermissionSummary(created.data!.id)
    expect(audience.error).toBeNull()
    expect(audience.data).toEqual({ studentCount: 0, groupCount: 1 })

    const published = await publishExam(created.data!.id)
    expect(published.error).toBeNull()
    expect(published.data?.is_published).toBe(true)

    const unpublished = await unpublishExam(created.data!.id)
    expect(unpublished.error).toBeNull()
    expect(unpublished.data?.is_published).toBe(false)
  }, 30_000)

  it('the database rejects content edits after an attempt has started', async () => {
    admin = await createTestAdmin()
    const created = await createExam({
      title: 'Immutable exam',
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
    })
    expect(created.error).toBeNull()

    const question = await createQuestion(created.data!.id, {
      type: 'essay',
      text: 'Original immutable question',
      referenceAnswers: [{ id: 'ref', text: 'Reference answer' }],
    })
    expect(question.error).toBeNull()

    const { error: attemptError } = await adminClient.from('exam_attempts').insert({
      exam_id: created.data!.id,
      student_id: admin.userId,
      access_token: crypto.randomUUID(),
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    expect(attemptError).toBeNull()

    const editStatus = await hasExamStartedAttempts(created.data!.id)
    expect(editStatus.error).toBeNull()
    expect(editStatus.data).toBe(true)

    const contentEdit = await updateExam(created.data!.id, { title: 'Changed after start' })
    expect(contentEdit.data).toBeNull()
    expect(contentEdit.error).not.toBeNull()

    const questionEdit = await updateQuestion(question.data!.id, {
      type: 'essay',
      text: 'Changed after start',
      referenceAnswers: [{ id: 'ref', text: 'Reference answer' }],
    })
    expect(questionEdit.data).toBeNull()
    expect(questionEdit.error).not.toBeNull()

    const publishStateChange = await publishExam(created.data!.id)
    expect(publishStateChange.error).toBeNull()
    expect(publishStateChange.data?.is_published).toBe(true)
  }, 30_000)
})

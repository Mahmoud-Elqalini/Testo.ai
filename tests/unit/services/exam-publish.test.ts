import { afterEach, describe, expect, it } from 'vitest'
import { createExam, getExamPermissionSummary, hasExamStartedAttempts, publishExam, unpublishExam, updateExam } from '../../../src/lib/services/exam-service'
import { createQuestion, updateQuestion } from '../../../src/lib/services/question-service'
import { adminClient } from '../helpers/supabase-admin'
import { createTestAdmin } from './test-context'

describe('exam publishing and immutability (local Supabase)', () => {
  let admin: Awaited<ReturnType<typeof createTestAdmin>> | undefined

  afterEach(async () => {
    if (admin) {
      await admin.cleanup()
      admin = undefined
    }
  })

  it('publishes and unpublishes an owned exam', async () => {
    admin = await createTestAdmin()
    const created = await createExam({
      title: 'Publishing test',
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
    })
    expect(created.error).toBeNull()

    const { data: group, error: groupError } = await adminClient
      .from('groups')
      .insert({ name: 'Publish summary fixture', admin_id: admin.userId })
      .select('id')
      .single()
    expect(groupError).toBeNull()
    const { error: permissionError } = await adminClient.from('exam_permissions').insert([
      { exam_id: created.data!.id, student_id: admin.userId },
      { exam_id: created.data!.id, group_id: group!.id },
    ])
    expect(permissionError).toBeNull()

    const audience = await getExamPermissionSummary(created.data!.id)
    expect(audience.error).toBeNull()
    expect(audience.data).toEqual({ studentCount: 1, groupCount: 1 })

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

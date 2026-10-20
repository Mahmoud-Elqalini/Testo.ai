import { afterEach, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createAttemptFixture } from '../edge-functions/attempt-test-context'
import { createTestStudent } from '../services/test-context'

describe('student result row-level security (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  let otherStudent: Awaited<ReturnType<typeof createTestStudent>> | undefined
  afterEach(async () => {
    if (otherStudent) { await otherStudent.cleanup(); otherStudent = undefined }
    if (fixture) { await fixture.cleanup(); fixture = undefined }
  }, 60_000)

  it('allows students to read only their own attempt and answer scores', async () => {
    fixture = await createAttemptFixture({ status: 'submitted' })
    const { error: insertError } = await adminClient.from('answers').insert({
      attempt_id: fixture.attemptId,
      question_id: fixture.questionId,
      mcq_answer: 'a',
      score: 1,
    })
    expect(insertError).toBeNull()
    otherStudent = await createTestStudent()

    const ownAttempt = await fixture.student.client.from('exam_attempts').select('id,status').eq('id', fixture.attemptId)
    const ownAnswers = await fixture.student.client.from('answers').select('attempt_id,question_id,score').eq('attempt_id', fixture.attemptId)
    const foreignAttempt = await otherStudent.client.from('exam_attempts').select('id,status').eq('id', fixture.attemptId)
    const foreignAnswers = await otherStudent.client.from('answers').select('attempt_id,question_id,score').eq('attempt_id', fixture.attemptId)
    const foreignResult = await otherStudent.client.rpc('fn_get_student_attempt_result', { p_attempt_id: fixture.attemptId })
    const gradingCriteria = await fixture.student.client.from('questions').select('correct_choice,reference_answers').eq('id', fixture.questionId)

    expect(ownAttempt.data).toEqual([{ id: fixture.attemptId, status: 'submitted' }])
    expect(ownAnswers.data).toEqual([{ attempt_id: fixture.attemptId, question_id: fixture.questionId, score: 1 }])
    expect(foreignAttempt.data).toEqual([])
    expect(foreignAnswers.data).toEqual([])
    expect(foreignResult.data).toEqual({ error: 'access_denied' })
    expect(gradingCriteria.error !== null || gradingCriteria.data?.length === 0).toBe(true)
  }, 60_000)
})

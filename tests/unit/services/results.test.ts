import { afterEach, describe, expect, it } from 'vitest'
import { getStudentResult } from '../../../src/lib/services/results-service'
import { adminClient } from '../helpers/supabase-admin'
import { createAttemptFixture } from '../edge-functions/attempt-test-context'

describe('student results service (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  afterEach(async () => { if (fixture) { await fixture.cleanup(); fixture = undefined } }, 60_000)

  it('computes the weighted total and returns a per-question breakdown after grading', async () => {
    fixture = await createAttemptFixture({ status: 'submitted', withEssayQuestion: true })
    const { error: answerError } = await adminClient.from('answers').insert([
      { attempt_id: fixture.attemptId, question_id: fixture.questionId, mcq_answer: 'a', score: 1 },
      { attempt_id: fixture.attemptId, question_id: fixture.essayQuestionId!, essay_answer: 'A reasoned answer', score: 0.5 },
    ])
    expect(answerError).toBeNull()

    const result = await getStudentResult(fixture.attemptId, fixture.student.client)
    expect(result.error).toBeNull()
    expect(result.data).toMatchObject({
      status: 'graded',
      attemptId: fixture.attemptId,
      earnedPoints: 4.5,
      maximumPoints: 7,
      percentage: 64.29,
      questions: [
        { id: fixture.questionId, type: 'mcq', normalizedScore: 1, earnedPoints: 2, selectedChoice: 'a', correctChoice: 'a' },
        { id: fixture.essayQuestionId, type: 'essay', normalizedScore: 0.5, earnedPoints: 2.5 },
      ],
    })
  }, 60_000)

  it('returns a pending-grading state until every question has a score', async () => {
    fixture = await createAttemptFixture({ status: 'auto_submitted' })
    const result = await getStudentResult(fixture.attemptId, fixture.student.client)
    expect(result.error).toBeNull()
    expect(result.data).toMatchObject({ status: 'pending', attemptId: fixture.attemptId })
    const raw = await fixture.student.client.rpc('fn_get_student_attempt_result', { p_attempt_id: fixture.attemptId })
    expect(JSON.stringify(raw.data)).not.toContain('correct_choice')
    expect(JSON.stringify(raw.data)).not.toContain('choices')
  }, 60_000)
})

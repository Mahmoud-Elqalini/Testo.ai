import { afterEach, describe, expect, it } from 'vitest'
import {
  createQuestion,
  deleteQuestion,
  listQuestions,
  updateQuestion,
} from '../../../src/lib/services/question-service'
import { createExam } from '../../../src/lib/services/exam-service'
import { createTestAdmin } from './test-context'

describe('question service (local Supabase)', () => {
  let admin: Awaited<ReturnType<typeof createTestAdmin>> | undefined

  afterEach(async () => {
    if (admin) {
      await admin.cleanup()
      admin = undefined
    }
  })

  async function createOwnedExam() {
    const result = await createExam({
      title: 'Question service exam',
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
    })
    expect(result.error).toBeNull()
    return result.data!.id
  }

  it('creates, edits, lists, and deletes a valid MCQ', async () => {
    admin = await createTestAdmin()
    const examId = await createOwnedExam()

    const created = await createQuestion(examId, {
      type: 'mcq',
      text: 'Which option is correct?',
      choices: [
        { id: 'choice-a', text: 'First', isCorrect: false },
        { id: 'choice-b', text: 'Second', isCorrect: true },
      ],
    })

    expect(created.error).toBeNull()
    expect(created.data).toMatchObject({
      exam_id: examId,
      type: 'mcq',
      text: 'Which option is correct?',
      points: 1,
      mcq_choices: [
        { id: 'choice-a', text: 'First' },
        { id: 'choice-b', text: 'Second' },
      ],
      correct_choice: 'choice-b',
      reference_answers: null,
    })

    const updated = await updateQuestion(created.data!.id, {
      type: 'mcq',
      text: 'Updated question?',
      points: 2,
      choices: [
        { id: 'choice-a', text: 'First', isCorrect: true },
        { id: 'choice-b', text: 'Second', isCorrect: false },
      ],
    })
    expect(updated.error).toBeNull()
    expect(updated.data?.text).toBe('Updated question?')
    expect(updated.data?.points).toBe(2)
    expect(updated.data?.correct_choice).toBe('choice-a')
    expect(updated.data?.order).toBe(created.data?.order)

    const listed = await listQuestions(examId)
    expect(listed.error).toBeNull()
    expect(listed.data?.map(({ id }) => id)).toContain(created.data!.id)

    const deleted = await deleteQuestion(created.data!.id)
    expect(deleted.error).toBeNull()
    const afterDelete = await listQuestions(examId)
    expect(afterDelete.data).toHaveLength(0)
  }, 30_000)

  it('creates an essay with reference answers', async () => {
    admin = await createTestAdmin()
    const examId = await createOwnedExam()

    const created = await createQuestion(examId, {
      type: 'essay',
      text: 'Explain the concept.',
      referenceAnswers: [{ id: 'ref-main', text: 'A valid reference.' }],
    })

    expect(created.error).toBeNull()
    expect(created.data).toMatchObject({
      type: 'essay',
      points: 1,
      mcq_choices: null,
      correct_choice: null,
      reference_answers: [{ id: 'ref-main', text: 'A valid reference.' }],
    })
  }, 30_000)

  it.each([
    ['empty question text', { type: 'essay', text: '   ', referenceAnswers: [{ id: 'r', text: 'answer' }] }],
    ['MCQ with fewer than two choices', { type: 'mcq', text: 'Question?', choices: [{ id: 'a', text: 'Only', isCorrect: true }] }],
    ['MCQ with no correct choice', { type: 'mcq', text: 'Question?', choices: [{ id: 'a', text: 'A', isCorrect: false }, { id: 'b', text: 'B', isCorrect: false }] }],
    ['MCQ with multiple correct choices', { type: 'mcq', text: 'Question?', choices: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: true }] }],
    ['essay with no reference answer', { type: 'essay', text: 'Explain this.' }],
    ['non-positive points', { type: 'essay', text: 'Explain this.', points: 0, referenceAnswers: [{ id: 'r', text: 'answer' }] }],
  ] as const)('rejects %s before writing to the database', async (_label, input) => {
    admin = await createTestAdmin()
    const examId = await createOwnedExam()
    const result = await createQuestion(examId, input as never)
    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('validation_error')
  }, 30_000)
})

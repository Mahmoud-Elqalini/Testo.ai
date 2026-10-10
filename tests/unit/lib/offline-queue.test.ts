import { beforeEach, describe, expect, it } from 'vitest'
import { queueAnswer, readQueuedAnswers, removeQueuedAnswer } from '../../../src/lib/offline-queue'

const attempt = 'b9079b2b-77a5-4789-8554-c72e8994cecf'
const session = 'd1f87487-03e5-4642-9184-18d0647beca7'

describe('offline answer queue', () => {
  beforeEach(() => localStorage.clear())

  it('keeps only the latest answer per question and scopes data to a session', () => {
    queueAnswer({ attempt_id: attempt, session_id: session, question_id: 'q-1', mcq_answer: 'a', essay_answer: null })
    queueAnswer({ attempt_id: attempt, session_id: session, question_id: 'q-1', mcq_answer: 'b', essay_answer: null })
    queueAnswer({ attempt_id: attempt, session_id: session, question_id: 'q-2', mcq_answer: null, essay_answer: 'draft' })
    expect(readQueuedAnswers(attempt, session)).toEqual([
      { attempt_id: attempt, session_id: session, question_id: 'q-1', mcq_answer: 'b', essay_answer: null },
      { attempt_id: attempt, session_id: session, question_id: 'q-2', mcq_answer: null, essay_answer: 'draft' },
    ])
    expect(readQueuedAnswers(attempt, 'another-session')).toEqual([])
  })

  it('removes a synced answer and clears the storage key when empty', () => {
    queueAnswer({ attempt_id: attempt, session_id: session, question_id: 'q-1', mcq_answer: 'a', essay_answer: null })
    removeQueuedAnswer(attempt, session, 'q-1')
    expect(readQueuedAnswers(attempt, session)).toEqual([])
    expect(localStorage.length).toBe(0)
  })
})

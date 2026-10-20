import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createAttemptFixture, responseBody } from './attempt-test-context'
import { queueAnswer, readQueuedAnswers, removeQueuedAnswer } from '../../../src/lib/offline-queue'

/**
 * Offline queue data-path integration test (Phase 5 support coverage).
 *
 * Architecture limitation: True network disconnection requires a browser
 * environment with route interception (Playwright). This test uses Vitest with
 * jsdom and real local Supabase Edge Functions. It exercises the *data path*
 * — queueing answers locally, sending them on "reconnect", and verifying
 * server-side persistence/rejection — but does not simulate actual browser
 * offline events or visually verify the "unsynced" indicator.
 *
 * The visual regression test in tests/visual/student-exam.spec.ts covers the
 * UI-level save-status rendering. The unit test in tests/unit/lib/offline-queue.test.ts
 * covers the client-side queue logic in isolation.
 */
describe('offline queue → Edge Function reconnect (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  beforeEach(() => localStorage.clear())
  afterEach(async () => {
    localStorage.clear()
    if (fixture) { await fixture.cleanup(); fixture = undefined }
  })

  it('queues MCQ and essay answers offline, then syncs them on reconnect', async () => {
    fixture = await createAttemptFixture({ withEssayQuestion: true })
    const started = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
    expect(started.error).toBeNull()
    const sessionId: string = started.data.session_id

    // Simulate offline: queue answers locally (Edge Function is not called)
    const mcqPayload = { attempt_id: fixture.attemptId, session_id: sessionId, question_id: fixture.questionId, mcq_answer: 'b', essay_answer: null }
    const essayPayload = { attempt_id: fixture.attemptId, session_id: sessionId, question_id: fixture.essayQuestionId!, mcq_answer: null, essay_answer: 'My essay answer.' }
    queueAnswer(mcqPayload)
    queueAnswer(essayPayload)

    // Verify unsynced state: two answers queued, none persisted server-side
    const queued = readQueuedAnswers(fixture.attemptId, sessionId)
    expect(queued).toHaveLength(2)
    const { data: preSync } = await adminClient.from('answers').select('id').eq('attempt_id', fixture.attemptId)
    expect(preSync).toEqual([])

    // Simulate reconnect: send each queued answer to the Edge Function
    for (const answer of queued) {
      const result = await fixture.student.client.functions.invoke('save-answer', { body: answer })
      expect(result.error).toBeNull()
      expect(result.data.saved).toBe(true)
      removeQueuedAnswer(answer.attempt_id, answer.session_id, answer.question_id)
    }

    // Verify queue is now empty (all synced)
    expect(readQueuedAnswers(fixture.attemptId, sessionId)).toEqual([])

    // Verify answers persisted in the database
    const { data: answers, error } = await adminClient
      .from('answers')
      .select('question_id, mcq_answer, essay_answer')
      .eq('attempt_id', fixture.attemptId)
    expect(error).toBeNull()
    expect(answers).toHaveLength(2)
    const mcq = answers!.find((a) => a.question_id === fixture!.questionId)
    const essay = answers!.find((a) => a.question_id === fixture!.essayQuestionId)
    expect(mcq).toMatchObject({ mcq_answer: 'b', essay_answer: null })
    expect(essay).toMatchObject({ mcq_answer: null, essay_answer: 'My essay answer.' })
  }, 45_000)

  it('rejects locally queued answers when they are sent after the exam deadline', async () => {
    const sessionId = crypto.randomUUID()
    fixture = await createAttemptFixture({
      startsInMs: -120_000, durationMinutes: 1,
      status: 'in_progress', sessionId, withEssayQuestion: true,
    })

    // This fixture is already expired. Queueing here verifies that local queue
    // contents cannot bypass the server's deadline check when later submitted.
    queueAnswer({ attempt_id: fixture.attemptId, session_id: sessionId, question_id: fixture.questionId, mcq_answer: 'a', essay_answer: null })
    queueAnswer({ attempt_id: fixture.attemptId, session_id: sessionId, question_id: fixture.essayQuestionId!, mcq_answer: null, essay_answer: 'Late essay.' })
    expect(readQueuedAnswers(fixture.attemptId, sessionId)).toHaveLength(2)

    // Simulate reconnect after deadline: server rejects every answer (FR-016)
    for (const answer of readQueuedAnswers(fixture.attemptId, sessionId)) {
      const result = await fixture.student.client.functions.invoke('save-answer', { body: answer })
      expect(await responseBody(result.error)).toEqual({ status: 403, body: { error: 'access_denied', message: 'Access denied.' } })
    }

    // Verify no answers were persisted server-side
    const { data: answers } = await adminClient.from('answers').select('id').eq('attempt_id', fixture.attemptId)
    expect(answers).toEqual([])
  }, 30_000)
})

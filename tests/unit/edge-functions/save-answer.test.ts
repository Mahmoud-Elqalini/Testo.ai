import { afterEach, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createAttemptFixture, responseBody } from './attempt-test-context'

describe('save-answer Edge Function (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  afterEach(async () => { if (fixture) { await fixture.cleanup(); fixture = undefined } })

  it('upserts answers idempotently and returns a server save timestamp', async () => {
    fixture = await createAttemptFixture()
    const started = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
    const body = { attempt_id: fixture.attemptId, session_id: started.data.session_id, question_id: fixture.questionId, mcq_answer: 'b', essay_answer: null }
    const first = await fixture.student.client.functions.invoke('save-answer', { body })
    const second = await fixture.student.client.functions.invoke('save-answer', { body: { ...body, mcq_answer: 'a' } })
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ saved: true, question_id: fixture.questionId })
    expect(Date.parse(first.data.saved_at)).not.toBeNaN()
    expect(second.error).toBeNull()
    const { data: rows, error } = await adminClient.from('answers').select('mcq_answer').eq('attempt_id', fixture.attemptId).eq('question_id', fixture.questionId)
    expect(error).toBeNull()
    expect(rows).toEqual([{ mcq_answer: 'a' }])
  }, 30_000)

  it('denies stale sessions and rejects answers for questions outside the attempt exam', async () => {
    fixture = await createAttemptFixture()
    const started = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
    const stale = await fixture.student.client.functions.invoke('save-answer', { body: { attempt_id: fixture.attemptId, session_id: crypto.randomUUID(), question_id: fixture.questionId, mcq_answer: 'a', essay_answer: null } })
    expect(await responseBody(stale.error)).toEqual({ status: 403, body: { error: 'access_denied', message: 'Access denied.' } })
    const invalid = await fixture.student.client.functions.invoke('save-answer', { body: { attempt_id: fixture.attemptId, session_id: started.data.session_id, question_id: crypto.randomUUID(), mcq_answer: null, essay_answer: 'Answer' } })
    expect(await responseBody(invalid.error)).toMatchObject({ status: 400, body: { error: 'validation_error' } })
  }, 30_000)

  it('rejects an answer after the exam deadline has passed (FR-016)', async () => {
    const sessionId = crypto.randomUUID()
    fixture = await createAttemptFixture({ startsInMs: -120_000, durationMinutes: 1, status: 'in_progress', sessionId })
    const result = await fixture.student.client.functions.invoke('save-answer', {
      body: { attempt_id: fixture.attemptId, session_id: sessionId, question_id: fixture.questionId, mcq_answer: 'a', essay_answer: null },
    })
    expect(await responseBody(result.error)).toEqual({ status: 403, body: { error: 'access_denied', message: 'Access denied.' } })
  }, 30_000)
})

import { afterEach, describe, expect, it } from 'vitest'
import { createAttemptFixture, responseBody } from './attempt-test-context'

describe('get-exam-questions Edge Function (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  afterEach(async () => { if (fixture) { await fixture.cleanup(); fixture = undefined } })

  it('returns only safe question fields and the student’s own saved answers', async () => {
    fixture = await createAttemptFixture()
    const started = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
    const loaded = await fixture.student.client.functions.invoke('get-exam-questions', { method: 'GET', query: { attempt_id: fixture.attemptId, session_id: started.data.session_id } })
    expect(loaded.error).toBeNull()
    expect(loaded.data.questions[0]).toEqual({
      id: fixture.questionId, type: 'mcq', text: 'Which answer is correct?', points: 2, order: 1,
      mcq_choices: [{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }],
    })
    expect(JSON.stringify(loaded.data)).not.toContain('correct_choice')
    expect(JSON.stringify(loaded.data)).not.toContain('reference_answers')
    expect(loaded.data.answers).toEqual([])
  }, 30_000)

  it('rejects missing and stale session identifiers without disclosing the cause', async () => {
    fixture = await createAttemptFixture()
    const invalid = await fixture.student.client.functions.invoke('get-exam-questions', { method: 'GET', query: { attempt_id: fixture.attemptId, session_id: crypto.randomUUID() } })
    expect(await responseBody(invalid.error)).toEqual({ status: 403, body: { error: 'access_denied', message: 'Access denied.' } })
  }, 30_000)
})

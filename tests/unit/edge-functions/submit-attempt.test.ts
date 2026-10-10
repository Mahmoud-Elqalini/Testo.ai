import { afterEach, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createAttemptFixture, responseBody } from './attempt-test-context'

describe('submit-attempt Edge Function (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  afterEach(async () => { if (fixture) { await fixture.cleanup(); fixture = undefined } })

  it('submits an in-progress attempt once and returns the original submission on retry', async () => {
    fixture = await createAttemptFixture()
    const started = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
    const body = { attempt_id: fixture.attemptId, session_id: started.data.session_id }
    const first = await fixture.student.client.functions.invoke('submit-attempt', { body })
    const second = await fixture.student.client.functions.invoke('submit-attempt', { body })
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ attempt_id: fixture.attemptId, status: 'submitted', already_submitted: false })
    expect(second.error).toBeNull()
    expect(second.data).toMatchObject({ status: 'submitted', already_submitted: true, finished_at: first.data.finished_at })
    const { data: attempt } = await adminClient.from('exam_attempts').select('status').eq('id', fixture.attemptId).single()
    expect(attempt?.status).toBe('submitted')
  }, 30_000)

  it('rejects attempts closed by the system', async () => {
    const sessionId = crypto.randomUUID()
    fixture = await createAttemptFixture({ status: 'auto_submitted', sessionId })
    const result = await fixture.student.client.functions.invoke('submit-attempt', { body: { attempt_id: fixture.attemptId, session_id: sessionId } })
    expect(await responseBody(result.error)).toEqual({ status: 403, body: { error: 'access_denied', message: 'Access denied.' } })
  }, 30_000)
})

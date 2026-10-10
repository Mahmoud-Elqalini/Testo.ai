import { afterEach, describe, expect, it } from 'vitest'
import { createAttemptFixture, responseBody } from './attempt-test-context'

describe('start-attempt Edge Function (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  afterEach(async () => { if (fixture) { await fixture.cleanup(); fixture = undefined } })

  it('starts an owned attempt and treats a second start as a session takeover', async () => {
    fixture = await createAttemptFixture()
    const first = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ attempt_id: fixture.attemptId, was_takeover: false })
    expect(first.data.session_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(first.data.remaining_seconds).toBeGreaterThan(0)
    const second = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
    expect(second.error).toBeNull()
    expect(second.data).toMatchObject({ was_takeover: true })
    expect(second.data.session_id).not.toBe(first.data.session_id)
  }, 30_000)

  it('returns the same generic denial for attempts that belong to another student', async () => {
    fixture = await createAttemptFixture()
    const other = await (await import('../services/test-context')).createTestStudent()
    try {
      const result = await other.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
      expect(await responseBody(result.error)).toEqual({ status: 403, body: { error: 'access_denied', message: 'Access denied.' } })
    } finally {
      await other.cleanup()
    }
  }, 30_000)

  it('returns a validation response for a malformed attempt identifier', async () => {
    fixture = await createAttemptFixture()
    const result = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: 'invalid' } })
    expect(await responseBody(result.error)).toMatchObject({ status: 400, body: { error: 'validation_error' } })
  }, 30_000)
})

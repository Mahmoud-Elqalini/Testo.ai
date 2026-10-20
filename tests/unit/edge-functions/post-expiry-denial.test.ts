import { afterEach, describe, expect, it } from 'vitest'
import { createAttemptFixture, responseBody } from './attempt-test-context'

describe('start-attempt after expiry (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  afterEach(async () => { if (fixture) { await fixture.cleanup(); fixture = undefined } }, 60_000)

  it.each(['auto_submitted', 'abandoned'])('denies re-access to a %s attempt', async (status) => {
    fixture = await createAttemptFixture({ startsInMs: -2 * 60_000, durationMinutes: 1, status, sessionId: crypto.randomUUID() })
    const result = await fixture.student.client.functions.invoke('start-attempt', { body: { attempt_id: fixture.attemptId } })
    expect(await responseBody(result.error)).toEqual({ status: 403, body: { error: 'access_denied', message: 'Access denied.' } })
  }, 30_000)
})

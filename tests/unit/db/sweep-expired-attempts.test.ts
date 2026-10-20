import { afterEach, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createAttemptFixture } from '../edge-functions/attempt-test-context'

describe('expired-attempt sweep (local Supabase)', () => {
  let fixtures: Array<Awaited<ReturnType<typeof createAttemptFixture>>> = []
  afterEach(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()))
    fixtures = []
  }, 60_000)

  it('auto-submits expired in-progress attempts and records the finish time', async () => {
    const sessionId = crypto.randomUUID()
    const fixture = await createAttemptFixture({ startsInMs: -2 * 60_000, durationMinutes: 1, status: 'in_progress', sessionId })
    fixtures.push(fixture)

    const sweep = await adminClient.rpc('fn_sweep_expired_attempts')
    expect(sweep.error).toBeNull()
    const { data: attempt, error } = await adminClient.from('exam_attempts').select('status,finished_at').eq('id', fixture.attemptId).single()
    expect(error).toBeNull()
    expect(attempt).toMatchObject({ status: 'auto_submitted' })
    expect(Date.parse(attempt!.finished_at!)).toBeGreaterThan(0)
  }, 30_000)

  it('abandons expired pending attempts without marking them as submitted', async () => {
    const fixture = await createAttemptFixture({ startsInMs: -2 * 60_000, durationMinutes: 1, status: 'pending' })
    fixtures.push(fixture)

    const sweep = await adminClient.rpc('fn_sweep_expired_attempts')
    expect(sweep.error).toBeNull()
    const { data: attempt, error } = await adminClient.from('exam_attempts').select('status,finished_at').eq('id', fixture.attemptId).single()
    expect(error).toBeNull()
    expect(attempt).toMatchObject({ status: 'abandoned', finished_at: null })
  }, 30_000)

  it('does not close attempts before their exam deadline', async () => {
    const fixture = await createAttemptFixture({ startsInMs: -60_000, durationMinutes: 30, status: 'in_progress', sessionId: crypto.randomUUID() })
    fixtures.push(fixture)

    const sweep = await adminClient.rpc('fn_sweep_expired_attempts')
    expect(sweep.error).toBeNull()
    const { data: attempt } = await adminClient.from('exam_attempts').select('status,finished_at').eq('id', fixture.attemptId).single()
    expect(attempt).toMatchObject({ status: 'in_progress', finished_at: null })
  }, 30_000)

  it('does not allow a student client to invoke the privileged sweep', async () => {
    const fixture = await createAttemptFixture()
    fixtures.push(fixture)

    const result = await fixture.student.client.rpc('fn_sweep_expired_attempts')
    expect(result.error).not.toBeNull()
  }, 30_000)
})

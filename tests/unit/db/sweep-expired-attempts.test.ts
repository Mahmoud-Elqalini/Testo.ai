import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { adminClient } from '../helpers/supabase-admin'
import { createAttemptFixture } from '../edge-functions/attempt-test-context'

function runPostgresSql(sql: string): string {
  const result = spawnSync('docker', [
    'exec', 'supabase_db_05_Testo', 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `postgres psql exited with status ${result.status}`)
  }
  return result.stdout.trim()
}

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

    runPostgresSql('SELECT public.fn_sweep_expired_attempts();')
    const { data: attempt, error } = await adminClient.from('exam_attempts').select('status,finished_at').eq('id', fixture.attemptId).single()
    expect(error).toBeNull()
    expect(attempt).toMatchObject({ status: 'auto_submitted' })
    expect(Date.parse(attempt!.finished_at!)).toBeGreaterThan(0)
  }, 30_000)

  it('abandons expired pending attempts without marking them as submitted', async () => {
    const fixture = await createAttemptFixture({ startsInMs: -2 * 60_000, durationMinutes: 1, status: 'pending' })
    fixtures.push(fixture)

    runPostgresSql('SELECT public.fn_sweep_expired_attempts();')
    const { data: attempt, error } = await adminClient.from('exam_attempts').select('status,finished_at').eq('id', fixture.attemptId).single()
    expect(error).toBeNull()
    expect(attempt).toMatchObject({ status: 'abandoned', finished_at: null })
  }, 30_000)

  it('does not close attempts before their exam deadline', async () => {
    const fixture = await createAttemptFixture({ startsInMs: -60_000, durationMinutes: 30, status: 'in_progress', sessionId: crypto.randomUUID() })
    fixtures.push(fixture)

    runPostgresSql('SELECT public.fn_sweep_expired_attempts();')
    const { data: attempt } = await adminClient.from('exam_attempts').select('status,finished_at').eq('id', fixture.attemptId).single()
    expect(attempt).toMatchObject({ status: 'in_progress', finished_at: null })
  }, 30_000)

  it('does not allow an authenticated client to invoke the privileged sweep', async () => {
    const fixture = await createAttemptFixture()
    fixtures.push(fixture)

    const result = await fixture.student.client.rpc('fn_sweep_expired_attempts')
    expect(result.error?.code).toBe('42501')
  }, 30_000)

  it('does not allow an anon client to invoke the privileged sweep', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) throw new Error('Local Supabase URL and anon key are required for database tests')
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, storageKey: `sweep-anon-${crypto.randomUUID()}` },
    })

    const result = await anonClient.rpc('fn_sweep_expired_attempts')
    expect(result.error?.code).toBe('42501')
  }, 30_000)

  it('does not allow the service-role client to invoke the privileged sweep', async () => {
    const result = await adminClient.rpc('fn_sweep_expired_attempts')
    expect(result.error?.code).toBe('42501')
  }, 30_000)

  it('records successful postgres cron runs for both scheduled attempt jobs', async () => {
    const startedAt = new Date().toISOString()
    const deadline = Date.now() + 75_000
    let successfulJobs = 0

    while (Date.now() < deadline && successfulJobs < 2) {
      const count = runPostgresSql(`
        SELECT count(DISTINCT command)::text
        FROM cron.job_run_details
        WHERE username = 'postgres'
          AND status = 'succeeded'
          AND start_time >= '${startedAt}'::timestamptz
          AND command IN (
            'SELECT fn_create_pending_attempts_at_start();',
            'SELECT fn_sweep_expired_attempts();'
          );
      `)
      successfulJobs = Number(count)
      if (successfulJobs < 2) await new Promise((resolve) => setTimeout(resolve, 1_000))
    }

    expect(successfulJobs).toBe(2)
  }, 90_000)
})

import { afterEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createAttemptFixture } from '../edge-functions/attempt-test-context'
import { createTestStudent } from '../services/test-context'

describe('student attempt database operations (local Supabase)', () => {
  let fixture: Awaited<ReturnType<typeof createAttemptFixture>> | undefined
  afterEach(async () => { if (fixture) { await fixture.cleanup(); fixture = undefined } })

  it('serializes a student attempt lifecycle and never returns grading keys', async () => {
    fixture = await createAttemptFixture()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) throw new Error('Local Supabase URL and anon key are required for database tests')
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, storageKey: `attempt-anon-${crypto.randomUUID()}` },
    })
    const anonStart = await anonClient.rpc('fn_start_attempt', {
      p_attempt_id: fixture.attemptId, p_session_id: crypto.randomUUID(),
    })
    expect(anonStart.error).not.toBeNull()

    const otherStudent = await createTestStudent()
    try {
      const otherStart = await otherStudent.client.rpc('fn_start_attempt', {
        p_attempt_id: fixture.attemptId, p_session_id: crypto.randomUUID(),
      })
      expect(otherStart.error).toBeNull()
      expect(otherStart.data).toMatchObject({ denial_reason: 'owner_mismatch' })
    } finally {
      await otherStudent.cleanup()
    }

    const ownerStart = await fixture.admin.client.rpc('fn_start_attempt', {
      p_attempt_id: fixture.attemptId, p_session_id: crypto.randomUUID(),
    })
    expect(ownerStart.error).toBeNull()
    expect(ownerStart.data).toMatchObject({ denial_reason: 'owner_mismatch' })

    const started = await fixture.student.client.rpc('fn_start_attempt', {
      p_attempt_id: fixture.attemptId, p_session_id: crypto.randomUUID(),
    })
    expect(started.error).toBeNull()
    expect(started.data).toMatchObject({ attempt_id: fixture.attemptId, was_takeover: false })

    const questions = await fixture.student.client.rpc('fn_get_exam_questions', {
      p_attempt_id: fixture.attemptId, p_session_id: started.data.session_id,
    })
    expect(questions.error).toBeNull()
    expect(JSON.stringify(questions.data)).not.toContain('correct_choice')
    expect(JSON.stringify(questions.data)).not.toContain('reference_answers')
    expect(questions.data.questions[0].mcq_choices).toEqual([{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }])

    const save = await fixture.student.client.rpc('fn_save_attempt_answer', {
      p_attempt_id: fixture.attemptId, p_session_id: started.data.session_id,
      p_question_id: fixture.questionId, p_mcq_answer: 'b', p_essay_answer: null,
    })
    expect(save.error).toBeNull()
    expect(save.data).toMatchObject({ saved: true, question_id: fixture.questionId })

    const submit = await fixture.student.client.rpc('fn_submit_attempt', {
      p_attempt_id: fixture.attemptId, p_session_id: started.data.session_id,
    })
    expect(submit.error).toBeNull()
    expect(submit.data).toMatchObject({ status: 'submitted', already_submitted: false })
    const retry = await fixture.student.client.rpc('fn_submit_attempt', {
      p_attempt_id: fixture.attemptId, p_session_id: started.data.session_id,
    })
    expect(retry.data).toMatchObject({ status: 'submitted', already_submitted: true })
  }, 30_000)

  it('rejects expired and invalid choices in the database transaction', async () => {
    fixture = await createAttemptFixture({ startsInMs: -31 * 60_000 })
    const start = await fixture.student.client.rpc('fn_start_attempt', {
      p_attempt_id: fixture.attemptId, p_session_id: crypto.randomUUID(),
    })
    expect(start.data).toMatchObject({ denial_reason: 'outside_exam_window' })
    await fixture.cleanup()
    fixture = undefined

    const sessionId = crypto.randomUUID()
    fixture = await createAttemptFixture({ startsInMs: -31 * 60_000, status: 'in_progress', sessionId })
    const expiredSave = await fixture.student.client.rpc('fn_save_attempt_answer', {
      p_attempt_id: fixture.attemptId, p_session_id: sessionId,
      p_question_id: fixture.questionId, p_mcq_answer: 'a', p_essay_answer: null,
    })
    expect(expiredSave.data).toMatchObject({ denial_reason: 'outside_exam_window' })
    await fixture.cleanup()
    fixture = undefined

    const activeSessionId = crypto.randomUUID()
    fixture = await createAttemptFixture({ status: 'in_progress', sessionId: activeSessionId })
    const badChoice = await fixture.student.client.rpc('fn_save_attempt_answer', {
      p_attempt_id: fixture.attemptId, p_session_id: activeSessionId,
      p_question_id: fixture.questionId, p_mcq_answer: 'missing-choice', p_essay_answer: null,
    })
    expect(badChoice.data).toMatchObject({ validation_error: 'The answer does not match this exam question.' })
  }, 30_000)
})

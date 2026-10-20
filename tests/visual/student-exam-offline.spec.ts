import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { signInBrowserContext, updateVisualProfile, visualAppOrigin } from './helpers/sign-in'

loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const hasLocalSupabaseCredentials = Boolean(supabaseUrl && serviceRoleKey && anonKey)
const adminClient = hasLocalSupabaseCredentials
  ? createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

test.describe('Student exam offline recovery (local Supabase)', () => {
  test.skip(!hasLocalSupabaseCredentials, 'Local Supabase credentials are required for this test.')

  test('marks MCQ and essay answers unsynced offline, then syncs them on reconnect', async ({ page, context }) => {
    test.setTimeout(120_000)

    const password = 'Testo-offline-exam-password-123!'
    const adminEmail = `admin-offline-vrt-${crypto.randomUUID()}@testo.local`
    const studentEmail = `student-offline-vrt-${crypto.randomUUID()}@testo.local`
    const { data: adminData, error: adminCreateError } = await adminClient!.auth.admin.createUser({
      email: adminEmail, password, email_confirm: true,
    })
    if (adminCreateError || !adminData.user) throw adminCreateError ?? new Error('Could not create offline test admin')

    const { data: studentData, error: studentCreateError } = await adminClient!.auth.admin.createUser({
      email: studentEmail, password, email_confirm: true,
    })
    if (studentCreateError || !studentData.user) {
      await adminClient!.auth.admin.deleteUser(adminData.user.id)
      throw studentCreateError ?? new Error('Could not create offline test student')
    }

    let examId: string | undefined
    let attemptId: string | undefined

    try {
      await updateVisualProfile(adminClient!, adminData.user.id, { role: 'admin' })
      await updateVisualProfile(adminClient!, studentData.user.id, { preferred_language: 'en', preferred_theme: 'light' })

      const { data: exam, error: examError } = await adminClient!.from('exams').insert({
        title: 'Offline recovery exam',
        start_time: new Date(Date.now() - 30_000).toISOString(),
        duration_minutes: 30,
        admin_id: adminData.user.id,
        is_published: true,
      }).select('id').single()
      if (examError || !exam) throw examError ?? new Error('Could not create offline test exam')
      examId = exam.id

      const { data: mcq, error: mcqError } = await adminClient!.from('questions').insert({
        exam_id: examId,
        type: 'mcq',
        text: 'Choose the correct sample option.',
        points: 2,
        order: 1,
        mcq_choices: [{ id: 'a', text: 'First answer' }, { id: 'b', text: 'Second answer' }],
        correct_choice: 'b',
      }).select('id').single()
      if (mcqError || !mcq) throw mcqError ?? new Error('Could not create offline test MCQ')

      const { data: essay, error: essayError } = await adminClient!.from('questions').insert({
        exam_id: examId,
        type: 'essay',
        text: 'Explain your reasoning in a sentence.',
        points: 5,
        order: 2,
        reference_answers: [{ id: 'reference-1', text: 'A sample explanation.' }],
      }).select('id').single()
      if (essayError || !essay) throw essayError ?? new Error('Could not create offline test essay')

      const { error: permissionError } = await adminClient!.from('exam_permissions').insert({
        exam_id: examId,
        student_id: studentData.user.id,
        group_id: null,
      })
      if (permissionError) throw permissionError

      const { data: attempt, error: attemptError } = await adminClient!.from('exam_attempts')
        .select('id')
        .eq('exam_id', examId)
        .eq('student_id', studentData.user.id)
        .single()
      if (attemptError || !attempt) throw attemptError ?? new Error('Permission did not create a pending attempt')
      attemptId = attempt.id

      await context.addCookies([{ name: 'testo_language', value: 'en', url: visualAppOrigin() }])
      await page.addInitScript(() => {
        window.localStorage.setItem('testo_language', 'en')
        window.localStorage.setItem('testo_theme', 'light')
      })
      await signInBrowserContext(context, studentEmail, password)

      await page.goto(`/student/exam/${attemptId}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('Choose the correct sample option.')).toBeVisible({ timeout: 30_000 })

      await context.setOffline(true)
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)

      await page.getByRole('radio', { name: /First answer/ }).check()
      await expect(page.locator('[role="status"]').getByText('Not synced', { exact: true })).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Next' }).click()
      await expect(page.getByText('Explain your reasoning in a sentence.')).toBeVisible()
      const essayInput = page.getByRole('textbox')
      await essayInput.fill('My answer remains available after reconnecting.')
      await essayInput.press('Tab')

      await expect(page.locator('[role="status"]').getByText('Not synced', { exact: true })).toBeVisible({ timeout: 10_000 })

      const { data: beforeReconnect, error: beforeReconnectError } = await adminClient!.from('answers')
        .select('id')
        .eq('attempt_id', attemptId)
      if (beforeReconnectError) throw beforeReconnectError
      expect(beforeReconnect).toEqual([])

      await context.setOffline(false)
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
      await expect(page.locator('[role="status"]').getByText('Saved', { exact: true })).toBeVisible({ timeout: 20_000 })
      await page.getByRole('button', { name: 'Previous' }).click()
      await expect(page.locator('[role="status"]').getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })

      const { data: savedAnswers, error: savedAnswersError } = await adminClient!.from('answers')
        .select('question_id, mcq_answer, essay_answer')
        .eq('attempt_id', attemptId)
      if (savedAnswersError) throw savedAnswersError
      expect(savedAnswers).toHaveLength(2)
      expect(savedAnswers).toContainEqual({ question_id: mcq.id, mcq_answer: 'a', essay_answer: null })
      expect(savedAnswers).toContainEqual({ question_id: essay.id, mcq_answer: null, essay_answer: 'My answer remains available after reconnecting.' })
    } finally {
      const cleanupErrors: unknown[] = []
      const cleanup = async (operation: () => PromiseLike<{ error: unknown }>) => {
        try {
          const { error } = await operation()
          if (error) cleanupErrors.push(error)
        } catch (error) {
          cleanupErrors.push(error)
        }
      }

      if (attemptId) {
        await cleanup(() => adminClient!.from('answers').delete().eq('attempt_id', attemptId!))
        await cleanup(() => adminClient!.from('exam_attempts').delete().eq('id', attemptId!))
      }
      if (examId) {
        await cleanup(() => adminClient!.from('exam_permissions').delete().eq('exam_id', examId!))
        await cleanup(() => adminClient!.from('questions').delete().eq('exam_id', examId!))
        await cleanup(() => adminClient!.from('exams').delete().eq('id', examId!))
      }
      await cleanup(() => adminClient!.auth.admin.deleteUser(studentData.user.id))
      await cleanup(() => adminClient!.auth.admin.deleteUser(adminData.user.id))
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Offline exam test cleanup failed')
    }
  })
})

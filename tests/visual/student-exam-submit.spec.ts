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

test.describe('Student exam manual submission (local Supabase)', () => {
  test.skip(!hasLocalSupabaseCredentials, 'Local Supabase credentials are required for this test.')

  test('saves an answer, submits through the UI, and records the submitted attempt', async ({ page, context }) => {
    test.setTimeout(120_000)

    const password = 'Testo-submit-exam-password-123!'
    const adminEmail = `admin-submit-vrt-${crypto.randomUUID()}@testo.local`
    const studentEmail = `student-submit-vrt-${crypto.randomUUID()}@testo.local`
    const { data: adminData, error: adminCreateError } = await adminClient!.auth.admin.createUser({
      email: adminEmail, password, email_confirm: true,
    })
    if (adminCreateError || !adminData.user) throw adminCreateError ?? new Error('Could not create submission test admin')

    const { data: studentData, error: studentCreateError } = await adminClient!.auth.admin.createUser({
      email: studentEmail, password, email_confirm: true,
    })
    if (studentCreateError || !studentData.user) {
      await adminClient!.auth.admin.deleteUser(adminData.user.id)
      throw studentCreateError ?? new Error('Could not create submission test student')
    }

    let examId: string | undefined
    let attemptId: string | undefined

    try {
      await updateVisualProfile(adminClient!, adminData.user.id, { role: 'admin' })
      await updateVisualProfile(adminClient!, studentData.user.id, { preferred_language: 'en', preferred_theme: 'light' })

      const { data: exam, error: examError } = await adminClient!.from('exams').insert({
        title: 'Manual submission exam',
        start_time: new Date(Date.now() - 30_000).toISOString(),
        duration_minutes: 30,
        admin_id: adminData.user.id,
        is_published: true,
      }).select('id').single()
      if (examError || !exam) throw examError ?? new Error('Could not create submission test exam')
      examId = exam.id

      const { data: question, error: questionError } = await adminClient!.from('questions').insert({
        exam_id: examId,
        type: 'mcq',
        text: 'Select the answer before submitting.',
        points: 2,
        order: 1,
        mcq_choices: [{ id: 'a', text: 'First answer' }, { id: 'b', text: 'Second answer' }],
        correct_choice: 'b',
      }).select('id').single()
      if (questionError || !question) throw questionError ?? new Error('Could not create submission test question')

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

      await page.goto(`/student/exam/${attemptId}`)
      await expect(page.getByText('Select the answer before submitting.')).toBeVisible({ timeout: 30_000 })
      await page.getByRole('radio', { name: /First answer/ }).check()
      await expect(page.locator('[role="status"]').getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })

      await page.getByRole('button', { name: 'Submit exam', exact: true }).click()
      const confirmation = page.getByRole('alertdialog')
      await expect(confirmation.getByText('Submit your exam?')).toBeVisible()
      await confirmation.getByRole('button', { name: 'Submit now', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Exam submitted', exact: true })).toBeVisible({ timeout: 15_000 })

      const { data: submittedAttempt, error: submittedAttemptError } = await adminClient!.from('exam_attempts')
        .select('status, finished_at')
        .eq('id', attemptId)
        .single()
      if (submittedAttemptError) throw submittedAttemptError
      expect(submittedAttempt.status).toBe('submitted')
      expect(submittedAttempt.finished_at).toBeTruthy()

      const { data: savedAnswer, error: savedAnswerError } = await adminClient!.from('answers')
        .select('question_id, mcq_answer')
        .eq('attempt_id', attemptId)
        .single()
      if (savedAnswerError) throw savedAnswerError
      expect(savedAnswer).toEqual({ question_id: question.id, mcq_answer: 'a' })
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
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Submission test cleanup failed')
    }
  })
})

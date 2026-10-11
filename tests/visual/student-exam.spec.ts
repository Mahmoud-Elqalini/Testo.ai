import { loadEnvConfig } from '@next/env'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { visualAppOrigin } from './helpers/sign-in'

loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasCredentials = Boolean(supabaseUrl && serviceRoleKey)
const adminClient = hasCredentials ? createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } }) : null
const locales = ['en', 'ar'] as const
const themes = ['light', 'dark'] as const

test.describe('Student exam-taking visual regression', () => {
  test.skip(!hasCredentials, 'Local Supabase service-role credentials are required for this visual test.')
  test.skip(({ browserName }) => browserName !== 'chromium', 'Student exam snapshots are maintained in Chromium.')

  for (const locale of locales) for (const theme of themes) {
    test(`exam attempt - ${locale} - ${theme}`, async ({ page, context }) => {
      test.setTimeout(120_000)
      const password = 'Testo-student-exam-visual-password-123!'
      const adminEmail = `admin-student-exam-vrt-${crypto.randomUUID()}@testo.local`
      const email = `student-exam-vrt-${crypto.randomUUID()}@testo.local`
      const { data: adminData, error: adminError } = await adminClient!.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })
      if (adminError || !adminData.user) throw adminError ?? new Error('Could not create visual test admin')
      const { data, error } = await adminClient!.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) {
        await adminClient!.auth.admin.deleteUser(adminData.user.id)
        throw error ?? new Error('Could not create visual test student')
      }
      let attemptId: string | undefined
      let examId: string | undefined
      try {
        await adminClient!.from('profiles').update({ role: 'admin' }).eq('id', adminData.user.id)
        await adminClient!.from('profiles').update({ preferred_language: locale, preferred_theme: theme }).eq('id', data.user.id)
        const exam = await adminClient!.from('exams').insert({ title: 'Visual exam attempt', start_time: new Date(Date.now() - 30_000).toISOString(), duration_minutes: 30, admin_id: adminData.user.id, is_published: true }).select('id').single()
        if (exam.error || !exam.data) throw exam.error ?? new Error('Could not create visual test exam')
        examId = exam.data.id
        const question = await adminClient!.from('questions').insert({ exam_id: examId, type: 'mcq', text: 'Which option matches the sample?', points: 2, order: 1, mcq_choices: [{ id: 'a', text: 'First answer' }, { id: 'b', text: 'Second answer' }], correct_choice: 'b' }).select('id').single()
        if (question.error) throw question.error
        const attempt = await adminClient!.from('exam_attempts').insert({ exam_id: examId, student_id: data.user.id, access_token: crypto.randomUUID() }).select('id').single()
        if (attempt.error || !attempt.data) throw attempt.error ?? new Error('Could not create visual test attempt')
        attemptId = attempt.data.id

        const sessionId = crypto.randomUUID()
        const examEndsAt = new Date(Date.now() + 30 * 60_000).toISOString()
        await page.route('**/functions/v1/start-attempt', (route) => route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ attempt_id: attemptId, session_id: sessionId, was_takeover: false, remaining_seconds: 1800, exam_ends_at: examEndsAt }),
        }))
        await page.route('**/functions/v1/get-exam-questions**', (route) => route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            attempt_id: attemptId, remaining_seconds: 1800, answers: [],
            questions: [{ id: question.data!.id, type: 'mcq', text: 'Which option matches the sample?', points: 2, order: 1, mcq_choices: [{ id: 'a', text: 'First answer' }, { id: 'b', text: 'Second answer' }] }],
          }),
        }))
        await page.route('**/functions/v1/save-answer', (route) => route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify({ saved: true, question_id: question.data!.id, saved_at: new Date().toISOString() }),
        }))

        await context.addCookies([{ name: 'testo_language', value: locale, url: visualAppOrigin() }])
        await page.addInitScript(({ locale, theme }) => {
          window.localStorage.setItem('testo_language', locale)
          window.localStorage.setItem('testo_theme', theme)
        }, { locale, theme })

        const cookieJar = new Map<string, string>()
        const authClient = createServerClient(supabaseUrl!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
          cookies: {
            getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
            setAll: (cookies) => cookies.forEach(({ name, value, options }) => {
              if (options?.maxAge === 0) cookieJar.delete(name)
              else cookieJar.set(name, value)
            }),
          },
        })
        const { error: signInError } = await authClient.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        await context.addCookies([...cookieJar].map(([name, value]) => ({ name, value, url: visualAppOrigin() })))
        await page.goto(`/student/exam/${attemptId}`)
        await expect(page.getByText('Which option matches the sample?')).toBeVisible({ timeout: 30_000 })
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        await page.getByRole('radio', { name: /First answer/ }).check()
        await expect(page.getByRole('status').filter({ hasText: locale === 'ar' ? 'تم الحفظ' : 'Saved' })).toBeVisible({ timeout: 10_000 })
        await expect(page).toHaveScreenshot(`student-exam-${locale}-${theme}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.05 })
      } finally {
        const { error: deleteError } = await adminClient!.auth.admin.deleteUser(data.user.id)
        if (deleteError) throw deleteError
        if (examId) {
          const { error: questionCleanupError } = await adminClient!.from('questions').delete().eq('exam_id', examId)
          if (questionCleanupError) throw questionCleanupError
          const { error: examCleanupError } = await adminClient!.from('exams').delete().eq('id', examId)
          if (examCleanupError) throw examCleanupError
        }
        const { error: adminDeleteError } = await adminClient!.auth.admin.deleteUser(adminData.user.id)
        if (adminDeleteError) throw adminDeleteError
      }
    })
  }
})

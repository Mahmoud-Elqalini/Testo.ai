import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { signInBrowserContext, updateVisualProfile, visualAppOrigin } from './helpers/sign-in'

nextEnv.loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasLocalSupabaseCredentials = Boolean(supabaseUrl && serviceRoleKey)
const adminClient = hasLocalSupabaseCredentials
  ? createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const locales = ['en', 'ar'] as const
const themes = ['light', 'dark'] as const
const gradingStates = ['graded', 'pending'] as const

test.describe('Student results visual regression', () => {
  // Include slow Firefox/WebKit browser fixture startup and font rendering.
  test.describe.configure({ timeout: 180_000 })
  test.skip(!hasLocalSupabaseCredentials, 'Local Supabase service-role credentials are required for this visual test.')

  for (const locale of locales) {
    for (const theme of themes) {
      for (const gradingState of gradingStates) {
        test(`student result - ${gradingState} - ${locale} - ${theme}`, async ({ page, context }) => {
          page.setDefaultTimeout(30_000)
          page.setDefaultNavigationTimeout(90_000)
          const password = 'Testo-results-visual-password-123!'
          const email = `student-results-vrt-${crypto.randomUUID()}@testo.local`
          const isArabic = locale === 'ar'
          const choiceText = isArabic ? 'الخيار الأول' : 'First choice'
          const questionText = isArabic ? 'أي اختيار صحيح؟' : 'Which choice is correct?'
          const examTitle = isArabic
            ? `نتيجة مرئية ${gradingState === 'graded' ? 'مصححة' : 'قيد التصحيح'}`
            : `Results visual ${gradingState}`
          const { data: userData, error: userError } = await adminClient!.auth.admin.createUser({ email, password, email_confirm: true })
          if (userError || !userData.user) throw userError ?? new Error('Could not create visual test student')
          let examId: string | undefined

          try {
            await updateVisualProfile(adminClient!, userData.user.id, { preferred_language: locale, preferred_theme: theme })
            const { data: exam, error: examError } = await adminClient!.from('exams').insert({
              title: examTitle,
              start_time: new Date(Date.now() - 60_000).toISOString(),
              duration_minutes: 30,
              admin_id: userData.user.id,
              is_published: true,
            }).select('id').single()
            if (examError || !exam) throw examError ?? new Error('Could not create visual test exam')
            examId = exam.id

            const { data: question, error: questionError } = await adminClient!.from('questions').insert({
              exam_id: exam.id,
              type: 'mcq',
              text: questionText,
              points: 2,
              order: 1,
              mcq_choices: [{ id: 'a', text: choiceText, is_correct: true }, { id: 'b', text: isArabic ? 'الخيار الثاني' : 'Second choice' }],
              correct_choice: 'a',
            }).select('id').single()
            if (questionError || !question) throw questionError ?? new Error('Could not create visual test question')

            const { data: attempt, error: attemptError } = await adminClient!.from('exam_attempts').insert({
              exam_id: exam.id,
              student_id: userData.user.id,
              access_token: crypto.randomUUID(),
              status: 'submitted',
              finished_at: '2025-01-15T12:00:00.000Z',
            }).select('id').single()
            if (attemptError || !attempt) throw attemptError ?? new Error('Could not create visual test attempt')
            const { error: answerError } = await adminClient!.from('answers').insert({
              attempt_id: attempt.id,
              question_id: question.id,
              mcq_answer: 'a',
              score: gradingState === 'graded' ? 1 : null,
            })
            if (answerError) throw answerError

            await context.addCookies([{ name: 'testo_language', value: locale, url: visualAppOrigin() }])
            await page.addInitScript(({ selectedLocale, selectedTheme }) => {
              window.localStorage.setItem('testo_language', selectedLocale)
              window.localStorage.setItem('testo_theme', selectedTheme)
            }, { selectedLocale: locale, selectedTheme: theme })
            await signInBrowserContext(context, email, password)
            // Do not wait for every resource before beginning UI assertions;
            // the page checks below wait for the result content to be ready.
            await page.goto(`/student/results/${attempt.id}`, { waitUntil: 'commit' })
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
            await expect(page.locator('html')).toHaveAttribute('lang', locale)
            await expect(page.getByText(examTitle)).toBeVisible({ timeout: 30_000 })

            if (gradingState === 'graded') {
              await expect(page.getByText(locale === 'en' ? 'Question breakdown' : 'تفصيل درجات الأسئلة'))
                .toBeVisible({ timeout: 30_000 })
              await expect(page.getByText(questionText)).toBeVisible()
              // The selected and correct-answer columns both show this choice.
              await expect(page.getByText(choiceText)).toHaveCount(2)
            } else {
              await expect(page.getByText(locale === 'en' ? 'Grading in progress' : 'التصحيح جارٍ'))
                .toBeVisible({ timeout: 30_000 })
              await expect(page.getByText(choiceText)).toHaveCount(0)
            }

            // Hide the Next.js development badge; it is tooling chrome, not page UI.
            await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => portal.remove()))
            await expect(page).toHaveScreenshot(`student-results-${gradingState}-${locale}-${theme}.png`, {
              fullPage: true,
              animations: 'disabled',
              maxDiffPixelRatio: 0.01,
              timeout: 30_000,
            })
          } finally {
            // Remove attempts before the exam: the question immutability trigger
            // rejects deleting questions while a non-pending attempt exists.
            let cleanupError: Error | undefined
            if (examId) {
              const { error: attemptDeleteError } = await adminClient!.from('exam_attempts').delete().eq('exam_id', examId)
              if (attemptDeleteError) cleanupError = attemptDeleteError
              const { error: examDeleteError } = await adminClient!.from('exams').delete().eq('id', examId)
              if (examDeleteError) cleanupError ??= examDeleteError
            }
            // exams.admin_id references the visual user's profile.
            const { error: deleteError } = await adminClient!.auth.admin.deleteUser(userData.user.id)
            if (deleteError) cleanupError ??= deleteError
            if (cleanupError) throw cleanupError
          }
        })
      }
    }
  }
})

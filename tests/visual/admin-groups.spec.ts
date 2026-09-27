import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasLocalSupabaseCredentials = Boolean(supabaseUrl && serviceRoleKey)
const adminClient = hasLocalSupabaseCredentials
  ? createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const locales = ['en', 'ar'] as const
const themes = ['light', 'dark'] as const

test.describe('Admin groups and access visual regression', () => {
  test.skip(!hasLocalSupabaseCredentials, 'Local Supabase service-role credentials are required for this visual test.')

  for (const locale of locales) {
    for (const theme of themes) {
      test(`groups and members - ${locale} - ${theme}`, async ({ page, context }) => {
        const password = 'Testo-groups-visual-password-123!'
        const adminEmail = `admin-groups-vrt-${crypto.randomUUID()}@testo.local`
        const studentEmail = `student-groups-vrt-${crypto.randomUUID()}@testo.local`
        const { data: adminData, error: adminError } = await adminClient!.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })
        if (adminError || !adminData.user) throw adminError ?? new Error('Could not create visual test admin')
        const { data: studentData, error: studentError } = await adminClient!.auth.admin.createUser({ email: studentEmail, password, email_confirm: true })
        if (studentError || !studentData.user) throw studentError ?? new Error('Could not create visual test student')

        try {
          await adminClient!.from('profiles').update({ role: 'admin', preferred_language: locale, preferred_theme: theme }).eq('id', adminData.user.id)
          await adminClient!.from('profiles').update({ full_name: 'Visual Student' }).eq('id', studentData.user.id)
          const { data: group, error: groupError } = await adminClient!.from('groups').insert({ name: 'Visual cohort', admin_id: adminData.user.id }).select('id').single()
          if (groupError || !group) throw groupError ?? new Error('Could not create visual test group')
          const { data: exam, error: examError } = await adminClient!.from('exams').insert({ title: 'Visual access exam', start_time: new Date(Date.now() + 86_400_000).toISOString(), duration_minutes: 30, admin_id: adminData.user.id }).select('id').single()
          if (examError || !exam) throw examError ?? new Error('Could not create visual test exam')
          const { error: memberError } = await adminClient!.from('group_students').insert({ group_id: group.id, student_id: studentData.user.id })
          if (memberError) throw memberError

          await context.addCookies([{ name: 'testo_language', value: locale, url: 'http://localhost:3000' }])
          await page.addInitScript(({ locale, theme }) => {
            window.localStorage.setItem('testo_language', locale)
            window.localStorage.setItem('testo_theme', theme)
          }, { locale, theme })
          await page.goto('/login')
          await page.locator('input[type="email"]').fill(adminEmail)
          await page.locator('input[type="password"]').fill(password)
          await page.locator('form button[type="submit"]').click()
          await expect(page).toHaveURL(/\/dashboard$/)

          await page.goto('/admin/groups')
          await expect(page.getByRole('heading', { name: locale === 'ar' ? 'مجموعات الطلاب' : 'Student groups' })).toBeVisible()
          await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
          await expect(page.locator('html')).toHaveAttribute('lang', locale)
          await expect(page).toHaveScreenshot(`admin-groups-${locale}-${theme}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.05 })

          await page.goto(`/admin/groups/${group.id}`)
          await expect(page.getByText(studentEmail, { exact: true }).first()).toBeVisible()
          await expect(page).toHaveScreenshot(`admin-group-detail-${locale}-${theme}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.05, mask: [page.getByText(studentEmail, { exact: true })] })

          await page.goto(`/admin/exams/${exam.id}/publish`)
          await expect(page.getByRole('heading', { name: locale === 'ar' ? 'صلاحيات دخول الامتحان' : 'Exam access' })).toBeVisible()
          await expect(page).toHaveScreenshot(`admin-exam-access-${locale}-${theme}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.05 })
        } finally {
          const { error: adminDeleteError } = await adminClient!.auth.admin.deleteUser(adminData.user.id)
          const { error: studentDeleteError } = await adminClient!.auth.admin.deleteUser(studentData.user.id)
          if (adminDeleteError) throw adminDeleteError
          if (studentDeleteError) throw studentDeleteError
        }
      })
    }
  }
})

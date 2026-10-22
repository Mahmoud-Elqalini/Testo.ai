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

test.describe('Group invitation visual regression', () => {
  test.skip(!hasLocalSupabaseCredentials, 'Local Supabase service-role credentials are required for this visual test.')

  for (const locale of locales) {
    for (const theme of themes) {
      test(`admin invitation and student join - ${locale} - ${theme}`, async ({ page, context }) => {
        test.setTimeout(120_000)
        page.setDefaultTimeout(30_000)
        const password = 'Testo-invitations-visual-password-123!'
        const adminEmail = `admin-invitations-vrt-${crypto.randomUUID()}@testo.local`
        const studentEmail = `student-invitations-vrt-${crypto.randomUUID()}@testo.local`
        const { data: adminData, error: adminError } = await adminClient!.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })
        if (adminError || !adminData.user) throw adminError ?? new Error('Could not create visual test admin')
        const { data: studentData, error: studentError } = await adminClient!.auth.admin.createUser({ email: studentEmail, password, email_confirm: true })
        if (studentError || !studentData.user) {
          await adminClient!.auth.admin.deleteUser(adminData.user.id)
          throw studentError ?? new Error('Could not create visual test student')
        }

        try {
          await updateVisualProfile(adminClient!, adminData.user.id, {
            role: 'admin', preferred_language: locale, preferred_theme: theme,
          })
          await updateVisualProfile(adminClient!, studentData.user.id, {
            preferred_language: locale,
            preferred_theme: theme,
          })
          const { data: group, error: groupError } = await adminClient!.from('groups')
            .insert({ name: 'Invitation visual cohort', admin_id: adminData.user.id }).select('id').single()
          if (groupError || !group) throw groupError ?? new Error('Could not create visual test group')

          await context.addCookies([{ name: 'testo_language', value: locale, url: visualAppOrigin() }])
          await page.addInitScript(({ locale, theme }) => {
            window.localStorage.setItem('testo_language', locale)
            window.localStorage.setItem('testo_theme', theme)
          }, { locale, theme })
          await page.addInitScript(() => {
            let clipboardText = ''
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true,
              value: {
                readText: async () => clipboardText,
                writeText: async (text: string) => { clipboardText = text },
              },
            })
          })

          await signInBrowserContext(context, adminEmail, password)
          await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
          await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
          const joinGroupLabel = locale === 'en' ? 'Join a group' : 'الانضمام إلى مجموعة'
          await expect(page.getByRole('link', { name: joinGroupLabel })).toHaveCount(0)

          await page.goto(`/admin/groups/${group.id}`, { waitUntil: 'domcontentloaded' })
          await expect(page.getByRole('heading', { name: locale === 'en' ? 'Group invitation' : 'دعوة المجموعة' })).toBeVisible()
          await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
          await expect(page.locator('html')).toHaveAttribute('lang', locale)
          await expect(page.getByRole('button', { name: locale === 'en' ? 'Create invitation code' : 'إنشاء رمز دعوة' })).toBeVisible()
          await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => portal.remove()))
          await expect(page).toHaveScreenshot(`admin-group-invitation-${locale}-${theme}.png`, {
            fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.05,
          })

          await page.getByRole('button', { name: locale === 'en' ? 'Create invitation code' : 'إنشاء رمز دعوة' }).click()
          const invitationCode = page.locator('code[dir="ltr"]')
          await expect(invitationCode).toBeVisible()
          const issuedCode = (await invitationCode.textContent())?.trim() ?? ''
          expect(issuedCode).toMatch(/^[a-f0-9]{32}$/)
          await page.getByRole('button', { name: locale === 'en' ? 'Copy code' : 'نسخ الرمز' }).click()
          await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(issuedCode)

          await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
          await page.getByRole('button', { name: locale === 'en' ? 'Sign Out' : 'تسجيل الخروج' }).click()
          await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 })
          await context.clearCookies()
          await signInBrowserContext(context, studentEmail, password)
          await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
          await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
          await expect(page.getByRole('link', { name: joinGroupLabel })).toBeVisible()

          await page.goto('/student/join-group')
          await expect(page.getByRole('heading', { name: locale === 'en' ? 'Join a group' : 'الانضمام إلى مجموعة' })).toBeVisible()
          await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => portal.remove()))
          await expect(page).toHaveScreenshot(`student-join-group-${locale}-${theme}.png`, {
            fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.05,
          })

          await page.getByLabel(locale === 'en' ? 'Invitation code' : 'رمز الدعوة').fill(issuedCode)
          await page.getByRole('button', { name: locale === 'en' ? 'Join group' : 'انضمام إلى المجموعة' }).click()
          await expect(page.getByRole('status')).toContainText(locale === 'en' ? 'You joined the group successfully.' : 'انضممت إلى المجموعة بنجاح.')
          const { data: membership, error: membershipError } = await adminClient!.from('group_students')
            .select('student_id').eq('group_id', group.id).eq('student_id', studentData.user.id)
          if (membershipError) throw membershipError
          expect(membership).toHaveLength(1)
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

import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasLocalSupabaseCredentials = Boolean(supabaseUrl && serviceRoleKey)
const adminClient = hasLocalSupabaseCredentials
  ? createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

const locales = ['en', 'ar'] as const
const themes = ['light', 'dark'] as const
const adminPassword = 'Testo-admin-visual-password-123!'

test.describe('Admin exam creation visual regression', () => {
  test.skip(!hasLocalSupabaseCredentials, 'Local Supabase service-role credentials are required for this visual test.')

  for (const locale of locales) {
    for (const theme of themes) {
      test(`create exam - ${locale} - ${theme}`, async ({ page, context }) => {
        const adminEmail = `admin-exam-vrt-${crypto.randomUUID()}@testo.local`
        const { data, error: createError } = await adminClient!.auth.admin.createUser({
          email: adminEmail,
          password: adminPassword,
          email_confirm: true,
        })
        if (createError || !data.user) throw createError ?? new Error('Could not create the visual test admin')
        const adminUserId = data.user.id

        try {
          const { error: profileError } = await adminClient!
            .from('profiles')
            .update({ role: 'admin', preferred_language: locale, preferred_theme: theme })
            .eq('id', adminUserId)
          if (profileError) throw profileError

        await context.addCookies([
          { name: 'testo_language', value: locale, url: 'http://localhost:3000' },
        ])
        await page.addInitScript(({ locale, theme }) => {
          window.localStorage.setItem('testo_language', locale)
          window.localStorage.setItem('testo_theme', theme)
        }, { locale, theme })

        await page.goto('/login')
        await page.locator('input[type="email"]').fill(adminEmail)
        await page.locator('input[type="password"]').fill(adminPassword)
        await page.locator('form button[type="submit"]').click()
        await expect(page).toHaveURL(/\/dashboard$/)

        await page.goto('/admin/exams/create')
        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
        if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
        else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
        await expect(page.locator('body')).toHaveCSS(
          'background-color',
          theme === 'dark' ? 'rgb(10, 10, 10)' : 'rgb(255, 255, 255)',
        )
        await expect(page.locator('body')).toHaveCSS(
          'color',
          theme === 'dark' ? 'rgb(237, 237, 237)' : 'rgb(23, 23, 23)',
        )

        await page.locator('#exam-title').fill('Visual regression exam')
        await page.locator('#exam-description').fill('Stable preview content')
        await page.locator('#exam-start-time').fill('2026-12-01T12:00')
        await page.locator('#exam-duration').fill('60')
        await expect(page).toHaveScreenshot(`admin-exam-create-${locale}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.05,
        })
        } finally {
          const { error: deleteError } = await adminClient!.auth.admin.deleteUser(adminUserId)
          if (deleteError) throw deleteError
        }
      })
    }
  }
})

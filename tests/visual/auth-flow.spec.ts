import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

nextEnv.loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

test.describe('Authentication flow', () => {
  test.skip(!adminClient, 'Local Supabase service-role credentials are required for this test.')

  test('signs in and opens the dashboard', async ({ page }) => {
    test.setTimeout(90_000)
    const email = `auth-flow-vrt-${crypto.randomUUID()}@testo.local`
    const password = 'Testo-auth-flow-visual-password-123!'
    const { data, error: createError } = await adminClient!.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !data.user) throw createError ?? new Error('Could not create the visual test user.')

    try {
      const browserErrors: string[] = []
      page.on('pageerror', (error) => browserErrors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text())
      })

      await page.goto('/login')
      const submitButton = page.locator('form button[type="submit"]')
      // The app keeps the server-rendered form inert until React hydration
      // completes, so this enabled state guarantees the submit handler is ready.
      await expect(submitButton).toBeEnabled()
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      let authResponse: Awaited<ReturnType<typeof page.waitForResponse>>
      try {
        [authResponse] = await Promise.all([
          page.waitForResponse(
            (response) => response.url().includes('/auth/v1/token') && response.request().method() === 'POST',
            { timeout: 20_000 },
          ),
          (async () => {
            await submitButton.click()
            await expect(submitButton).toBeDisabled({ timeout: 5_000 })
          })(),
        ])
      } catch (error) {
        const loginError = await page.locator('form p.text-red-500').textContent().catch(() => null)
        throw new Error(
          `Login did not complete the Supabase auth request. URL: ${page.url()}. Submit disabled: ${await submitButton.isDisabled().catch(() => false)}. UI error: ${loginError || '(empty)'}. Browser errors: ${browserErrors.join(' | ') || '(none)'}.`,
          { cause: error },
        )
      }
      const authBody = await authResponse.text()
      if (!authResponse.ok()) {
        throw new Error(`Supabase sign-in returned HTTP ${authResponse.status()}: ${authBody}`)
      }

      try {
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
      } catch (error) {
        const loginError = await page.getByRole('alert').textContent().catch(() => null)
        throw new Error(
          `Login did not reach the dashboard. URL: ${page.url()}. UI error: ${loginError || '(empty)'}. Browser errors: ${browserErrors.join(' | ') || '(none)'}.`,
          { cause: error },
        )
      }
    } finally {
      const { error: deleteError } = await adminClient!.auth.admin.deleteUser(data.user.id)
      if (deleteError) throw deleteError
    }
  })
})

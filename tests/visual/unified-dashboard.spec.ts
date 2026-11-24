import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { signInBrowserContext, updateVisualProfile, visualAppOrigin } from './helpers/sign-in'

nextEnv.loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const hasLocalSupabaseCredentials = Boolean(supabaseUrl && serviceRoleKey && anonKey)
const adminClient = hasLocalSupabaseCredentials
  ? createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : null
const locales = ['en', 'ar'] as const
const themes = ['light', 'dark'] as const

test.describe('Unified dashboard relationships', () => {
  test.skip(!hasLocalSupabaseCredentials, 'Local Supabase credentials are required for this visual test.')

  for (const locale of locales) {
    for (const theme of themes) {
      test(`shows owned and joined activity - ${locale} - ${theme}`, async ({ page, context }) => {
        test.setTimeout(150_000)
        page.setDefaultTimeout(30_000)
        page.on('pageerror', (error) => console.error('[unified-dashboard pageerror]', error))
        page.on('console', (message) => {
          if (message.type() === 'error') console.error('[unified-dashboard console]', message.text())
        })
        const password = 'Manjam-unified-dashboard-password-123!'
        const actorEmail = `unified-dashboard-vrt-${crypto.randomUUID()}@testo.local`
        const ownerEmail = `unified-dashboard-owner-vrt-${crypto.randomUUID()}@testo.local`
        const { data: actorData, error: actorError } = await adminClient!.auth.admin.createUser({
          email: actorEmail, password, email_confirm: true,
        })
        if (actorError || !actorData.user) throw actorError ?? new Error('Could not create dashboard actor')
        const { data: ownerData, error: ownerError } = await adminClient!.auth.admin.createUser({
          email: ownerEmail, password, email_confirm: true,
        })
        if (ownerError || !ownerData.user) {
          await adminClient!.auth.admin.deleteUser(actorData.user.id)
          throw ownerError ?? new Error('Could not create second group owner')
        }

        try {
          await updateVisualProfile(adminClient!, actorData.user.id, {
            full_name: 'Unified Account', preferred_language: locale, preferred_theme: theme,
          })
          await updateVisualProfile(adminClient!, ownerData.user.id, { full_name: 'Other Owner' })

          const ownGroupName = locale === 'en' ? 'My managed learning group' : 'مجموعتي التعليمية'
          const joinedGroupName = locale === 'en' ? 'Shared learning group' : 'مجموعة انضممت إليها'
          const ownExamTitle = locale === 'en' ? 'My draft exam' : 'امتحاني غير المنشور'
          const sharedExamTitle = locale === 'en' ? 'Shared published exam' : 'امتحان المجموعة المنشور'
        const dashboardClock = new Date('2026-11-20T10:25:00')

          const { data: ownGroup, error: ownGroupError } = await adminClient!.from('groups')
            .insert({ name: ownGroupName, owner_id: actorData.user.id }).select('id').single()
          if (ownGroupError || !ownGroup) throw ownGroupError ?? new Error('Could not create actor-owned group')
          const { data: joinedGroup, error: joinedGroupError } = await adminClient!.from('groups')
            .insert({ name: joinedGroupName, owner_id: ownerData.user.id }).select('id').single()
          if (joinedGroupError || !joinedGroup) throw joinedGroupError ?? new Error('Could not create shared group')

          const actorClient = createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
          const ownerClient = createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
          const [{ error: actorSignInError }, { error: ownerSignInError }] = await Promise.all([
            actorClient.auth.signInWithPassword({ email: actorEmail, password }),
            ownerClient.auth.signInWithPassword({ email: ownerEmail, password }),
          ])
          if (actorSignInError) throw actorSignInError
          if (ownerSignInError) throw ownerSignInError

          const { data: invitation, error: invitationError } = await ownerClient.rpc('create_group_invitation', {
            target_group_id: joinedGroup.id,
          })
          if (invitationError) throw invitationError
          const invitationCode = (invitation as { code?: string } | null)?.code
          if (!invitationCode) throw new Error('Invitation code was not returned')
          const { data: redemption, error: redemptionError } = await actorClient.rpc('redeem_group_invitation', {
            invitation_code: invitationCode,
          })
          if (redemptionError) throw redemptionError
          expect(redemption).toEqual({ success: true })

          const startsAt = new Date(dashboardClock.getTime() + 86_400_000).toISOString()
          const { error: ownExamError } = await adminClient!.from('exams').insert({
            title: ownExamTitle,
            start_time: startsAt,
            duration_minutes: 30,
            owner_id: actorData.user.id,
            is_published: false,
          })
          if (ownExamError) throw ownExamError
          const { data: sharedExam, error: sharedExamError } = await adminClient!.from('exams').insert({
            title: sharedExamTitle,
            start_time: startsAt,
            duration_minutes: 30,
            owner_id: ownerData.user.id,
            is_published: true,
          }).select('id').single()
          if (sharedExamError || !sharedExam) throw sharedExamError ?? new Error('Could not create shared exam')
          const { error: permissionError } = await adminClient!.from('exam_permissions').insert({
            exam_id: sharedExam.id,
            group_id: joinedGroup.id,
          })
          if (permissionError) throw permissionError

          await context.addCookies([
            { name: 'testo_language', value: locale, url: visualAppOrigin() },
            { name: 'testo_theme', value: theme, url: visualAppOrigin() },
          ])
          await page.addInitScript(({ locale, theme }) => {
            window.localStorage.setItem('testo_language', locale)
            window.localStorage.setItem('testo_theme', theme)
          }, { locale, theme })
          await signInBrowserContext(context, actorEmail, password)
          await page.clock.setFixedTime(dashboardClock)
          await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
          await expect(page).toHaveURL(/\/dashboard$/)
          await expect(page.locator('html')).toHaveAttribute('lang', locale)
          await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
          await expect(page.getByRole('heading', { name: locale === 'en' ? 'Groups I manage' : 'مجموعات أديرها' })).toBeVisible({ timeout: 30_000 })
          await expect(page.getByRole('heading', { name: locale === 'en' ? 'Groups I joined' : 'مجموعات انضممت إليها' })).toBeVisible({ timeout: 30_000 })
          await expect(page.getByText(locale === 'en' ? 'Course items will appear once 008-courses is available.' : 'ستظهر المقررات عند توفر الميزة 008-courses.')).toBeVisible()
          await expect(page.getByText(ownGroupName, { exact: true })).toBeVisible()
          await expect(page.getByText(joinedGroupName, { exact: true })).toBeVisible()
          await expect(page.getByText(ownExamTitle, { exact: true })).toBeVisible()
          await expect(page.getByText(sharedExamTitle, { exact: true })).toBeVisible()
          await expect(page.getByRole('link', { name: locale === 'en' ? 'Create a group' : 'إنشاء مجموعة' })).toHaveAttribute('href', '/admin/groups')
          await expect(page.getByRole('link', { name: locale === 'en' ? 'Create an exam' : 'إنشاء امتحان' })).toHaveAttribute('href', '/admin/exams/create')
          await expect(page.getByRole('link', { name: locale === 'en' ? 'Join a group' : 'الانضمام إلى مجموعة' })).toHaveAttribute('href', '/student/join-group')
          await expect(page.locator('a.testo-dashboard-group-row').filter({ hasText: ownGroupName })).toHaveAttribute('href', `/admin/groups/${ownGroup.id}`)
          await expect(page.getByText(locale === 'en' ? 'Instructor account' : 'حساب مدرّس')).toHaveCount(0)
          await expect(page.getByText(locale === 'en' ? 'Student account' : 'حساب طالب')).toHaveCount(0)
          await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => portal.remove()))
          await expect(page).toHaveScreenshot(`unified-dashboard-${locale}-${theme}.png`, {
            fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.05, timeout: 20_000,
          })

          await page.setViewportSize({ width: 320, height: 780 })
          await expect(page.getByRole('heading', { name: locale === 'en' ? 'Groups I manage' : 'مجموعات أديرها' })).toBeVisible({ timeout: 30_000 })
          const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
          expect(noHorizontalOverflow).toBe(true)
          await expect(page.getByText(ownGroupName, { exact: true })).toBeVisible()
          await expect(page.getByText(joinedGroupName, { exact: true })).toBeVisible()
          await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => portal.remove()))
          await expect(page).toHaveScreenshot(`unified-dashboard-${locale}-${theme}-mobile.png`, {
            fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.05, timeout: 20_000,
          })

          const legacyPage = await context.newPage()
          await legacyPage.goto('/admin', { waitUntil: 'domcontentloaded' })
          await expect(legacyPage).toHaveURL(/\/dashboard$/)
          await legacyPage.goto('/student', { waitUntil: 'domcontentloaded' })
          await expect(legacyPage).toHaveURL(/\/dashboard$/)
        } finally {
          const { error: actorDeleteError } = await adminClient!.auth.admin.deleteUser(actorData.user.id)
          const { error: ownerDeleteError } = await adminClient!.auth.admin.deleteUser(ownerData.user.id)
          if (actorDeleteError) throw actorDeleteError
          if (ownerDeleteError) throw ownerDeleteError
        }
      })
    }
  }

  for (const locale of locales) {
    test(`shows empty and partial-error states - ${locale}`, async ({ page, context }) => {
      test.setTimeout(120_000)
      const password = 'Manjam-empty-dashboard-password-123!'
      const email = `empty-dashboard-vrt-${crypto.randomUUID()}@testo.local`
      const { data, error } = await adminClient!.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) throw error ?? new Error('Could not create empty dashboard user')

      try {
        await updateVisualProfile(adminClient!, data.user.id, { full_name: 'Empty Account', preferred_language: locale, preferred_theme: 'light' })
        await context.addCookies([
          { name: 'testo_language', value: locale, url: visualAppOrigin() },
          { name: 'testo_theme', value: 'light', url: visualAppOrigin() },
        ])
        await page.addInitScript(({ locale }) => window.localStorage.setItem('testo_language', locale), { locale })
        await signInBrowserContext(context, email, password)
        await page.route(/\/rest\/v1\/groups(?:\?|$)/, (route) => route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'TEST_ERROR', message: 'Simulated groups query failure' }),
        }))
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

        await expect(page.getByText(locale === 'en' ? 'This section could not be loaded. Try again later.' : 'تعذر تحميل هذا القسم. حاول مرة أخرى لاحقًا.')).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(locale === 'en' ? 'You haven’t joined any groups yet.' : 'لم تنضم إلى أي مجموعة بعد.')).toBeVisible()
        await expect(page.getByText(locale === 'en' ? 'No upcoming exams right now.' : 'لا توجد امتحانات قادمة حاليًا.')).toBeVisible()
        await expect(page.getByText(locale === 'en' ? 'Course items will appear once 008-courses is available.' : 'ستظهر المقررات عند توفر الميزة 008-courses.')).toBeVisible()
      } finally {
        const { error: deleteError } = await adminClient!.auth.admin.deleteUser(data.user.id)
        if (deleteError) throw deleteError
      }
    })
  }
})

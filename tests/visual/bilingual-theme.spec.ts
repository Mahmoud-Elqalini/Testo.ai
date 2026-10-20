import { expect, test } from '@playwright/test'
import { visualAppOrigin } from './helpers/sign-in'

const publicPages = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'reset-password', path: '/reset-password' },
] as const
const locales = ['en', 'ar'] as const
const themes = ['light', 'dark'] as const

test.describe('Global bilingual and theme controls', () => {
  for (const pageInfo of publicPages) {
    for (const locale of locales) {
      for (const theme of themes) {
        test(`${pageInfo.name} renders in ${locale} and ${theme}`, async ({ page, context }) => {
          await context.addCookies([
            { name: 'testo_language', value: locale, url: visualAppOrigin() },
            { name: 'testo_theme', value: theme, url: visualAppOrigin() },
          ])
          await page.addInitScript(({ selectedLocale, selectedTheme }) => {
            localStorage.setItem('testo_language', selectedLocale)
            localStorage.setItem('testo_theme', selectedTheme)
          }, { selectedLocale: locale, selectedTheme: theme })

          await page.goto(pageInfo.path)
          if (pageInfo.name === 'home') {
            await expect(page.getByRole('heading', { name: locale === 'en' ? 'Exams, organized and ready' : 'امتحاناتك، منظمة وجاهزة' })).toBeVisible()
          }
          await expect(page.locator('html')).toHaveAttribute('lang', locale)
          await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
          if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
          else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

          const languageSelect = page.locator('#preference-language')
          const themeSelect = page.locator('#preference-theme')
          await expect(languageSelect).toHaveValue(locale)
          await expect(themeSelect).toHaveValue(theme)

          await languageSelect.selectOption(locale === 'en' ? 'ar' : 'en')
          const nextLocale = locale === 'en' ? 'ar' : 'en'
          await expect(page.locator('html')).toHaveAttribute('lang', nextLocale)
          await expect(page.locator('html')).toHaveAttribute('dir', nextLocale === 'ar' ? 'rtl' : 'ltr')
          await themeSelect.selectOption(theme === 'light' ? 'dark' : 'light')
          if (theme === 'light') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
          else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

          // Each public screen is snapshotted in all four supported combinations.
          await languageSelect.selectOption(locale)
          await themeSelect.selectOption(theme)
          await expect(page.locator('html')).toHaveAttribute('lang', locale)
          if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
          else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
          await expect(page).toHaveScreenshot(`${pageInfo.name}-${locale}-${theme}.png`, {
            fullPage: true,
            animations: 'disabled',
            maxDiffPixelRatio: 0.02,
          })
        })
      }
    }
  }
})

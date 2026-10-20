import { test, expect } from '@playwright/test'
import { visualAppOrigin } from './helpers/sign-in'

const pages = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'reset-password', path: '/reset-password' },
]

const locales = ['en', 'ar']
const themes = ['light', 'dark']

test.describe('Auth Pages VRT', () => {
  for (const pageInfo of pages) {
    for (const locale of locales) {
      for (const theme of themes) {
        test(`${pageInfo.name} page - ${locale} - ${theme}`, async ({ page, context }) => {
          page.setDefaultTimeout(30_000)
          // The layout reads the language from the request cookie during SSR.
          // Set it before navigation so the initial HTML, direction, and hydrated
          // client state all use the locale under test.
          await context.addCookies([
            {
              name: 'testo_language',
              value: locale,
              url: visualAppOrigin(),
            },
            {
              name: 'testo_theme',
              value: theme,
              url: visualAppOrigin(),
            },
          ]);

          // Keep browser-persisted client preferences aligned with the SSR value.
          await page.addInitScript(
            ({ locale, theme }) => {
              window.localStorage.setItem('testo_language', locale);
              window.localStorage.setItem('testo_theme', theme);
            },
            { locale, theme },
          );
          
          await page.goto(pageInfo.path, { waitUntil: 'domcontentloaded' })

          await expect(page.locator('html')).toHaveAttribute('lang', locale)
          await expect(page.locator('html')).toHaveAttribute(
            'dir',
            locale === 'ar' ? 'rtl' : 'ltr',
          )
          if (theme === 'dark') {
            await expect(page.locator('html')).toHaveClass(/\bdark\b/)
          } else {
            await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
          }
           
          await expect(page.locator('form')).toBeVisible()
          if (pageInfo.path === '/login') {
            await expect(page.locator('form button[type="submit"]')).toBeEnabled({ timeout: 30_000 })
          }
          
          await expect(page).toHaveScreenshot(`${pageInfo.name}-${locale}-${theme}.png`, {
            fullPage: true,
            maxDiffPixelRatio: 0.05,
          })
        })
      }
    }
  }
})

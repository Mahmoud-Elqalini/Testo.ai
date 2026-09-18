import { test, expect } from '@playwright/test'

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
          // The layout reads the language from the request cookie during SSR.
          // Set it before navigation so the initial HTML, direction, and hydrated
          // client state all use the locale under test.
          await context.addCookies([
            {
              name: 'testo_language',
              value: locale,
              url: 'http://localhost:3000',
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
          
          await page.goto(`http://localhost:3000${pageInfo.path}`)

          await expect(page.locator('html')).toHaveAttribute('lang', locale)
          await expect(page.locator('html')).toHaveAttribute(
            'dir',
            locale === 'ar' ? 'rtl' : 'ltr',
          )
          
          // Wait for hydration and basic UI to render
          await page.waitForSelector('form')
          
          // Wait for any animations to finish
          await page.waitForTimeout(500)
          
          await expect(page).toHaveScreenshot(`${pageInfo.name}-${locale}-${theme}.png`, {
            fullPage: true,
            maxDiffPixelRatio: 0.05,
          })
        })
      }
    }
  }
})

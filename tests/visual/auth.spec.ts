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
        test(`${pageInfo.name} page - ${locale} - ${theme}`, async ({ page }) => {
          // Set local storage for i18n and theme before navigating
          await page.addInitScript(`
            window.localStorage.setItem('testo_language', '${locale}');
            window.localStorage.setItem('testo_theme', '${theme}');
          `);
          
          await page.goto(`http://localhost:3000${pageInfo.path}`)
          
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

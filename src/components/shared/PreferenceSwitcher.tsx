'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTheme } from '@/lib/theme/provider'

export function PreferenceSwitcher() {
  const { language, setLanguage, t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [error, setError] = useState(false)

  async function changeLanguage(value: string) {
    if (value !== 'en' && value !== 'ar') return
    setError(false)
    try {
      await setLanguage(value)
    } catch {
      setError(true)
    }
  }

  async function changeTheme(value: string) {
    if (value !== 'light' && value !== 'dark') return
    setError(false)
    try {
      await setTheme(value)
    } catch {
      setError(true)
    }
  }

  return (
    <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <nav aria-label={t('preferences.controls')} className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-end gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <label className="flex items-center gap-2 text-sm">
          <span>{t('preferences.language')}</span>
          <select
            id="preference-language"
            aria-label={t('preferences.language')}
            className="h-9 rounded-md border border-neutral-300 bg-transparent px-2 dark:border-neutral-700"
            value={language}
            onChange={(event) => void changeLanguage(event.target.value)}
          >
            <option value="ar">{t('preferences.arabic')}</option>
            <option value="en">{t('preferences.english')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>{t('preferences.theme')}</span>
          <select
            id="preference-theme"
            aria-label={t('preferences.theme')}
            className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            value={theme}
            onChange={(event) => void changeTheme(event.target.value)}
          >
            <option value="light">{t('preferences.light')}</option>
            <option value="dark">{t('preferences.dark')}</option>
          </select>
        </label>
        {error && <span role="alert" className="w-full text-end text-sm text-red-700 dark:text-red-300">{t('preferences.saveError')}</span>}
      </nav>
    </header>
  )
}

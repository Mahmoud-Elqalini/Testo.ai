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
    <header className="testo-preference-bar">
      <nav aria-label={t('preferences.controls')} className="testo-preference-controls">
        <label className="testo-preference-field">
          <span>{t('preferences.language')}</span>
          <select
            id="preference-language"
            aria-label={t('preferences.language')}
            className="testo-preference-select"
            value={language}
            onChange={(event) => void changeLanguage(event.target.value)}
          >
            <option value="ar">{t('preferences.arabic')}</option>
            <option value="en">{t('preferences.english')}</option>
          </select>
        </label>
        <label className="testo-preference-field">
          <span>{t('preferences.theme')}</span>
          <select
            id="preference-theme"
            aria-label={t('preferences.theme')}
            className="testo-preference-select"
            value={theme}
            onChange={(event) => void changeTheme(event.target.value)}
          >
            <option value="light">{t('preferences.light')}</option>
            <option value="dark">{t('preferences.dark')}</option>
          </select>
        </label>
        {error && <span role="alert" className="testo-preference-error">{t('preferences.saveError')}</span>}
      </nav>
    </header>
  )
}

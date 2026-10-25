'use client'

import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTheme } from '@/lib/theme/provider'

export function PreferenceControls() {
  const { language, setLanguage, t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [error, setError] = useState(false)

  async function changeLanguage() {
    setError(false)
    try {
      await setLanguage(language === 'en' ? 'ar' : 'en')
    } catch {
      setError(true)
    }
  }

  async function changeTheme() {
    setError(false)
    try {
      await setTheme(theme === 'light' ? 'dark' : 'light')
    } catch {
      setError(true)
    }
  }

  return (
    <nav aria-label={t('preferences.controls')} className="testo-preference-controls">
      <button type="button" className="testo-preference-language" onClick={() => void changeLanguage()} aria-label={t('preferences.switchLanguage')}>
        {language === 'en' ? 'AR' : 'EN'}
      </button>
      <button type="button" className="testo-preference-theme" onClick={() => void changeTheme()} aria-label={t('preferences.toggleTheme')} aria-pressed={theme === 'dark'}>
        {theme === 'light' ? <Moon size={20} strokeWidth={2} aria-hidden="true" /> : <Sun size={20} strokeWidth={2} aria-hidden="true" />}
      </button>
      {error && <span role="alert" className="testo-preference-error">{t('preferences.saveError')}</span>}
    </nav>
  )
}

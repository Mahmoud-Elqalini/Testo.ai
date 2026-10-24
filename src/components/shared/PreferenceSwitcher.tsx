'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTheme } from '@/lib/theme/provider'

export function PreferenceSwitcher() {
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
    <header className="testo-preference-bar">
      <div className="testo-preference-brand">
        <span className="testo-preference-brand-mark" aria-hidden="true"><img src="/testo-mark.png" alt="" /></span>
        <strong>Testo</strong>
      </div>
      <nav aria-label={t('preferences.controls')} className="testo-preference-controls">
        <button type="button" className="testo-preference-language" onClick={() => void changeLanguage()} aria-label={t('preferences.language')}>
          {language === 'en' ? 'AR' : 'EN'}
        </button>
        <button type="button" className="testo-preference-theme" onClick={() => void changeTheme()} aria-label={t('preferences.theme')} aria-pressed={theme === 'dark'}>
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.6 8.6 0 1 0 20.2 15.2Z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
          )}
        </button>
        {error && <span role="alert" className="testo-preference-error">{t('preferences.saveError')}</span>}
      </nav>
    </header>
  )
}

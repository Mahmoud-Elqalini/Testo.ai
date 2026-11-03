'use client'

import { useState } from 'react'
import { Languages, Moon, Sun } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTheme } from '@/lib/theme/provider'

type PreferenceControlsProps = { variant?: 'default' | 'compact-switch' }

export function PreferenceControls({ variant = 'default' }: PreferenceControlsProps) {
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
    <nav aria-label={t('preferences.controls')} className={`testo-preference-controls${variant === 'compact-switch' ? ' manjam-preferences' : ''}`}>
      <button
        type="button"
        className="testo-preference-language"
        onClick={() => void changeLanguage()}
        aria-label={t('preferences.switchLanguage')}
        aria-checked={variant === 'compact-switch' ? language === 'en' : undefined}
        role={variant === 'compact-switch' ? 'switch' : undefined}
      >
        {variant === 'compact-switch' ? <><Languages className="manjam-switch-symbol" size={14} aria-hidden="true" /><span className="manjam-switch-label">{t(language === 'en' ? 'publicHome.languageLabelArabic' : 'publicHome.languageLabelEnglish')}</span><span className="manjam-switch-track" aria-hidden="true"><i className="manjam-switch-knob" /></span></> : language === 'en' ? 'AR' : 'EN'}
      </button>
      <button
        type="button"
        className="testo-preference-theme"
        onClick={() => void changeTheme()}
        aria-label={variant === 'compact-switch' ? t('preferences.dark') : t('preferences.toggleTheme')}
        aria-pressed={variant === 'default' ? theme === 'dark' : undefined}
        aria-checked={variant === 'compact-switch' ? theme === 'dark' : undefined}
        role={variant === 'compact-switch' ? 'switch' : undefined}
      >
        {variant === 'compact-switch' ? <><span className="manjam-switch-symbol" aria-hidden="true">{theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}</span><span className="manjam-switch-label">{t(theme === 'light' ? 'preferences.light' : 'preferences.dark')}</span><span className="manjam-switch-track" aria-hidden="true"><i className="manjam-switch-knob" /></span></> : theme === 'light' ? <Moon size={20} strokeWidth={2} aria-hidden="true" /> : <Sun size={20} strokeWidth={2} aria-hidden="true" />}
      </button>
      {error && <span role="alert" className="testo-preference-error">{t('preferences.saveError')}</span>}
    </nav>
  )
}

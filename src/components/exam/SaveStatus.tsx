'use client'

import { useTranslation } from '@/lib/i18n/use-translation'

export type AnswerSaveState = 'idle' | 'saving' | 'saved' | 'unsynced' | 'stale'

export default function SaveStatus({ state }: { state: AnswerSaveState }) {
  const { t } = useTranslation()
  if (state === 'idle') return null
  const text = state === 'saving' ? t('student.exam.saving') : state === 'saved' ? t('student.exam.saved') : state === 'stale' ? t('student.exam.sessionExpired') : t('student.exam.unsynced')
  return <span role="status" aria-live="polite" className={`text-sm ${state === 'unsynced' || state === 'stale' ? 'text-warning-text dark:text-warning-text' : 'text-muted dark:text-muted'}`}>{text}</span>
}

'use client'

import { useTranslation } from '@/lib/i18n/use-translation'

export default function EssayQuestion({ value, onChange, onBlur, disabled, questionId }: {
  value: string
  onChange: (value: string) => void
  onBlur: (value: string) => void
  disabled: boolean
  questionId: string
}) {
  const { t } = useTranslation()
  const id = `essay-${questionId}`
  return <div className="space-y-2">
    <label htmlFor={id} className="sr-only">{t('student.exam.essayLabel')}</label>
    <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} onBlur={(event) => onBlur(event.currentTarget.value)} disabled={disabled} rows={7} maxLength={20000} className="w-full resize-y rounded-md border border-neutral-300 bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700" />
    <p className="text-end text-xs text-neutral-500">{value.length}/20000</p>
  </div>
}

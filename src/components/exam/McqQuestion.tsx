'use client'

import type { ExamQuestion } from '@/lib/types'

export default function McqQuestion({ question, value, onChange, disabled, labels }: {
  question: ExamQuestion
  value: string | null
  onChange: (value: string | null) => void
  disabled: boolean
  labels: { choices: string; clear: string }
}) {
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="sr-only">{labels.choices}</legend>
    {(question.mcq_choices ?? []).map((choice, index) => {
      const id = `${question.id}-${choice.id}`
      return <label key={choice.id} htmlFor={id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${value === choice.id ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] dark:bg-surface-soft' : 'border-border dark:border-border'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
        <input id={id} type="radio" name={question.id} value={choice.id} checked={value === choice.id} onChange={() => onChange(choice.id)} className="mt-1 accent-[var(--color-primary)]" />
        <span className="min-w-0 break-words"><span className="me-2 font-semibold">{String.fromCharCode(65 + index)}.</span>{choice.text}</span>
      </label>
    })}
    {value !== null && !disabled && <button type="button" className="text-sm text-muted underline hover:text-text dark:text-muted dark:hover:text-white" onClick={() => onChange(null)}>{labels.clear}</button>}
  </fieldset>
}

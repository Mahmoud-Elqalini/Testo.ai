'use client'

import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { McqChoice, ReferenceAnswer } from '@/lib/types'

export type EditableChoice = McqChoice & { isCorrect: boolean }

interface QuestionFormProps {
  contentLocked: boolean
  editingId: string | null
  questionType: 'mcq' | 'essay'
  questionText: string
  points: string
  choices: EditableChoice[]
  references: ReferenceAnswer[]
  saving: boolean
  error: string | null
  notice: string | null
  onTypeChange: (type: 'mcq' | 'essay') => void
  onQuestionTextChange: (text: string) => void
  onPointsChange: (points: string) => void
  onChoicesChange: Dispatch<SetStateAction<EditableChoice[]>>
  onReferencesChange: Dispatch<SetStateAction<ReferenceAnswer[]>>
  onAddChoice: () => void
  onAddReference: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export function QuestionForm({
  contentLocked,
  editingId,
  questionType,
  questionText,
  points,
  choices,
  references,
  saving,
  error,
  notice,
  onTypeChange,
  onQuestionTextChange,
  onPointsChange,
  onChoicesChange,
  onReferencesChange,
  onAddChoice,
  onAddReference,
  onSubmit,
  onCancel,
}: QuestionFormProps) {
  const { t } = useTranslation()

  if (contentLocked) {
    return (
      <p role="status" className="border-t border-border pt-6 text-sm text-warning-text dark:border-border dark:text-warning-text">
        {t('admin.exams.contentLocked')}
      </p>
    )
  }

  return (
    <section aria-labelledby="question-form-heading" className="border-t border-border pt-6 dark:border-border">
      <h3 id="question-form-heading" className="mb-5 text-xl font-semibold">
        {editingId ? t('admin.questions.edit') : t('admin.questions.new')}
      </h3>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label htmlFor="question-type" className="text-sm font-medium">{t('admin.questions.type')}</label>
          <select
            id="question-type"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm dark:border-border"
            value={questionType}
            onChange={(event) => onTypeChange(event.target.value as 'mcq' | 'essay')}
          >
            <option value="mcq">{t('admin.questions.mcq')}</option>
            <option value="essay">{t('admin.questions.essay')}</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="question-text" className="text-sm font-medium">{t('admin.questions.text')}</label>
          <textarea
            id="question-text"
            className="min-h-24 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm dark:border-border"
            value={questionText}
            onChange={(event) => onQuestionTextChange(event.target.value)}
            maxLength={10_000}
            required
          />
        </div>

        <FormField
          id="question-points"
          type="number"
          label={t('admin.questions.points')}
          value={points}
          onChange={(event) => onPointsChange(event.target.value)}
          min={0.01}
          step="any"
          required
        />

        {questionType === 'mcq' ? (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">{t('admin.questions.choices')}</legend>
            {choices.map((choice, index) => (
              <div key={choice.id} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="correct-choice"
                  aria-label={`${t('admin.questions.correctChoice')} ${index + 1}`}
                  checked={choice.isCorrect}
                  onChange={() => onChoicesChange((current) => current.map((item) => ({ ...item, isCorrect: item.id === choice.id })))}
                />
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-sm dark:border-border"
                  aria-label={`${t('admin.questions.choice')} ${index + 1}`}
                  value={choice.text}
                  onChange={(event) => onChoicesChange((current) => current.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item))}
                  maxLength={2000}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`${t('admin.questions.removeChoice')} ${index + 1}`}
                  disabled={choices.length <= 2}
                  onClick={() => onChoicesChange((current) => current.filter((item) => item.id !== choice.id))}
                >
                  −
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={onAddChoice}>
              {t('admin.questions.addChoice')}
            </Button>
          </fieldset>
        ) : (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">{t('admin.questions.referenceAnswers')}</legend>
            {references.map((reference, index) => (
              <div key={reference.id} className="flex items-center gap-3">
                <textarea
                  className="min-h-16 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm dark:border-border"
                  aria-label={`${t('admin.questions.referenceAnswer')} ${index + 1}`}
                  value={reference.text}
                  onChange={(event) => onReferencesChange((current) => current.map((item) => item.id === reference.id ? { ...item, text: event.target.value } : item))}
                  maxLength={5000}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`${t('admin.questions.removeReference')} ${index + 1}`}
                  disabled={references.length <= 1}
                  onClick={() => onReferencesChange((current) => current.filter((item) => item.id !== reference.id))}
                >
                  −
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={onAddReference}>
              {t('admin.questions.addReference')}
            </Button>
          </fieldset>
        )}

        {error && <p role="alert" className="text-sm font-medium text-danger-text dark:text-danger-text">{error}</p>}
        {notice && <p role="status" className="text-sm font-medium text-success-text dark:text-success-text">{notice}</p>}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={saving}>
            {saving ? t('admin.questions.saving') : t('admin.questions.save')}
          </Button>
          {editingId && <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>}
        </div>
      </form>
    </section>
  )
}

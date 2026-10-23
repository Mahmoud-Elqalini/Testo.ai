'use client'

import { Button } from '@/components/ui/button'
import { SafeText } from '@/components/shared/SafeText'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { AdminQuestion } from '@/lib/types'

interface QuestionListProps {
  questions: AdminQuestion[]
  loading: boolean
  contentLocked: boolean
  onEdit: (question: AdminQuestion) => void
  onDelete: (questionId: string) => void
}

export function QuestionList({ questions, loading, contentLocked, onEdit, onDelete }: QuestionListProps) {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="question-list-heading" className="space-y-4">
      <h2 id="question-list-heading" className="text-2xl font-bold">{t('admin.questions.title')}</h2>
      {loading && <p role="status">{t('common.loading')}</p>}
      {!loading && questions.length === 0 && (
        <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {t('admin.questions.empty')}
        </p>
      )}
      <ul className="space-y-3">
        {questions.map((question, index) => (
          <li key={question.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-300">{index + 1}. {t(`admin.questions.${question.type}`)} · {question.points} {t('admin.questions.pointsAbbr')}</p>
              <p className="break-words font-medium"><SafeText value={question.text} /></p>
            </div>
            {!contentLocked && (
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => onEdit(question)}>{t('common.edit')}</Button>
                <Button type="button" variant="ghost" onClick={() => onDelete(question.id)}>{t('common.delete')}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

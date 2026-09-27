'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { SafeText } from '@/components/shared/SafeText'
import { useTranslation } from '@/lib/i18n/use-translation'
import { hasExamStartedAttempts } from '@/lib/services/exam-service'
import { createQuestion, deleteQuestion, listQuestions, updateQuestion, type QuestionInput } from '@/lib/services/question-service'
import { sanitizeText } from '@/lib/sanitize'
import type { AdminQuestion, McqChoice, ReferenceAnswer } from '@/lib/types'

type EditableChoice = McqChoice & { isCorrect: boolean }

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function emptyChoice(): EditableChoice {
  return { id: newId('choice'), text: '', isCorrect: false }
}

function emptyReference(): ReferenceAnswer {
  return { id: newId('reference'), text: '' }
}

export function QuestionEditor({ examId }: { examId: string }) {
  const { t } = useTranslation()
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [contentLocked, setContentLocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [questionType, setQuestionType] = useState<'mcq' | 'essay'>('mcq')
  const [questionText, setQuestionText] = useState('')
  const [points, setPoints] = useState('1')
  const [choices, setChoices] = useState<EditableChoice[]>([
    { ...emptyChoice(), isCorrect: true },
    emptyChoice(),
  ])
  const [references, setReferences] = useState<ReferenceAnswer[]>([emptyReference()])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadQuestions = useCallback(async () => {
    setLoading(true)
    const result = await listQuestions(examId)
    if (result.error) setError(t('admin.questions.error'))
    else setQuestions(result.data ?? [])
    setLoading(false)
  }, [examId, t])

  useEffect(() => {
    let active = true
    void Promise.all([listQuestions(examId), hasExamStartedAttempts(examId)]).then(([result, editStatus]) => {
      if (!active) return
      if (result.error || editStatus.error || editStatus.data === null) {
        setError(t('admin.questions.error'))
        setContentLocked(true)
      } else {
        setQuestions(result.data ?? [])
        setContentLocked(editStatus.data)
      }
      setLoading(false)
    })

    return () => { active = false }
  }, [examId, t])

  function resetForm() {
    setEditingId(null)
    setQuestionType('mcq')
    setQuestionText('')
    setPoints('1')
    setChoices([{ ...emptyChoice(), isCorrect: true }, emptyChoice()])
    setReferences([emptyReference()])
  }

  function editQuestion(question: AdminQuestion) {
    setEditingId(question.id)
    setQuestionType(question.type)
    setQuestionText(question.text)
    setPoints(String(question.points))
    setChoices((question.mcq_choices ?? []).map((choice) => ({
      ...choice,
      isCorrect: choice.id === question.correct_choice,
    })))
    setReferences(question.reference_answers ?? [])
    setError(null)
    setNotice(null)
  }

  function changeType(type: 'mcq' | 'essay') {
    setQuestionType(type)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const input: QuestionInput = {
      type: questionType,
      text: sanitizeText(questionText),
      points: Number(points),
      ...(questionType === 'mcq' ? { choices } : { referenceAnswers: references }),
    }

    setSaving(true)
    const result = editingId
      ? await updateQuestion(editingId, input)
      : await createQuestion(examId, input)
    setSaving(false)

    if (result.error) {
      setError(result.error.code === 'validation_error' ? t('admin.questions.validation') : t('admin.questions.error'))
      return
    }

    await loadQuestions()
    resetForm()
    setNotice(t('admin.questions.saved'))
  }

  async function removeQuestion(questionId: string) {
    if (!window.confirm(t('admin.questions.deleteConfirm'))) return
    const result = await deleteQuestion(questionId)
    if (result.error) {
      setError(t('admin.questions.error'))
      return
    }
    await loadQuestions()
  }

  return (
    <Card className="w-full max-w-3xl space-y-7 p-6 sm:p-8">
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
                <p className="text-xs font-semibold uppercase text-neutral-500">{index + 1}. {t(`admin.questions.${question.type}`)} · {question.points} {t('admin.questions.pointsAbbr')}</p>
                <p className="break-words font-medium"><SafeText value={question.text} /></p>
              </div>
              {!contentLocked && (
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => editQuestion(question)}>{t('common.edit')}</Button>
                  <Button type="button" variant="ghost" onClick={() => void removeQuestion(question.id)}>{t('common.delete')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {contentLocked ? (
        <p role="status" className="border-t border-neutral-200 pt-6 text-sm text-amber-800 dark:border-neutral-700 dark:text-amber-200">
          {t('admin.exams.contentLocked')}
        </p>
      ) : (
      <section aria-labelledby="question-form-heading" className="border-t border-neutral-200 pt-6 dark:border-neutral-700">
        <h3 id="question-form-heading" className="mb-5 text-xl font-semibold">
          {editingId ? t('admin.questions.edit') : t('admin.questions.new')}
        </h3>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="question-type" className="text-sm font-medium">{t('admin.questions.type')}</label>
            <select
              id="question-type"
              className="h-10 w-full rounded-md border border-neutral-300 bg-background px-3 text-sm dark:border-neutral-700"
              value={questionType}
              onChange={(event) => changeType(event.target.value as 'mcq' | 'essay')}
            >
              <option value="mcq">{t('admin.questions.mcq')}</option>
              <option value="essay">{t('admin.questions.essay')}</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="question-text" className="text-sm font-medium">{t('admin.questions.text')}</label>
            <textarea
              id="question-text"
              className="min-h-24 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              maxLength={10_000}
              required
            />
          </div>

          <FormField
            id="question-points"
            type="number"
            label={t('admin.questions.points')}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
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
                    onChange={() => setChoices((current) => current.map((item) => ({ ...item, isCorrect: item.id === choice.id })))}
                  />
                  <input
                    className="h-10 min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-3 text-sm dark:border-neutral-700"
                    aria-label={`${t('admin.questions.choice')} ${index + 1}`}
                    value={choice.text}
                    onChange={(event) => setChoices((current) => current.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item))}
                    maxLength={2000}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`${t('admin.questions.removeChoice')} ${index + 1}`}
                    disabled={choices.length <= 2}
                    onClick={() => setChoices((current) => current.filter((item) => item.id !== choice.id))}
                  >
                    −
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setChoices((current) => [...current, emptyChoice()])}>
                {t('admin.questions.addChoice')}
              </Button>
            </fieldset>
          ) : (
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">{t('admin.questions.referenceAnswers')}</legend>
              {references.map((reference, index) => (
                <div key={reference.id} className="flex items-center gap-3">
                  <textarea
                    className="min-h-16 min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                    aria-label={`${t('admin.questions.referenceAnswer')} ${index + 1}`}
                    value={reference.text}
                    onChange={(event) => setReferences((current) => current.map((item) => item.id === reference.id ? { ...item, text: event.target.value } : item))}
                    maxLength={5000}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`${t('admin.questions.removeReference')} ${index + 1}`}
                    disabled={references.length <= 1}
                    onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}
                  >
                    −
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setReferences((current) => [...current, emptyReference()])}>
                {t('admin.questions.addReference')}
              </Button>
            </fieldset>
          )}

          {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
          {notice && <p role="status" className="text-sm font-medium text-green-700 dark:text-green-300">{notice}</p>}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={saving}>
              {saving ? t('admin.questions.saving') : t('admin.questions.save')}
            </Button>
            {editingId && <Button type="button" variant="secondary" onClick={resetForm}>{t('common.cancel')}</Button>}
          </div>
        </form>
      </section>
      )}
    </Card>
  )
}

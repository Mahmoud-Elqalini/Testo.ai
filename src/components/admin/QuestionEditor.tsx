'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/use-translation'
import { hasExamStartedAttempts } from '@/lib/services/exam-service'
import { createQuestion, deleteQuestion, listQuestions, updateQuestion, type QuestionInput } from '@/lib/services/question-service'
import { sanitizeText } from '@/lib/sanitize'
import type { AdminQuestion, ReferenceAnswer } from '@/lib/types'
import { QuestionForm, type EditableChoice } from './QuestionForm'
import { QuestionList } from './QuestionList'

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
      <QuestionList
        questions={questions}
        loading={loading}
        contentLocked={contentLocked}
        onEdit={editQuestion}
        onDelete={(questionId) => void removeQuestion(questionId)}
      />
      <QuestionForm
        contentLocked={contentLocked}
        editingId={editingId}
        questionType={questionType}
        questionText={questionText}
        points={points}
        choices={choices}
        references={references}
        saving={saving}
        error={error}
        notice={notice}
        onTypeChange={changeType}
        onQuestionTextChange={setQuestionText}
        onPointsChange={setPoints}
        onChoicesChange={setChoices}
        onReferencesChange={setReferences}
        onAddChoice={() => setChoices((current) => [...current, emptyChoice()])}
        onAddReference={() => setReferences((current) => [...current, emptyReference()])}
        onSubmit={(event) => void handleSubmit(event)}
        onCancel={resetForm}
      />
    </Card>
  )
}

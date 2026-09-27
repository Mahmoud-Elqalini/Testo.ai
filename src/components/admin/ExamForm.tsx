'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { useTranslation } from '@/lib/i18n/use-translation'
import { createExam, getExam, hasExamStartedAttempts, updateExam } from '@/lib/services/exam-service'
import { sanitizeText } from '@/lib/sanitize'
import type { Exam } from '@/lib/types'

function toLocalDateTime(value: string) {
  const date = new Date(value)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function defaultStartTime() {
  return toLocalDateTime(new Date(Date.now() + 60 * 60 * 1000).toISOString())
}

export function ExamForm({ examId }: { examId?: string }) {
  const router = useRouter()
  const { t } = useTranslation()
  const [exam, setExam] = useState<Exam | null>(null)
  const [contentLocked, setContentLocked] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startTime, setStartTime] = useState(defaultStartTime)
  const [duration, setDuration] = useState('60')
  const [loading, setLoading] = useState(Boolean(examId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!examId) return
    let active = true

    void Promise.all([getExam(examId), hasExamStartedAttempts(examId)]).then(([result, editStatus]) => {
      if (!active) return
      if (result.error || editStatus.error || !result.data || editStatus.data === null) {
        setError(t('admin.exams.loadError'))
        setLoading(false)
        return
      }
      setExam(result.data)
      setContentLocked(editStatus.data)
      setTitle(result.data.title)
      setDescription(result.data.description)
      setStartTime(toLocalDateTime(result.data.start_time))
      setDuration(String(result.data.duration_minutes))
      setLoading(false)
    })

    return () => { active = false }
  }, [examId, t])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const parsedDuration = Number(duration)
    const parsedStartTime = new Date(startTime)
    if (!title.trim() || Number.isNaN(parsedStartTime.getTime()) || !Number.isInteger(parsedDuration) || parsedDuration <= 0) {
      setError(t('admin.exams.required'))
      return
    }

    setSaving(true)
    const input = {
      title: sanitizeText(title).trim(),
      description: sanitizeText(description),
      start_time: parsedStartTime.toISOString(),
      duration_minutes: parsedDuration,
    }
    const result = examId ? await updateExam(examId, input) : await createExam(input)
    setSaving(false)

    if (result.error || !result.data) {
      setError(result.error?.code === 'validation_error' ? result.error.message : t('admin.exams.saveError'))
      return
    }

    if (!examId) {
      router.push(`/admin/exams/${result.data.id}/edit`)
      return
    }

    setExam(result.data)
    setNotice(t('admin.exams.saved'))
  }

  if (loading) return <p role="status">{t('common.loading')}</p>

  return (
    <Card className="w-full max-w-3xl space-y-6 p-6 sm:p-8">
      <div>
        <Link className="text-sm text-primary-600 hover:underline" href="/admin">← {t('common.back')}</Link>
        <h1 className="mt-4 text-2xl font-bold">
          {examId ? t('admin.exams.editTitle') : t('admin.exams.createTitle')}
        </h1>
        {exam?.is_published && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{t('admin.exams.published')}</p>
        )}
        {contentLocked && (
          <p role="status" className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            {t('admin.exams.contentLocked')}
          </p>
        )}
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <FormField
          id="exam-title"
          label={t('admin.exams.titleLabel')}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          disabled={contentLocked}
          required
        />

        <div className="space-y-2">
          <label htmlFor="exam-description" className="text-sm font-medium">{t('admin.exams.descriptionLabel')}</label>
          <textarea
            id="exam-description"
            className="min-h-28 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={4}
            disabled={contentLocked}
          />
        </div>

        <FormField
          id="exam-start-time"
          type="datetime-local"
          label={t('admin.exams.startTimeLabel')}
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          disabled={contentLocked}
          required
        />

        <FormField
          id="exam-duration"
          type="number"
          label={t('admin.exams.durationLabel')}
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          min={1}
          step={1}
          disabled={contentLocked}
          required
        />

        {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        {notice && <p role="status" className="text-sm font-medium text-green-700 dark:text-green-300">{notice}</p>}

        {!contentLocked && <Button type="submit" loading={saving}>
          {saving ? t('admin.exams.saving') : t('admin.exams.save')}
        </Button>}
      </form>
    </Card>
  )
}

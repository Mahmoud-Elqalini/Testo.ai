'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import { useTranslation } from '@/lib/i18n/use-translation'
import { createClient } from '@/lib/supabase/client'
import type { Exam, ExamAttempt } from '@/lib/types'

interface AttemptWithExam extends ExamAttempt {
  exam: Pick<Exam, 'title' | 'start_time' | 'duration_minutes'> | null
}
type UpcomingExamFields = Pick<Exam, 'id' | 'title' | 'start_time' | 'duration_minutes'>
type UpcomingExam = UpcomingExamFields & { active: boolean }

export default function StudentDashboard() {
  const { t, language } = useTranslation()
  const [attempts, setAttempts] = useState<AttemptWithExam[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingExam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const client = createClient()
    const [attemptResult, examResult] = await Promise.all([
      client.from('exam_attempts').select('id,exam_id,student_id,status,started_at,finished_at,session_id,exam:exams(title,start_time,duration_minutes)').order('started_at', { ascending: false }),
      client.from('exams').select('id,title,start_time,duration_minutes').eq('is_published', true).order('start_time', { ascending: true }),
    ])
    if (attemptResult.error || examResult.error) {
      setError(true)
    } else {
      setAttempts((attemptResult.data ?? []) as unknown as AttemptWithExam[])
      const now = Date.now()
      setUpcoming(((examResult.data ?? []) as UpcomingExamFields[])
        .filter((exam) => Date.parse(exam.start_time) + exam.duration_minutes * 60_000 > now)
        .map((exam) => ({ ...exam, active: Date.parse(exam.start_time) <= now })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const formatDate = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const openAttempts = attempts.filter((attempt) => attempt.status === 'pending' || attempt.status === 'in_progress')
  const closedAttempts = attempts.filter((attempt) => attempt.status !== 'pending' && attempt.status !== 'in_progress')

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold">{t('student.exam.dashboardTitle')}</h1><p className="mt-2 text-neutral-600 dark:text-neutral-300">{t('student.exam.dashboardDescription')}</p></div>
        <Link href="/student/join-group"><Button variant="secondary">{t('dashboard.joinGroup')}</Button></Link>
      </header>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && <Card className="space-y-4 p-6" role="alert"><p>{t('student.exam.loadError')}</p><Button variant="secondary" onClick={() => void load()}>{t('common.retry')}</Button></Card>}
      {!loading && !error && <>
        <section className="space-y-4" aria-labelledby="open-exams-title">
          <h2 id="open-exams-title" className="text-xl font-semibold">{t('student.exam.available')}</h2>
          {openAttempts.length === 0 && upcoming.length === 0 && <Card className="p-6 text-neutral-600 dark:text-neutral-300">{t('student.exam.noAvailable')}</Card>}
          <ul className="grid gap-4 sm:grid-cols-2">
            {openAttempts.map((attempt) => <li key={attempt.id}><Card className="h-full space-y-4 p-5">
              <div><h3 className="break-words text-lg font-semibold"><SafeText value={attempt.exam?.title ?? t('student.exam.untitled')} /></h3><p className="mt-1 text-sm text-neutral-500">{t('admin.exams.starts')}: {attempt.exam ? formatDate(attempt.exam.start_time) : '—'}</p></div>
              <p className="text-sm">{attempt.status === 'in_progress' ? t('student.exam.resume') : t('student.exam.ready')}</p>
              <Link href={`/student/exam/${attempt.id}`}><Button>{attempt.status === 'in_progress' ? t('student.exam.continue') : t('student.exam.start')}</Button></Link>
            </Card></li>)}
            {upcoming.filter((exam) => !attempts.some((attempt) => attempt.exam_id === exam.id)).map((exam) => <li key={exam.id}><Card className="h-full space-y-4 p-5">
              <div><h3 className="break-words text-lg font-semibold"><SafeText value={exam.title} /></h3><p className="mt-1 text-sm text-neutral-500">{t('admin.exams.starts')}: {formatDate(exam.start_time)}</p></div>
              <p className="text-sm">{exam.active ? t('student.exam.preparing') : t('student.exam.notOpen')}</p>
            </Card></li>)}
          </ul>
        </section>
        <section className="space-y-4" aria-labelledby="past-attempts-title">
          <h2 id="past-attempts-title" className="text-xl font-semibold">{t('student.exam.pastAttempts')}</h2>
          {closedAttempts.length === 0 && <Card className="p-6 text-neutral-600 dark:text-neutral-300">{t('student.exam.noPast')}</Card>}
          <ul className="grid gap-3">{closedAttempts.map((attempt) => <li key={attempt.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium"><SafeText value={attempt.exam?.title ?? t('student.exam.untitled')} /></p><p className="text-sm text-neutral-500">{attempt.finished_at ? formatDate(attempt.finished_at) : t('student.exam.noFinishTime')}</p></div>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800">{t(`student.exam.status.${attempt.status}`)}</span>
          </Card></li>)}</ul>
        </section>
      </>}
    </main>
  )
}

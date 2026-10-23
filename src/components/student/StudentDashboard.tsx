'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import { WorkspaceLayout } from '@/components/shared/WorkspaceLayout'
import { useTranslation } from '@/lib/i18n/use-translation'
import { getStudentDashboardData, type StudentDashboardAttempt, type UpcomingExam } from '@/lib/services/dashboard-service'

export default function StudentDashboard() {
  const { t, language } = useTranslation()
  const [attempts, setAttempts] = useState<StudentDashboardAttempt[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingExam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const result = await getStudentDashboardData()
    if (result.error || !result.data) {
      setError(true)
    } else {
      setAttempts(result.data.attempts)
      setUpcoming(result.data.upcoming)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const formatDate = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const openAttempts = attempts.filter((attempt) => attempt.status === 'pending' || attempt.status === 'in_progress')
  const closedAttempts = attempts.filter((attempt) => attempt.status !== 'pending' && attempt.status !== 'in_progress')

  const featuredAttempt = openAttempts[0]
  const featuredUpcoming = upcoming.find((exam) => !attempts.some((attempt) => attempt.exam_id === exam.id))

  return <WorkspaceLayout role="student" active="dashboard"><main className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-[10px] font-bold tracking-[.14em] text-neutral-600">{t('nav.dashboard').toLocaleUpperCase(language)}</p><h1 className="text-[27px] font-semibold leading-tight tracking-[-.04em] sm:text-[30px]">{t('student.exam.dashboardTitle')}</h1><p className="mt-2 text-[13px] text-neutral-600 dark:text-neutral-300">{t('student.exam.dashboardDescription')}</p></div>
        <Link href="/student/join-group"><Button variant="secondary">{t('dashboard.joinGroup')}</Button></Link>
      </header>
      {!loading && !error && <>
        <section className="testo-admin-metrics" aria-label={t('student.exam.dashboardTitle')}>
          {[{label:t('student.exam.upcomingCount'),value:upcoming.length,icon:'▦'},{label:t('student.exam.inProgressCount'),value:openAttempts.length,icon:'◉'},{label:t('student.exam.completedCount'),value:closedAttempts.length,icon:'✓'},{label:t('student.exam.totalAttempts'),value:attempts.length,icon:'▤'}].map((metric) => <article key={metric.label} className="testo-metric-card"><span aria-hidden="true">{metric.icon}</span><p>{metric.label}</p><strong>{metric.value}</strong></article>)}
        </section>
        <section className="testo-student-grid">
          {(featuredAttempt || featuredUpcoming) ? <article className="testo-feature-card"><span className="text-[10px] font-bold tracking-[.14em]">{t('student.exam.available').toLocaleUpperCase(language)}</span><h2><SafeText value={featuredAttempt?.exam?.title ?? featuredUpcoming?.title ?? ''} /></h2><p>{t('admin.exams.starts')}: {formatDate(featuredAttempt?.exam?.start_time ?? featuredUpcoming!.start_time)}</p><p>{t('admin.exams.duration')}: {featuredAttempt?.exam?.duration_minutes ?? featuredUpcoming?.duration_minutes} {t('admin.exams.minutes')}</p>{featuredAttempt ? <Link href={`/student/exam/${featuredAttempt.id}`}>{featuredAttempt.status === 'in_progress' ? t('student.exam.continue') : t('student.exam.start')} →</Link> : <p>{featuredUpcoming?.active ? t('student.exam.preparing') : t('student.exam.notOpen')}</p>}</article> : <article className="testo-feature-card"><span className="text-[10px] font-bold tracking-[.14em]">{t('student.exam.available').toLocaleUpperCase(language)}</span><h2>{t('student.exam.noAvailable')}</h2><p>{t('student.exam.dashboardDescription')}</p></article>}
          <Card className="flex flex-col justify-center gap-3 p-6"><span className="text-2xl text-primary-600">✓</span><h2 className="font-semibold">{t('student.exam.pastAttempts')}</h2><p className="text-sm text-neutral-600">{closedAttempts.length} · {t('student.exam.dashboardDescription')}</p><Link className="text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300" href="#past-attempts-title">{t('student.exam.pastAttempts')} →</Link></Card>
        </section>
      </>}
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && <Card className="space-y-4 p-6" role="alert"><p>{t('student.exam.loadError')}</p><Button variant="secondary" onClick={() => void load()}>{t('common.retry')}</Button></Card>}
      {!loading && !error && <>
        <section className="space-y-4" aria-labelledby="open-exams-title">
          <h2 id="open-exams-title" className="text-xl font-semibold">{t('student.exam.available')}</h2>
          {openAttempts.length === 0 && upcoming.length === 0 && <Card className="p-6 text-neutral-600 dark:text-neutral-300">{t('student.exam.noAvailable')}</Card>}
          <ul className="grid gap-4 sm:grid-cols-2">
            {openAttempts.map((attempt) => <li key={attempt.id}><Card className="h-full space-y-4 p-5">
              <div><h3 className="break-words text-lg font-semibold"><SafeText value={attempt.exam?.title ?? t('student.exam.untitled')} /></h3><p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('admin.exams.starts')}: {attempt.exam ? formatDate(attempt.exam.start_time) : '—'}</p></div>
              <p className="text-sm">{attempt.status === 'in_progress' ? t('student.exam.resume') : t('student.exam.ready')}</p>
              <Link href={`/student/exam/${attempt.id}`}><Button>{attempt.status === 'in_progress' ? t('student.exam.continue') : t('student.exam.start')}</Button></Link>
            </Card></li>)}
            {upcoming.filter((exam) => !attempts.some((attempt) => attempt.exam_id === exam.id)).map((exam) => <li key={exam.id}><Card className="h-full space-y-4 p-5">
              <div><h3 className="break-words text-lg font-semibold"><SafeText value={exam.title} /></h3><p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('admin.exams.starts')}: {formatDate(exam.start_time)}</p></div>
              <p className="text-sm">{exam.active ? t('student.exam.preparing') : t('student.exam.notOpen')}</p>
            </Card></li>)}
          </ul>
        </section>
        <section className="space-y-4" aria-labelledby="past-attempts-title">
          <h2 id="past-attempts-title" className="text-xl font-semibold">{t('student.exam.pastAttempts')}</h2>
          {closedAttempts.length === 0 && <Card className="p-6 text-neutral-600 dark:text-neutral-300">{t('student.exam.noPast')}</Card>}
          <ul className="grid gap-3">{closedAttempts.map((attempt) => <li key={attempt.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium"><SafeText value={attempt.exam?.title ?? t('student.exam.untitled')} /></p><p className="text-sm text-neutral-600 dark:text-neutral-300">{attempt.finished_at ? formatDate(attempt.finished_at) : t('student.exam.noFinishTime')}</p></div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800">{t(`student.exam.status.${attempt.status}`)}</span>
              {(attempt.status === 'submitted' || attempt.status === 'auto_submitted') && <Link href={`/student/results/${attempt.id}`}><Button variant="secondary">{t('student.results.view')}</Button></Link>}
            </div>
          </Card></li>)}</ul>
        </section>
      </>}
    </main></WorkspaceLayout>
}

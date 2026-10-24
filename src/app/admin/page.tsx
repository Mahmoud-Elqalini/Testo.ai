'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import { WorkspaceLayout } from '@/components/shared/WorkspaceLayout'
import { useTranslation } from '@/lib/i18n/use-translation'
import { listAdminExams } from '@/lib/services/exam-service'
import type { Exam } from '@/lib/types'

export default function AdminDashboardPage() {
  const { t, language } = useTranslation()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(0)

  const loadExams = useCallback(async () => {
    setLoading(true); setError(false)
    const result = await listAdminExams()
    if (result.error) setError(true)
    else setExams(result.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) void loadExams() })
    return () => { active = false }
  }, [loadExams])

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const scheduled = exams.filter((exam) => exam.is_published && Date.parse(exam.start_time) > now)
  const live = exams.filter((exam) => {
    const start = Date.parse(exam.start_time)
    return exam.is_published && start <= now && now < start + exam.duration_minutes * 60_000
  })
  const published = exams.filter((exam) => exam.is_published)
  const metrics = [
    { label: t('admin.dashboard.scheduled'), value: scheduled.length, icon: '▦', note: t('admin.dashboard.nextExams') },
    { label: t('admin.dashboard.live'), value: live.length, icon: '◉', note: t('admin.dashboard.liveNote') },
    { label: t('admin.dashboard.published'), value: published.length, icon: '✓', note: t('admin.dashboard.publishedNote') },
    { label: t('admin.exams.title'), value: exams.length, icon: '▤', note: t('admin.dashboard.totalNote') },
  ]

  return <WorkspaceLayout role="admin" active="dashboard">
    <main className="space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="mb-2 text-[10px] font-bold tracking-[.14em] text-muted">{new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toLocaleUpperCase(language)}</p>
          <h1 className="text-[27px] font-semibold leading-tight tracking-[-.04em] sm:text-[30px]">{t('admin.dashboard.title')}</h1><p className="mt-2 text-[13px]">{t('admin.dashboard.description')}</p></div>
        <Link href="/admin/exams/create"><Button>{t('admin.exams.create')} <span aria-hidden="true">＋</span></Button></Link>
      </section>

      <section className="testo-admin-metrics" aria-label={t('admin.dashboard.title')}>
        {metrics.map((metric) => <article key={metric.label} className="testo-metric-card"><span aria-hidden="true">{metric.icon}</span><p>{metric.label}</p><strong>{loading ? '—' : metric.value}</strong><small className="mt-2 block text-muted">{metric.note}</small></article>)}
      </section>

      <section className="testo-panel">
        <header id="exam-list" className="testo-panel-head flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{t('admin.dashboard.schedule')}</h2><p className="mt-1 text-[10px] text-muted">{t('admin.dashboard.scheduleDescription')}</p></div><Link className="text-xs font-semibold text-primary-text hover:underline dark:text-primary-text" href="#exam-list">{t('admin.dashboard.allExams')} →</Link></header>
        {loading && <p role="status" className="p-5">{t('common.loading')}</p>}
        {error && <Card className="m-5 space-y-3 p-5" role="alert"><p>{t('admin.exams.loadError')}</p><Button variant="secondary" onClick={() => void loadExams()}>{t('common.retry')}</Button></Card>}
        {!loading && !error && exams.length === 0 && <div className="p-8 text-center"><p className="text-sm text-muted">{t('admin.exams.empty')}</p><Link className="mt-3 inline-block text-sm font-semibold text-primary-text hover:underline dark:text-primary-text" href="/admin/exams/create">{t('admin.exams.create')}</Link></div>}
        {!loading && !error && exams.length > 0 && <ul className="testo-row-list p-0">
          {exams.slice().sort((a,b) => Date.parse(a.start_time)-Date.parse(b.start_time)).map((exam) => <li key={exam.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-semibold"><SafeText value={exam.title} /></h3><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${exam.is_published ? 'bg-success-soft text-success-text dark:bg-success-soft dark:text-success-text' : 'bg-neutral-chip-bg text-neutral-chip-text dark:bg-surface-soft dark:text-muted'}`}>{exam.is_published ? t('admin.exams.published') : t('admin.exams.draft')}</span></div><p className="mt-1 text-xs text-muted">{t('admin.exams.starts')}: {new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(exam.start_time))} · {exam.duration_minutes} {t('admin.exams.minutes')}</p></div>
            <div className="flex shrink-0 gap-2"><Link href={`/admin/exams/${exam.id}/edit`}><Button variant="secondary">{t('admin.exams.edit')}</Button></Link><Link href={`/admin/exams/${exam.id}/publish`}><Button variant="ghost">{exam.is_published ? t('admin.exams.unpublish') : t('admin.exams.publish')}</Button></Link></div>
          </li>)}
        </ul>}
      </section>
      <section className="grid gap-4 sm:grid-cols-2"><Card className="flex items-center justify-between gap-4 p-5"><div><h2 className="font-semibold">{t('admin.groups.title')}</h2><p className="mt-1 text-sm text-muted">{t('admin.groups.description')}</p></div><Link href="/admin/groups"><Button variant="secondary">{t('admin.dashboard.manageGroups')} →</Button></Link></Card><Card className="flex items-center justify-between gap-4 p-5"><div><h2 className="font-semibold">{t('admin.dashboard.createPrompt')}</h2><p className="mt-1 text-sm text-muted">{t('admin.dashboard.createDescription')}</p></div><Link href="/admin/exams/create"><Button>{t('admin.exams.create')} ＋</Button></Link></Card></section>
    </main>
  </WorkspaceLayout>
}

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import { useTranslation } from '@/lib/i18n/use-translation'
import { listAdminExams } from '@/lib/services/exam-service'
import type { Exam } from '@/lib/types'

export default function AdminDashboardPage() {
  const { t, language } = useTranslation()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadExams = useCallback(async () => {
    setLoading(true)
    setError(false)
    const result = await listAdminExams()
    if (result.error) setError(true)
    else setExams(result.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    void listAdminExams().then((result) => {
      if (!active) return
      if (result.error) setError(true)
      else setExams(result.data ?? [])
      setLoading(false)
    })

    return () => { active = false }
  }, [])

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('admin.exams.title')}</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-300">{t('admin.exams.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/groups"><Button variant="secondary">{t('admin.groups.title')}</Button></Link>
          <Link href="/admin/exams/create"><Button>{t('admin.exams.create')}</Button></Link>
        </div>
      </header>

      {loading && <p role="status">{t('common.loading')}</p>}

      {error && (
        <Card className="space-y-4 p-6" role="alert">
          <p>{t('admin.exams.loadError')}</p>
          <Button variant="secondary" onClick={() => void loadExams()}>{t('common.retry')}</Button>
        </Card>
      )}

      {!loading && !error && exams.length === 0 && (
        <Card className="p-8 text-center text-neutral-600 dark:text-neutral-300">
          {t('admin.exams.empty')}
        </Card>
      )}

      <ul className="grid gap-4">
        {exams.map((exam) => (
          <li key={exam.id}>
            <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="break-words text-xl font-semibold"><SafeText value={exam.title} /></h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${exam.is_published ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}>
                    {exam.is_published ? t('admin.exams.published') : t('admin.exams.draft')}
                  </span>
                </div>
                {exam.description && (
                  <p className="break-words text-sm text-neutral-600 dark:text-neutral-300"><SafeText value={exam.description} /></p>
                )}
                <p className="text-sm text-neutral-500">
                  {t('admin.exams.starts')}: {new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(exam.start_time))}
                  {' · '}{t('admin.exams.duration')}: {exam.duration_minutes} {t('admin.exams.minutes')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={`/admin/exams/${exam.id}/edit`}>
                  <Button variant="secondary">{t('admin.exams.edit')}</Button>
                </Link>
                <Link href={`/admin/exams/${exam.id}/publish`}>
                  <Button variant="ghost">{exam.is_published ? t('admin.exams.unpublish') : t('admin.exams.publish')}</Button>
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  )
}

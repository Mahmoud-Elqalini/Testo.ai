'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import { useTranslation } from '@/lib/i18n/use-translation'
import { getExam, getExamPermissionSummary, publishExam, unpublishExam } from '@/lib/services/exam-service'
import type { Exam } from '@/lib/types'
import type { ExamPermissionSummary } from '@/lib/services/exam-service'
import { ExamPermissions } from './ExamPermissions'

export function PublishExamConfirmation({ examId }: { examId: string }) {
  const router = useRouter()
  const { t } = useTranslation()
  const [exam, setExam] = useState<Exam | null>(null)
  const [audience, setAudience] = useState<ExamPermissionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([getExam(examId), getExamPermissionSummary(examId)]).then(([examResult, audienceResult]) => {
      if (!active) return
      if (examResult.error || audienceResult.error || !examResult.data || !audienceResult.data) {
        setError(true)
      } else {
        setExam(examResult.data)
        setAudience(audienceResult.data)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [examId])

  async function refreshAudience() {
    const result = await getExamPermissionSummary(examId)
    if (!result.error && result.data) setAudience(result.data)
  }

  async function confirm() {
    if (!exam) return
    setSaving(true)
    setError(false)
    const result = exam.is_published ? await unpublishExam(examId) : await publishExam(examId)
    setSaving(false)
    if (result.error) {
      setError(true)
      return
    }
    router.push('/admin')
  }

  if (loading) return <p role="status">{t('common.loading')}</p>

  return (
    <Card className="w-full max-w-xl space-y-5 p-6 sm:p-8">
      <div>
        <Link className="text-sm text-primary-600 hover:underline" href="/admin">← {t('common.back')}</Link>
        <h1 className="mt-4 text-2xl font-bold">
          {exam?.is_published ? t('admin.publish.unpublishTitle') : t('admin.publish.title')}
        </h1>
      </div>

      {exam && <p className="text-lg font-medium"><SafeText value={exam.title} /></p>}
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.publish.description')}</p>

      {exam && <ExamPermissions examId={examId} onPermissionsChanged={refreshAudience} />}

      {audience && (
        <div className="space-y-2 rounded-lg bg-neutral-50 p-4 text-sm dark:bg-neutral-800">
          <p className="font-semibold">{t('admin.publish.audience')}</p>
          <p>{audience.studentCount} {t('admin.publish.students')} · {audience.groupCount} {t('admin.publish.groups')}</p>
          {audience.studentCount + audience.groupCount === 0 && (
            <p className="text-amber-800 dark:text-amber-200">{t('admin.publish.noAudience')}</p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{t('admin.publish.error')}</p>}

      <div role="alertdialog" aria-modal="true" aria-labelledby="publish-title" className="flex flex-wrap gap-3">
        <span id="publish-title" className="sr-only">{exam?.is_published ? t('admin.publish.unpublishTitle') : t('admin.publish.title')}</span>
        <Button type="button" loading={saving} onClick={() => void confirm()}>
          {exam?.is_published ? t('admin.publish.confirmUnpublish') : t('admin.publish.confirm')}
        </Button>
        <Link href="/admin"><Button type="button" variant="secondary">{t('admin.publish.cancel')}</Button></Link>
      </div>
    </Card>
  )
}

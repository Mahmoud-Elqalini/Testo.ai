import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { StudentResult } from '@/lib/services/results-service'

export default function ResultCard({ result }: { result: Extract<StudentResult, { status: 'graded' }> }) {
  const { t, language } = useTranslation()
  const formatNumber = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)
  const date = result.finishedAt
    ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.finishedAt))
    : t('student.exam.noFinishTime')

  return <Card className="space-y-4 p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-muted dark:text-muted">{t('student.results.title')}</p>
        <h1 className="text-2xl font-bold"><SafeText value={result.examTitle} /></h1>
        <p className="mt-1 text-sm text-muted dark:text-muted">{date}</p>
      </div>
      <span className="rounded-full bg-neutral-chip-bg px-3 py-1 text-sm dark:bg-surface-soft">
        {t(`student.exam.status.${result.attemptStatus}`)}
      </span>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg bg-surface-soft p-4 dark:bg-surface-soft/70">
        <p className="text-sm text-muted dark:text-muted">{t('student.results.score')}</p>
        <p className="mt-1 text-xl font-semibold">{formatNumber(result.earnedPoints)} / {formatNumber(result.maximumPoints)}</p>
      </div>
      <div className="rounded-lg bg-surface-soft p-4 dark:bg-surface-soft/70">
        <p className="text-sm text-muted dark:text-muted">{t('student.results.percentage')}</p>
        <p className="mt-1 text-xl font-semibold">{formatNumber(result.percentage)}%</p>
      </div>
      <div className="rounded-lg bg-surface-soft p-4 dark:bg-surface-soft/70">
        <p className="text-sm text-muted dark:text-muted">{t('student.results.status')}</p>
        <p className="mt-1 text-xl font-semibold">{t(`student.exam.status.${result.attemptStatus}`)}</p>
      </div>
    </div>
  </Card>
}

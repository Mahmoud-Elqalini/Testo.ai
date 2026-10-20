'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import ResultCard from '@/components/results/ResultCard'
import { useTranslation } from '@/lib/i18n/use-translation'
import { getStudentResult, type StudentResult } from '@/lib/services/results-service'

export default function StudentResultPage({ attemptId }: { attemptId: string }) {
  const { t, language } = useTranslation()
  const [result, setResult] = useState<StudentResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async (isActive: () => boolean = () => true) => {
    setLoading(true)
    setLoadError(false)
    const response = await getStudentResult(attemptId)
    if (!isActive()) return
    setResult(response.data)
    setLoadError(Boolean(response.error))
    setLoading(false)
  }, [attemptId])

  useEffect(() => {
    let active = true
    void load(() => active)
    return () => { active = false }
  }, [load])

  const formatNumber = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)

  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
    <Link href="/student" className="text-sm text-primary-700 hover:underline dark:text-primary-300">← {t('student.exam.backToDashboard')}</Link>
    {loading && <p role="status">{t('common.loading')}</p>}
    {loadError && !loading && <Card className="space-y-4 p-6" role="alert">
      <p>{t('student.results.unavailable')}</p>
      <Button variant="secondary" onClick={() => { setResult(null); void load() }}>{t('common.retry')}</Button>
    </Card>}
    {!loading && !loadError && result?.status === 'pending' && <Card className="space-y-2 p-6" role="status">
      <h1 className="text-2xl font-bold">{t('student.results.pendingTitle')}</h1>
      <p className="text-neutral-600 dark:text-neutral-300"><SafeText value={result.examTitle} /></p>
      <p>{t('student.results.pendingDescription')}</p>
    </Card>}
    {!loading && !loadError && result?.status === 'graded' && <>
      <ResultCard result={result} />
      <section className="space-y-4" aria-labelledby="result-breakdown-title">
        <h2 id="result-breakdown-title" className="text-xl font-semibold">{t('student.results.breakdown')}</h2>
        <ol className="space-y-4">
          {result.questions.map((question, index) => {
            const selected = question.choices.find(({ id }) => id === question.selectedChoice)?.text
            const correct = question.choices.find(({ id }) => id === question.correctChoice)?.text
            return <li key={question.id}><Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="min-w-0 flex-1 text-lg font-semibold"><span className="me-2 text-neutral-500">{index + 1}.</span><SafeText value={question.text} /></h3>
                <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800">{formatNumber(question.earnedPoints)} / {formatNumber(question.points)}</span>
              </div>
              {question.type === 'mcq' ? <dl className="grid gap-3 sm:grid-cols-2">
                <div><dt className="text-sm text-neutral-500">{t('student.results.yourAnswer')}</dt><dd className="mt-1 font-medium">{selected ? <SafeText value={selected} /> : t('student.results.unanswered')}</dd></div>
                <div><dt className="text-sm text-neutral-500">{t('student.results.correctAnswer')}</dt><dd className="mt-1 font-medium"><SafeText value={correct ?? t('student.results.unavailable')} /></dd></div>
              </dl> : <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('student.results.essayScore').replace('{score}', formatNumber(question.normalizedScore * 100))}</p>}
            </Card></li>
          })}
        </ol>
      </section>
    </>}
    <div className="flex justify-end"><Link href="/student"><Button variant="secondary">{t('student.exam.backToDashboard')}</Button></Link></div>
  </main>
}

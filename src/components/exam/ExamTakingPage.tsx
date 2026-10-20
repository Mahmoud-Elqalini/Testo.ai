'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import CountdownTimer from '@/components/exam/CountdownTimer'
import EssayQuestion from '@/components/exam/EssayQuestion'
import McqQuestion from '@/components/exam/McqQuestion'
import SaveStatus, { type AnswerSaveState } from '@/components/exam/SaveStatus'
import SubmitExam from '@/components/exam/SubmitExam'
import { useTranslation } from '@/lib/i18n/use-translation'
import { getExamQuestions, saveAnswer, startAttempt, submitAttempt, type SaveAnswerInput } from '@/lib/services/attempt-service'
import { queueAnswer, readQueuedAnswers, removeQueuedAnswer } from '@/lib/offline-queue'
import type { ExamQuestion, GetExamQuestionsResponse } from '@/lib/types'

type DraftAnswer = { mcq_answer: string | null; essay_answer: string | null }

export default function ExamTakingPage({ attemptId, examTitle }: { attemptId: string; examTitle: string | null }) {
  const router = useRouter()
  const { t, language } = useTranslation()
  const [data, setData] = useState<GetExamQuestionsResponse | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({})
  const [saveStates, setSaveStates] = useState<Record<string, AnswerSaveState>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [takeover, setTakeover] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [sessionInvalid, setSessionInvalid] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const pendingSaves = useRef(new Map<string, number>())

  const loadExam = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    const started = await startAttempt(attemptId)
    if (started.error || !started.data) {
      setLoading(false)
      setLoadError(true)
      return
    }
    const start = started.data
    setSessionId(start.session_id)
    setEndsAt(start.exam_ends_at)
    setRemainingSeconds(start.remaining_seconds)
    setTakeover(start.was_takeover)
    const loaded = await getExamQuestions(attemptId, start.session_id)
    if (loaded.error || !loaded.data) {
      setLoading(false)
      setLoadError(true)
      return
    }
    setData(loaded.data)
    const initial: Record<string, DraftAnswer> = {}
    for (const answer of loaded.data.answers ?? []) initial[answer.question_id] = { mcq_answer: answer.mcq_answer, essay_answer: answer.essay_answer }
    const pending = readQueuedAnswers(attemptId, start.session_id)
    for (const answer of pending) initial[answer.question_id] = { mcq_answer: answer.mcq_answer, essay_answer: answer.essay_answer }
    setAnswers(initial)
    setSaveStates(Object.fromEntries(pending.map(({ question_id }) => [question_id, 'unsynced' as const])))
    setLoading(false)
  }, [attemptId])

  useEffect(() => {
    let active = true
    const timeouts = pendingSaves.current
    void Promise.resolve().then(() => { if (active) void loadExam() })
    return () => {
      active = false
      for (const timeout of timeouts.values()) window.clearTimeout(timeout)
    }
  }, [loadExam])

  useEffect(() => {
    if (!endsAt) return
    const update = () => setRemainingSeconds(Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [endsAt])

  useEffect(() => {
    if (remainingSeconds !== 0 || submitted) return
    for (const timeout of pendingSaves.current.values()) window.clearTimeout(timeout)
    pendingSaves.current.clear()
    const redirect = window.setTimeout(() => router.replace('/student'), 3_000)
    return () => window.clearTimeout(redirect)
  }, [remainingSeconds, router, submitted])

  const persistAnswer = useCallback(async (payload: SaveAnswerInput) => {
    if (!navigator.onLine) {
      try { queueAnswer(payload) } catch { /* Keep the edited answer visible; the unsynced state warns about storage failure. */ }
      setSaveStates((current) => ({ ...current, [payload.question_id]: 'unsynced' }))
      return false
    }
    setSaveStates((current) => ({ ...current, [payload.question_id]: 'saving' }))
    const result = await saveAnswer(payload)
    if (result.error || !result.data) {
      if (result.error?.code === 'access_denied') {
        setSessionInvalid(true)
        setSaveStates((current) => ({ ...current, [payload.question_id]: 'stale' }))
        return false
      }
      try { queueAnswer(payload) } catch { /* The unsynced indicator still prevents accidental submission. */ }
      setSaveStates((current) => ({ ...current, [payload.question_id]: 'unsynced' }))
      return false
    }
    removeQueuedAnswer(payload.attempt_id, payload.session_id, payload.question_id)
    setSaveStates((current) => ({ ...current, [payload.question_id]: 'saved' }))
    return true
  }, [])

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine || !sessionId) return
    for (const payload of readQueuedAnswers(attemptId, sessionId)) {
      const saved = await persistAnswer(payload)
      if (!saved) return
    }
  }, [attemptId, persistAnswer, sessionId])

  useEffect(() => {
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
  }, [flushQueue])

  const changeAnswer = (question: ExamQuestion, answer: DraftAnswer, saveImmediately = false) => {
    if (!sessionId) return
    setAnswers((current) => ({ ...current, [question.id]: answer }))
    setSaveStates((current) => ({ ...current, [question.id]: 'saving' }))
    const previous = pendingSaves.current.get(question.id)
    if (previous !== undefined) window.clearTimeout(previous)
    const payload = { attempt_id: attemptId, session_id: sessionId, question_id: question.id, ...answer }
    if (saveImmediately) {
      pendingSaves.current.delete(question.id)
      void persistAnswer(payload)
      return
    }
    const timeout = window.setTimeout(() => {
      pendingSaves.current.delete(question.id)
      void persistAnswer(payload)
    }, question.type === 'essay' ? 800 : 350)
    pendingSaves.current.set(question.id, timeout)
  }

  const onSubmit = async () => {
    if (!sessionId) return
    setSubmitLoading(true)
    setSubmitError(false)
    const result = await submitAttempt(attemptId, sessionId)
    if (result.error || !result.data) setSubmitError(true)
    else setSubmitted(true)
    setSubmitLoading(false)
  }

  const hasUnsynced = Object.values(saveStates).some((state) => state === 'unsynced' || state === 'saving')
  const timeExpired = remainingSeconds === 0
  const inputsDisabled = timeExpired || sessionInvalid
  const title = examTitle ?? t('student.exam.examTitle')

  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/student" className="text-sm text-primary-700 hover:underline dark:text-primary-300">{t('common.backArrow')} {t('student.exam.backToDashboard')}</Link><h1 className="mt-3 text-2xl font-bold">{title}</h1></div>
      {endsAt && !submitted && <CountdownTimer endsAt={endsAt} />}
    </header>

    {loading && <p role="status">{t('student.exam.loadingExam')}</p>}
    {loadError && !loading && <Card className="space-y-4 p-6" role="alert"><p>{t('student.exam.loadError')}</p><Button variant="secondary" onClick={() => void loadExam()}>{t('common.retry')}</Button></Card>}
    {takeover && !loading && !loadError && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{t('student.exam.takeover')}</div>}
    {sessionInvalid && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{t('student.exam.sessionExpired')}</div>}
    {timeExpired && !submitted && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">{t('student.exam.timeUp')}</div>}
    {submitted && <Card className="space-y-4 p-6"><h2 className="text-xl font-semibold">{t('student.exam.submittedTitle')}</h2><p>{t('student.exam.submittedDescription')}</p><Link href="/student"><Button>{t('student.exam.backToDashboard')}</Button></Link></Card>}

    {!loading && !loadError && !submitted && data && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-neutral-600 dark:text-neutral-300">{t('student.exam.questionCount').replace('{count}', String(data.questions.length))}</p><p className="text-sm text-neutral-600 dark:text-neutral-300">{t('student.exam.autosaveHint')}</p></div>
      <section className="space-y-4" aria-label={t('student.exam.questions')}>
        {data.questions.map((question, index) => {
          const answer = answers[question.id] ?? { mcq_answer: null, essay_answer: null }
          return <Card key={question.id} className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 flex-1 text-lg font-semibold"><span className="me-2 text-neutral-600 dark:text-neutral-300">{index + 1}.</span><SafeText value={question.text} /></h2><span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs dark:bg-neutral-800">{question.points.toLocaleString(language)} {t('student.exam.points')}</span></div>
            {question.type === 'mcq'
              ? <McqQuestion question={question} value={answer.mcq_answer} onChange={(value) => changeAnswer(question, { mcq_answer: value, essay_answer: null })} disabled={inputsDisabled} labels={{ choices: t('student.exam.choices'), clear: t('student.exam.clearAnswer') }} />
              : <EssayQuestion questionId={question.id} value={answer.essay_answer ?? ''} onChange={(value) => changeAnswer(question, { mcq_answer: null, essay_answer: value })} onBlur={(value) => changeAnswer(question, { mcq_answer: null, essay_answer: value }, true)} disabled={inputsDisabled} />}
            <div className="flex justify-end"><SaveStatus state={saveStates[question.id] ?? 'idle'} /></div>
          </Card>
        })}
      </section>
      {submitError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('student.exam.submitError')}</p>}
      {hasUnsynced && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{t('student.exam.syncBeforeSubmit')}</p>}
      <div className="flex justify-end border-t border-neutral-200 pt-5 dark:border-neutral-800"><SubmitExam disabled={hasUnsynced || inputsDisabled} loading={submitLoading} onSubmit={onSubmit} /></div>
    </>}
  </main>
}

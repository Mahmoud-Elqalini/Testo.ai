'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SafeText } from '@/components/shared/SafeText'
import { WorkspaceLayout } from '@/components/shared/WorkspaceLayout'
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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reviewedQuestions, setReviewedQuestions] = useState<string[]>([])
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
  const answeredCount = data?.questions.filter((question) => {
    const answer = answers[question.id]
    return Boolean(answer?.mcq_answer || answer?.essay_answer?.trim())
  }).length ?? 0
  const currentQuestion = data?.questions[currentIndex]
  const numberLabel = (value: number) => new Intl.NumberFormat(language).format(value)

  return <WorkspaceLayout role="student" active="exam-room" focusMode><main className="testo-exam-room mx-auto w-full max-w-none space-y-6">
    <header className="testo-exam-heading">
      <div><Link href="/student" className="text-sm text-primary-text hover:underline dark:text-primary-text">{t('common.backArrow')} {t('student.exam.backToDashboard')}</Link><p className="mt-3 testo-exam-eyebrow">{t('student.exam.questionCount').replace('{count}', numberLabel(data?.questions.length ?? 0))}</p><h1 className="mt-1 text-2xl font-bold">{title}</h1></div>
      <div className="testo-exam-secure">◈ <span>{t('student.exam.autosaveHint')}</span></div>
    </header>

    {loading && <p role="status">{t('student.exam.loadingExam')}</p>}
    {loadError && !loading && <Card className="space-y-4 p-6" role="alert"><p>{t('student.exam.loadError')}</p><Button variant="secondary" onClick={() => void loadExam()}>{t('common.retry')}</Button></Card>}
    {takeover && !loading && !loadError && <div role="status" className="rounded-lg border border-warning-border bg-warning-soft p-4 text-warning-text dark:border-warning-border dark:bg-warning-soft/40 dark:text-warning-text">{t('student.exam.takeover')}</div>}
    {sessionInvalid && <div role="alert" className="rounded-lg border border-warning-border bg-warning-soft p-4 text-warning-text dark:border-warning-border dark:bg-warning-soft/40 dark:text-warning-text">{t('student.exam.sessionExpired')}</div>}
    {timeExpired && !submitted && <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft p-4 text-danger-text dark:border-danger-border dark:bg-danger-soft/40 dark:text-danger-text">{t('student.exam.timeUp')}</div>}
    {submitted && <Card className="space-y-4 p-6"><h2 className="text-xl font-semibold">{t('student.exam.submittedTitle')}</h2><p>{t('student.exam.submittedDescription')}</p><Link href="/student"><Button>{t('student.exam.backToDashboard')}</Button></Link></Card>}

    {!loading && !loadError && !submitted && data && <>
      <div className="testo-exam-statusbar"><span>{t('student.exam.questionCount').replace('{count}', numberLabel(data.questions.length))}</span><span className="testo-exam-autosave">● {t('student.exam.autosaveHint')}</span>{endsAt && !submitted && <CountdownTimer endsAt={endsAt} />}</div>
      {currentQuestion && <div className="testo-exam-layout">
        <section className="testo-question-panel" aria-label={t('student.exam.questions')}>
          <div className="testo-question-head"><div><p>{t('student.exam.questionOf').replace('{current}', numberLabel(currentIndex + 1)).replace('{total}', numberLabel(data.questions.length))}</p><div className="testo-question-progress"><span style={{ width: `${((currentIndex + 1) / data.questions.length) * 100}%` }} /></div></div><div className="testo-question-tools"><span>{currentQuestion.points.toLocaleString(language)} {t('student.exam.points')}</span><button type="button" aria-pressed={reviewedQuestions.includes(currentQuestion.id)} onClick={() => setReviewedQuestions((items) => items.includes(currentQuestion.id) ? items.filter((id) => id !== currentQuestion.id) : [...items, currentQuestion.id])}>{reviewedQuestions.includes(currentQuestion.id) ? t('student.exam.unmarkReview') : t('student.exam.markReview')}</button></div></div>
          <div className="testo-question-body"><h2><SafeText value={currentQuestion.text} /></h2><p className="testo-question-hint">{t('student.exam.choices')}</p>
            {currentQuestion.type === 'mcq'
              ? <McqQuestion question={currentQuestion} value={answers[currentQuestion.id]?.mcq_answer ?? null} onChange={(value) => changeAnswer(currentQuestion, { mcq_answer: value, essay_answer: null })} disabled={inputsDisabled} labels={{ choices: t('student.exam.choices'), clear: t('student.exam.clearAnswer') }} />
              : <EssayQuestion questionId={currentQuestion.id} value={answers[currentQuestion.id]?.essay_answer ?? ''} onChange={(value) => changeAnswer(currentQuestion, { mcq_answer: null, essay_answer: value })} onBlur={(value) => changeAnswer(currentQuestion, { mcq_answer: null, essay_answer: value }, true)} disabled={inputsDisabled} />}
            <div className="mt-5 flex justify-end"><SaveStatus state={saveStates[currentQuestion.id] ?? 'idle'} /></div>
          </div>
          <footer className="testo-question-footer"><Button variant="secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}>{t('student.exam.previous')}</Button><span>{numberLabel(answeredCount)} / {numberLabel(data.questions.length)} · {t('student.exam.autosaveHint')}</span><Button disabled={currentIndex >= data.questions.length - 1} onClick={() => setCurrentIndex((index) => Math.min(data.questions.length - 1, index + 1))}>{t('student.exam.next')}</Button></footer>
        </section>
        <aside className="testo-question-nav"><div className="testo-question-nav-head"><div><h2>{t('student.exam.questions')}</h2><p>{numberLabel(answeredCount)} / {numberLabel(data.questions.length)}</p></div><strong>{Math.round(answeredCount / data.questions.length * 100)}%</strong></div><div className="testo-question-numbers">{data.questions.map((question, index) => {
          const answer = answers[question.id]
          const answered = Boolean(answer?.mcq_answer || answer?.essay_answer?.trim())
          const marked = reviewedQuestions.includes(question.id)
          return <button key={question.id} type="button" aria-label={`${t('student.exam.questions')} ${numberLabel(index + 1)}${marked ? `, ${t('student.exam.markReview')}` : ''}`} aria-current={index === currentIndex ? 'step' : undefined} onClick={() => setCurrentIndex(index)} className={`${index === currentIndex ? 'is-current ' : ''}${answered ? 'is-answered ' : ''}${marked ? 'is-reviewed' : ''}`}>{numberLabel(index + 1)}{marked && <i />}</button>
        })}</div><div className="testo-question-legend"><span><i className="is-filled" />{t('student.exam.answered')}</span><span><i />{t('student.exam.unanswered')}</span></div><div className="testo-question-completion"><strong>{numberLabel(answeredCount)} / {numberLabel(data.questions.length)}</strong><span>{t('student.exam.autosaveHint')}</span></div><div className="testo-question-submit"><SubmitExam disabled={hasUnsynced || inputsDisabled} loading={submitLoading} onSubmit={onSubmit} /></div></aside>
      </div>}
      {submitError && <p role="alert" className="text-sm text-danger-text dark:text-danger-text">{t('student.exam.submitError')}</p>}
      {hasUnsynced && <p role="status" className="text-sm text-warning-text dark:text-warning-text">{t('student.exam.syncBeforeSubmit')}</p>}
    </>}
  </main></WorkspaceLayout>
}

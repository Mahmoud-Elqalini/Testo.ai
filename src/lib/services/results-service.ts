import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeError, type TestoError } from '../errors'
import { createClient } from '../supabase/client'
import type { AttemptStatus, McqChoice, QuestionType } from '../types'

export interface StudentResultQuestion {
  id: string
  type: QuestionType
  text: string
  order: number
  points: number
  normalizedScore: number
  earnedPoints: number
  selectedChoice: string | null
  correctChoice: string | null
  choices: McqChoice[]
}

export type StudentResult = {
  status: 'pending'
  attemptId: string
  attemptStatus: AttemptStatus
  examTitle: string
  finishedAt: string | null
} | {
  status: 'graded'
  attemptId: string
  attemptStatus: AttemptStatus
  examTitle: string
  finishedAt: string | null
  questions: StudentResultQuestion[]
  earnedPoints: number
  maximumPoints: number
  percentage: number
}

export interface ResultsServiceResult {
  data: StudentResult | null
  error: TestoError | null
}

type RawResultQuestion = {
  id: string
  type: QuestionType
  text: string
  order: number
  points: number
  normalized_score: number
  selected_choice: string | null
  correct_choice: string | null
  choices: McqChoice[]
}

type RawStudentResult = {
  status: 'pending' | 'graded'
  attempt_id: string
  attempt_status: AttemptStatus
  exam_title: string
  finished_at: string | null
  questions?: RawResultQuestion[]
}

function mapResult(raw: RawStudentResult): StudentResult {
  const common = {
    attemptId: raw.attempt_id,
    attemptStatus: raw.attempt_status,
    examTitle: raw.exam_title,
    finishedAt: raw.finished_at,
  }

  if (raw.status === 'pending') return { ...common, status: 'pending' }

  const questions = (raw.questions ?? []).map((question) => ({
    id: question.id,
    type: question.type,
    text: question.text,
    order: question.order,
    points: question.points,
    normalizedScore: question.normalized_score,
    earnedPoints: question.normalized_score * question.points,
    selectedChoice: question.selected_choice,
    correctChoice: question.correct_choice,
    choices: question.choices ?? [],
  }))
  const earnedPoints = questions.reduce((total, question) => total + question.earnedPoints, 0)
  const maximumPoints = questions.reduce((total, question) => total + question.points, 0)

  return {
    ...common,
    status: 'graded',
    questions,
    earnedPoints,
    maximumPoints,
    percentage: maximumPoints === 0 ? 0 : Math.round((earnedPoints / maximumPoints) * 10_000) / 100,
  }
}

export async function getStudentResult(
  attemptId: string,
  client: SupabaseClient = createClient(),
): Promise<ResultsServiceResult> {
  if (!attemptId) return { data: null, error: { code: 'validation_error', message: 'Attempt id is required.' } }

  try {
    const { data, error } = await client.rpc('fn_get_student_attempt_result', { p_attempt_id: attemptId })
    if (error) throw error

    const raw = data as RawStudentResult | { error: string } | null
    if (raw && 'error' in raw) return { data: null, error: normalizeError({ error: raw.error }) }
    if (!raw || (raw.status !== 'pending' && raw.status !== 'graded')) {
      return { data: null, error: { code: 'internal_error', message: 'Could not load this result.' } }
    }
    return { data: mapResult(raw), error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

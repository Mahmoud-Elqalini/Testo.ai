import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeError, type TestoError } from '../errors'
import { createClient } from '../supabase/client'
import type { Exam, ExamAttempt, Group } from '../types'
import type { JoinedGroup } from './group-service'

export type DashboardExam = Pick<Exam, 'id' | 'title' | 'start_time' | 'duration_minutes'> & {
  is_published?: boolean
}

export interface DashboardData {
  fullName: string
  groups: Group[]
  joinedGroups: JoinedGroup[]
  exams: DashboardExam[]
  sectionErrors: {
    ownedGroups: boolean
    joinedGroups: boolean
    exams: boolean
  }
}

export type DashboardDataResult =
  | { data: DashboardData; error: null; unauthenticated: false }
  | { data: null; error: TestoError | null; unauthenticated: boolean }

export interface StudentDashboardAttempt extends ExamAttempt {
  exam: Pick<Exam, 'title' | 'start_time' | 'duration_minutes'> | null
}

export type UpcomingExam = Pick<Exam, 'id' | 'title' | 'start_time' | 'duration_minutes'> & {
  active: boolean
}

export interface StudentDashboardData {
  attempts: StudentDashboardAttempt[]
  upcoming: UpcomingExam[]
}

export interface DashboardServiceResult<T> {
  data: T | null
  error: TestoError | null
}

function fetchOwnedGroups(client: SupabaseClient, userId: string) {
  return client.from('groups')
    .select('*')
    .eq('owner_id', userId)
    .order('name', { ascending: true })
}

function fetchJoinedGroups(client: SupabaseClient) {
  return client.rpc('list_my_joined_groups')
}

function fetchOwnedExams(client: SupabaseClient, userId: string) {
  return client.from('exams')
    .select('id, title, start_time, duration_minutes, is_published')
    .eq('owner_id', userId)
    .order('start_time', { ascending: false })
}

function fetchParticipantExams(client: SupabaseClient, userId: string) {
  return client.from('exams')
    .select('id, title, start_time, duration_minutes')
    .eq('is_published', true)
    .neq('owner_id', userId)
    .order('start_time', { ascending: true })
}

function mergeDashboardExams(
  owned: DashboardExam[],
  participant: DashboardExam[],
  now: number,
): DashboardExam[] {
  const examsById = new Map<string, DashboardExam>(owned.map((exam) => [exam.id, exam]))
  for (const exam of participant) {
    const expiresAt = Date.parse(exam.start_time) + exam.duration_minutes * 60_000
    if (expiresAt > now && !examsById.has(exam.id)) examsById.set(exam.id, exam)
  }
  return [...examsById.values()]
}

export async function getDashboardData(
  client: SupabaseClient = createClient(),
  now: () => number = Date.now,
): Promise<DashboardDataResult> {
  try {
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return { data: null, error: null, unauthenticated: true }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) {
      return {
        data: null,
        error: { code: 'internal_error', message: 'Could not load this dashboard.' },
        unauthenticated: false,
      }
    }

    const [groupResult, joinedGroupResult, ownedExamResult, participantExamResult] = await Promise.all([
      fetchOwnedGroups(client, user.id),
      fetchJoinedGroups(client),
      fetchOwnedExams(client, user.id),
      fetchParticipantExams(client, user.id),
    ])
    const groups = (groupResult.data ?? []) as Group[]
    const joinedGroups = (joinedGroupResult.data ?? []) as JoinedGroup[]
    const exams = mergeDashboardExams(
      (ownedExamResult.data ?? []) as DashboardExam[],
      (participantExamResult.data ?? []) as DashboardExam[],
      now(),
    )

    return {
      data: {
        fullName: profile.full_name ?? '',
        groups,
        joinedGroups,
        exams,
        sectionErrors: {
          ownedGroups: Boolean(groupResult.error),
          joinedGroups: Boolean(joinedGroupResult.error),
          exams: Boolean(ownedExamResult.error || participantExamResult.error),
        },
      },
      error: null,
      unauthenticated: false,
    }
  } catch (error) {
    return { data: null, error: normalizeError(error), unauthenticated: false }
  }
}

export async function getStudentDashboardData(
  client: SupabaseClient = createClient(),
): Promise<DashboardServiceResult<StudentDashboardData>> {
  try {
    const [attemptResult, examResult] = await Promise.all([
      client.from('exam_attempts')
        .select('id,exam_id,student_id,status,started_at,finished_at,session_id,exam:exams(title,start_time,duration_minutes)')
        .order('started_at', { ascending: false }),
      client.from('exams')
        .select('id,title,start_time,duration_minutes')
        .eq('is_published', true)
        .order('start_time', { ascending: true }),
    ])
    if (attemptResult.error) throw attemptResult.error
    if (examResult.error) throw examResult.error

    const now = Date.now()
    return {
      data: {
        attempts: (attemptResult.data ?? []) as unknown as StudentDashboardAttempt[],
        upcoming: ((examResult.data ?? []) as Array<Pick<Exam, 'id' | 'title' | 'start_time' | 'duration_minutes'>>)
          .filter((exam) => Date.parse(exam.start_time) + exam.duration_minutes * 60_000 > now)
          .map((exam) => ({ ...exam, active: Date.parse(exam.start_time) <= now })),
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

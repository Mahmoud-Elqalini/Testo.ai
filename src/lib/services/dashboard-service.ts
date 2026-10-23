import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeError, type TestoError } from '../errors'
import { createClient } from '../supabase/client'
import type { Exam, ExamAttempt, Group, UserRole } from '../types'
import type { JoinedGroup } from './group-service'

export type DashboardExam = Pick<Exam, 'id' | 'title' | 'start_time' | 'duration_minutes'> & {
  is_published?: boolean
}

export interface DashboardData {
  role: UserRole
  fullName: string
  groups: Group[]
  joinedGroups: JoinedGroup[]
  exams: DashboardExam[]
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

export async function getDashboardData(
  client: SupabaseClient = createClient(),
): Promise<DashboardDataResult> {
  try {
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return { data: null, error: null, unauthenticated: true }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('role, full_name')
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

    let groups: Group[] = []
    let joinedGroups: JoinedGroup[] = []
    let exams: DashboardExam[] = []

    if (profile.role === 'admin') {
      const [groupResult, examResult] = await Promise.all([
        client.from('groups').select('*').order('name', { ascending: true }),
        client.from('exams').select('*').order('start_time', { ascending: false }),
      ])
      if (groupResult.error) throw groupResult.error
      if (examResult.error) throw examResult.error
      groups = (groupResult.data ?? []) as Group[]
      exams = (examResult.data ?? []) as DashboardExam[]
    } else {
      const [examResult, groupResult] = await Promise.all([
        client.from('exams')
          .select('id, title, start_time, duration_minutes')
          .eq('is_published', true)
          .order('start_time', { ascending: true }),
        client.rpc('list_my_joined_groups'),
      ])
      if (examResult.error) throw examResult.error
      if (groupResult.error) throw groupResult.error
      const currentTime = Date.now()
      exams = ((examResult.data ?? []) as DashboardExam[]).filter((exam) =>
        Date.parse(exam.start_time) + exam.duration_minutes * 60_000 > currentTime,
      )
      joinedGroups = (groupResult.data ?? []) as JoinedGroup[]
    }

    return {
      data: {
        role: profile.role as UserRole,
        fullName: profile.full_name ?? '',
        groups,
        joinedGroups,
        exams,
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

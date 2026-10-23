import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDashboardData, getStudentDashboardData } from '@/lib/services/dashboard-service'

type QueryResult = { data: unknown; error: unknown | null }

function query(result: QueryResult) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

function clientMock({
  user = { id: 'user-1' },
  authError = null,
  tableResults = {},
  rpcResult = { data: [], error: null },
}: {
  user?: { id: string } | null
  authError?: unknown
  tableResults?: Record<string, QueryResult | QueryResult[]>
  rpcResult?: QueryResult
} = {}) {
  const queries = new Map<string, QueryResult[]>()
  for (const [table, results] of Object.entries(tableResults)) {
    queries.set(table, Array.isArray(results) ? [...results] : [results])
  }
  const from = vi.fn((table: string) => query(queries.get(table)?.shift() ?? { data: [], error: null }))
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError })
  return {
    client: { auth: { getUser }, from, rpc } as unknown as SupabaseClient,
    from,
    rpc,
    getUser,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('dashboard services', () => {
  it('loads admin profile, groups, and exams', async () => {
    const mock = clientMock({
      tableResults: {
        profiles: { data: { role: 'admin', full_name: 'Teacher' }, error: null },
        groups: { data: [{ id: 'group-1', name: 'Class A', admin_id: 'user-1' }], error: null },
        exams: { data: [{ id: 'exam-1', title: 'Math', start_time: '2026-10-24T10:00:00Z', duration_minutes: 60, is_published: false }], error: null },
      },
    })

    await expect(getDashboardData(mock.client)).resolves.toMatchObject({
      data: {
        role: 'admin',
        fullName: 'Teacher',
        groups: [{ id: 'group-1', name: 'Class A', admin_id: 'user-1' }],
        joinedGroups: [],
        exams: [{ id: 'exam-1', is_published: false }],
      },
      error: null,
      unauthenticated: false,
    })
    expect(mock.from).toHaveBeenNthCalledWith(1, 'profiles')
    expect(mock.from).toHaveBeenNthCalledWith(2, 'groups')
    expect(mock.from).toHaveBeenNthCalledWith(3, 'exams')
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('loads student dashboard data and excludes expired exams', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-23T12:00:00Z').getTime())
    const mock = clientMock({
      tableResults: {
        profiles: { data: { role: 'student', full_name: null }, error: null },
        exams: [
          { data: [
            { id: 'expired', title: 'Expired', start_time: '2026-10-23T10:00:00Z', duration_minutes: 60 },
            { id: 'active', title: 'Active', start_time: '2026-10-23T11:30:00Z', duration_minutes: 60 },
            { id: 'future', title: 'Future', start_time: '2026-10-24T10:00:00Z', duration_minutes: 60 },
          ], error: null },
        ],
      },
      rpcResult: { data: [{ group_id: 'group-1', group_name: 'Class A' }], error: null },
    })

    const dashboard = await getDashboardData(mock.client)
    expect(dashboard).toMatchObject({
      data: {
        role: 'student',
        fullName: '',
        groups: [],
        joinedGroups: [{ group_id: 'group-1', group_name: 'Class A' }],
        exams: [{ id: 'active' }, { id: 'future' }],
      },
      error: null,
      unauthenticated: false,
    })
    expect(mock.rpc).toHaveBeenCalledWith('list_my_joined_groups')
  })

  it('reports an unauthenticated dashboard separately from data errors', async () => {
    const mock = clientMock({ user: null })

    await expect(getDashboardData(mock.client)).resolves.toEqual({
      data: null,
      error: null,
      unauthenticated: true,
    })
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('loads student attempts and upcoming exam status', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-23T12:00:00Z').getTime())
    const mock = clientMock({
      tableResults: {
        exam_attempts: { data: [{ id: 'attempt-1', status: 'in_progress' }], error: null },
        exams: { data: [
          { id: 'active', title: 'Active', start_time: '2026-10-23T11:30:00Z', duration_minutes: 60 },
          { id: 'future', title: 'Future', start_time: '2026-10-24T10:00:00Z', duration_minutes: 60 },
          { id: 'expired', title: 'Expired', start_time: '2026-10-23T10:00:00Z', duration_minutes: 60 },
        ], error: null },
      },
    })

    await expect(getStudentDashboardData(mock.client)).resolves.toMatchObject({
      data: {
        attempts: [{ id: 'attempt-1', status: 'in_progress' }],
        upcoming: [{ id: 'active', active: true }, { id: 'future', active: false }],
      },
      error: null,
    })
    expect(mock.from).toHaveBeenNthCalledWith(1, 'exam_attempts')
    expect(mock.from).toHaveBeenNthCalledWith(2, 'exams')
  })

  it('normalizes student dashboard query errors', async () => {
    const failure = new Error('database unavailable')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mock = clientMock({
      tableResults: {
        exam_attempts: { data: null, error: failure },
        exams: { data: [], error: null },
      },
    })

    await expect(getStudentDashboardData(mock.client)).resolves.toMatchObject({
      data: null,
      error: { code: 'unknown_error', message: 'database unavailable' },
    })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDashboardData, getStudentDashboardData } from '@/lib/services/dashboard-service'

type QueryResult = { data: unknown; error: unknown | null }
type QueryFilter = { method: 'eq' | 'neq'; column: string; value: unknown }
type QueryCall = { table: string; filters: QueryFilter[] }

function query(result: QueryResult, call: QueryCall) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'order']) {
    builder[method] = vi.fn(() => builder)
  }
  for (const method of ['eq', 'neq'] as const) {
    builder[method] = vi.fn((column: string, value: unknown) => {
      call.filters.push({ method, column, value })
      return builder
    })
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
  const queryCalls: QueryCall[] = []
  for (const [table, results] of Object.entries(tableResults)) {
    queries.set(table, Array.isArray(results) ? [...results] : [results])
  }
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] as QueryFilter[] }
    queryCalls.push(call)
    return query(queries.get(table)?.shift() ?? { data: [], error: null }, call)
  })
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError })
  return {
    client: { auth: { getUser }, from, rpc } as unknown as SupabaseClient,
    from, queryCalls,
    rpc,
    getUser,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('dashboard services', () => {
  it('loads owned and joined activities without a fixed account role', async () => {
    const now = new Date('2026-10-23T12:00:00Z').getTime()
    const mock = clientMock({
      tableResults: {
        profiles: { data: { full_name: 'Account owner' }, error: null },
        groups: { data: [{ id: 'group-1', name: 'Class A', owner_id: 'user-1' }], error: null },
        exams: [
          { data: [
            { id: 'exam-owned-expired', title: 'Past draft', start_time: '2026-10-23T10:00:00Z', duration_minutes: 60, is_published: false },
            { id: 'exam-duplicate', title: 'Owned draft wins', start_time: '2026-10-23T11:30:00Z', duration_minutes: 60, is_published: false },
          ], error: null },
          { data: [
            { id: 'exam-duplicate', title: 'Participant duplicate loses', start_time: '2026-10-23T11:30:00Z', duration_minutes: 60 },
            { id: 'exam-active', title: 'Active exam', start_time: '2026-10-23T11:30:00Z', duration_minutes: 60 },
            { id: 'exam-future', title: 'Future exam', start_time: '2026-10-24T10:00:00Z', duration_minutes: 60 },
            { id: 'exam-expired', title: 'Expired exam', start_time: '2026-10-23T10:00:00Z', duration_minutes: 60 },
          ], error: null },
        ],
      },
      rpcResult: { data: [{ group_id: 'joined-group', group_name: 'Joined class' }], error: null },
    })

    const result = await getDashboardData(mock.client, () => now)
    expect(result).toMatchObject({
      data: {
        fullName: 'Account owner',
        groups: [{ id: 'group-1', name: 'Class A', owner_id: 'user-1' }],
        joinedGroups: [{ group_id: 'joined-group', group_name: 'Joined class' }],
        exams: [
          { id: 'exam-owned-expired', is_published: false },
          { id: 'exam-duplicate', title: 'Owned draft wins', is_published: false },
          { id: 'exam-active' },
          { id: 'exam-future' },
        ],
      },
      error: null,
      unauthenticated: false,
    })
    expect(result.data).not.toHaveProperty('role')
    expect(mock.from).toHaveBeenNthCalledWith(1, 'profiles')
    expect(mock.from).toHaveBeenNthCalledWith(2, 'groups')
    expect(mock.from).toHaveBeenNthCalledWith(3, 'exams')
    expect(mock.from).toHaveBeenNthCalledWith(4, 'exams')
    expect(mock.rpc).toHaveBeenCalledWith('list_my_joined_groups')
    const groupQuery = mock.queryCalls.find((call) => call.table === 'groups')
    expect(groupQuery?.filters).toContainEqual({ method: 'eq', column: 'owner_id', value: 'user-1' })
    const [ownedExamQuery, participantExamQuery] = mock.queryCalls.filter((call) => call.table === 'exams')
    expect(ownedExamQuery?.filters).toContainEqual({ method: 'eq', column: 'owner_id', value: 'user-1' })
    expect(participantExamQuery?.filters).toContainEqual({ method: 'eq', column: 'is_published', value: true })
    expect(participantExamQuery?.filters).toContainEqual({ method: 'neq', column: 'owner_id', value: 'user-1' })
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

  it('keeps other dashboard sections available when one relationship query fails', async () => {
    const mock = clientMock({
      tableResults: {
        profiles: { data: { full_name: 'Account owner' }, error: null },
        groups: { data: null, error: new Error('groups unavailable') },
        exams: [
          { data: [{ id: 'exam-1', title: 'Available exam', start_time: '2026-10-24T10:00:00Z', duration_minutes: 30, is_published: true }], error: null },
          { data: [], error: null },
        ],
      },
      rpcResult: { data: [{ group_id: 'joined-1', group_name: 'Joined group' }], error: null },
    })

    const result = await getDashboardData(mock.client)

    expect(result).toMatchObject({
      data: {
        groups: [],
        joinedGroups: [{ group_id: 'joined-1', group_name: 'Joined group' }],
        exams: [{ id: 'exam-1', title: 'Available exam' }],
        sectionErrors: { ownedGroups: true, joinedGroups: false, exams: false },
      },
      error: null,
      unauthenticated: false,
    })
  })

  it('reports joined-group query failures only on the joined-groups section', async () => {
    const mock = clientMock({
      tableResults: {
        profiles: { data: { full_name: 'Account owner' }, error: null },
        groups: { data: [], error: null },
        exams: [
          { data: [], error: null },
          { data: [], error: null },
        ],
      },
      rpcResult: { data: null, error: new Error('joined groups unavailable') },
    })

    const result = await getDashboardData(mock.client, () => 0)

    expect(result).toMatchObject({
      data: { sectionErrors: { ownedGroups: false, joinedGroups: true, exams: false } },
      error: null,
      unauthenticated: false,
    })
  })

  it.each(['owned', 'participant'] as const)('reports a %s exam query failure on the exams section', async (failedQuery) => {
    const mock = clientMock({
      tableResults: {
        profiles: { data: { full_name: 'Account owner' }, error: null },
        groups: { data: [], error: null },
        exams: [
          { data: failedQuery === 'owned' ? null : [], error: failedQuery === 'owned' ? new Error('owned exams unavailable') : null },
          { data: failedQuery === 'participant' ? null : [], error: failedQuery === 'participant' ? new Error('participant exams unavailable') : null },
        ],
      },
      rpcResult: { data: [], error: null },
    })

    const result = await getDashboardData(mock.client, () => 0)

    expect(result).toMatchObject({
      data: { sectionErrors: { ownedGroups: false, joinedGroups: false, exams: true } },
      error: null,
      unauthenticated: false,
    })
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

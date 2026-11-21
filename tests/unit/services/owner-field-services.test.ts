import { beforeEach, describe, expect, it, vi } from 'vitest'

const { supabaseClient, fromMock, insertMock, selectMock, singleMock, getUserMock } = vi.hoisted(() => ({
  supabaseClient: { auth: { getUser: vi.fn() }, from: vi.fn() },
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  getUserMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => supabaseClient,
}))

describe('owner field service payloads', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    supabaseClient.auth.getUser = getUserMock
    supabaseClient.from = fromMock
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    fromMock.mockReturnValue({ insert: insertMock })
    insertMock.mockReturnValue({ select: selectMock })
    selectMock.mockReturnValue({ single: singleMock })
  })

  it('creates groups with the authenticated owner_id', async () => {
    const { createGroup } = await import('@/lib/services/group-service')
    singleMock.mockResolvedValue({ data: { id: 'group-1', name: 'Class A', owner_id: 'user-1' }, error: null })

    const result = await createGroup({ name: 'Class A' })

    expect(result.error).toBeNull()
    expect(fromMock).toHaveBeenCalledWith('groups')
    expect(insertMock).toHaveBeenCalledWith({ name: 'Class A', owner_id: 'user-1' })
  })

  it('creates exams with the authenticated owner_id', async () => {
    const { createExam } = await import('@/lib/services/exam-service')
    singleMock.mockResolvedValue({
      data: {
        id: 'exam-1',
        title: 'Math',
        start_time: '2026-12-01T10:00:00.000Z',
        duration_minutes: 60,
        owner_id: 'user-1',
      },
      error: null,
    })

    const result = await createExam({
      title: 'Math',
      start_time: '2026-12-01T10:00:00.000Z',
      duration_minutes: 60,
    })

    expect(result.error).toBeNull()
    expect(fromMock).toHaveBeenCalledWith('exams')
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 'user-1' }))
    expect(insertMock.mock.calls[0][0]).not.toHaveProperty('admin_id')
  })
})

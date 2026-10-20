import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserPreferences, updateUserPreferences } from '@/lib/services/preferences-service'

function createClientMock(result: { data?: unknown; error?: unknown } = {}) {
  const profile = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : null
  let pendingUpdates: Record<string, unknown> = {}
  const maybeSingle = vi.fn().mockImplementation(async () => ({ data: profile, error: result.error ?? null }))
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const updateEq = vi.fn().mockImplementation(async () => {
    if (profile) Object.assign(profile, pendingUpdates)
    return { error: result.error ?? null }
  })
  const update = vi.fn((updates: Record<string, unknown>) => {
    pendingUpdates = updates
    return { eq: updateEq }
  })
  const from = vi.fn(() => ({ select, update }))

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    eq,
    maybeSingle,
    update,
    updateEq,
  }
}

describe('preferences service', () => {
  it('loads the saved language and theme for a profile', async () => {
    const mock = createClientMock({ data: { preferred_language: 'ar', preferred_theme: 'dark' } })

    await expect(getUserPreferences('user-1', mock.client)).resolves.toEqual({
      preferred_language: 'ar',
      preferred_theme: 'dark',
    })
    expect(mock.from).toHaveBeenCalledWith('profiles')
    expect(mock.select).toHaveBeenCalledWith('preferred_language, preferred_theme')
    expect(mock.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns null when the profile is missing', async () => {
    const mock = createClientMock()
    await expect(getUserPreferences('missing-user', mock.client)).resolves.toBeNull()
  })

  it('persists just the changed preference fields to the selected profile', async () => {
    const mock = createClientMock()

    await expect(updateUserPreferences('user-2', { preferred_theme: 'dark' }, mock.client)).resolves.toBeUndefined()
    expect(mock.update).toHaveBeenCalledWith({ preferred_theme: 'dark' })
    expect(mock.updateEq).toHaveBeenCalledWith('id', 'user-2')
  })

  it('loads the updated profile choice from a separate client instance', async () => {
    const sharedProfile = { preferred_language: 'en', preferred_theme: 'light' }
    const firstDevice = createClientMock({ data: sharedProfile })
    const secondDevice = createClientMock({ data: sharedProfile })

    await updateUserPreferences('user-4', { preferred_language: 'ar', preferred_theme: 'dark' }, firstDevice.client)
    await expect(getUserPreferences('user-4', secondDevice.client)).resolves.toEqual({
      preferred_language: 'ar',
      preferred_theme: 'dark',
    })
  })

  it('does not issue a write for an empty preference update', async () => {
    const mock = createClientMock()
    await updateUserPreferences('user-2', {}, mock.client)
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('surfaces profile read and write failures to the caller', async () => {
    const failure = new Error('profile unavailable')
    const readMock = createClientMock({ error: failure })
    const writeMock = createClientMock({ error: failure })

    await expect(getUserPreferences('user-3', readMock.client)).rejects.toBe(failure)
    await expect(updateUserPreferences('user-3', { preferred_language: 'en' }, writeMock.client)).rejects.toBe(failure)
  })
})

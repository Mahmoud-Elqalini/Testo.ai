import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bearerRequest, createMockSupabaseClient, type MockSupabaseClient } from './http-test-helpers'
import { createClient } from './supabase-js-mock'

import { callOperation, denialReasons, json, withAuth } from '../../../supabase/functions/_shared/http'

const user = { id: 'a7000000-0000-4000-8000-000000000001' }
let client: MockSupabaseClient

describe('shared Edge authorization', () => {
  beforeEach(() => {
    client = createMockSupabaseClient(user)
    createClient.mockReturnValue(client)
    vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'http://localhost' : 'test-anon-key' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    createClient.mockReset()
  })

  it('handles preflight and unauthenticated requests before invoking the handler', async () => {
    const handler = vi.fn(async () => json({ reached: true }))
    const route = withAuth('test-operation', handler)

    const preflight = await route(new Request('http://localhost/functions/v1/test-operation', { method: 'OPTIONS' }))
    expect(preflight.status).toBe(200)
    expect(handler).not.toHaveBeenCalled()

    client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const unauthorized = await route(new Request('http://localhost/functions/v1/test-operation'))
    expect(unauthorized.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes the authenticated user to the handler and reuses it for the RPC', async () => {
    const route = withAuth('test-operation', (request, authenticatedUser) =>
      callOperation(request, 'test-operation', 'fn_test_operation', { p_id: '123' }, {
        user: authenticatedUser,
        attemptId: 'e7000000-0000-4000-8000-000000000003',
      }),
    )

    const response = await route(bearerRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(client.auth.getUser).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('fn_test_operation', { p_id: '123' })
    expect(createClient).toHaveBeenCalledTimes(2)
  })

  it('keeps RPC denials generic while logging a recognized reason and attempt context', async () => {
    client.rpc.mockResolvedValueOnce({ data: { denial_reason: denialReasons[0] }, error: null })
    const route = withAuth('test-operation', (request, authenticatedUser) =>
      callOperation(request, 'test-operation', 'fn_test_operation', {}, {
        user: authenticatedUser,
        attemptId: 'e7000000-0000-4000-8000-000000000003',
      }),
    )

    const response = await route(bearerRequest())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'access_denied', message: 'Access denied.' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"denial_reason":"owner_mismatch"'))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"attempt_id":"e7000000-0000-4000-8000-000000000003"'))
  })

  it('returns a generic internal error when user verification throws', async () => {
    client.auth.getUser.mockRejectedValueOnce(new Error('network details'))
    const handler = vi.fn(async () => json({ reached: true }))

    const response = await withAuth('test-operation', handler)(bearerRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal_error', message: 'An unexpected error occurred.' })
    expect(handler).not.toHaveBeenCalled()
  })
})

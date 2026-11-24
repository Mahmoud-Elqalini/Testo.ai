import { vi, type Mock } from 'vitest'

export type EdgeTestUser = { id: string }
type AuthGetUser = () => Promise<{ data: { user: EdgeTestUser | null }; error: unknown | null }>
type RpcCall = (operation: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown | null }>

export type MockSupabaseClient = {
  auth: {
    getUser: Mock<AuthGetUser>
  }
  rpc: Mock<RpcCall>
}

export function createMockSupabaseClient(
  user: EdgeTestUser | null,
  rpcData: unknown = { ok: true },
): MockSupabaseClient {
  return {
    auth: { getUser: vi.fn<AuthGetUser>().mockResolvedValue({ data: { user }, error: null }) },
    rpc: vi.fn<RpcCall>().mockResolvedValue({ data: rpcData, error: null }),
  }
}

export function bearerRequest(method = 'POST') {
  return new Request('http://localhost/functions/v1/test-operation', {
    method,
    headers: { Authorization: 'Bearer test-user-token' },
  })
}

import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../../src/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

import {
  createGroupInvitation,
  getGroupInvitationStatus,
  redeemGroupInvitation,
  revokeGroupInvitation,
  rotateGroupInvitation,
} from '../../../src/lib/services/group-invitation-service'

const groupId = '6f2f0b7c-1994-4f9a-9f14-9f23acb2802d'

describe('group invitation service', () => {
  beforeEach(() => rpc.mockReset())

  it('validates admin group identifiers before making an RPC request', async () => {
    await expect(createGroupInvitation('not-a-uuid')).resolves.toMatchObject({ data: null, error: { code: 'validation_error' } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns one-time codes from create and rotation RPC responses', async () => {
    const response = { code: 'a'.repeat(32), expires_at: '2026-10-28T12:00:00.000Z' }
    rpc.mockResolvedValue({ data: response, error: null })

    await expect(createGroupInvitation(groupId)).resolves.toEqual({ data: response, error: null })
    expect(rpc).toHaveBeenLastCalledWith('create_group_invitation', { target_group_id: groupId })
    await expect(rotateGroupInvitation(groupId)).resolves.toEqual({ data: response, error: null })
    expect(rpc).toHaveBeenLastCalledWith('rotate_group_invitation', { target_group_id: groupId })
  })

  it('returns lifecycle metadata without requiring a code value', async () => {
    const status = { exists: true, created_at: '2026-09-28T12:00:00.000Z', expires_at: '2026-10-28T12:00:00.000Z', revoked_at: null }
    rpc.mockResolvedValue({ data: status, error: null })
    await expect(getGroupInvitationStatus(groupId)).resolves.toEqual({ data: status, error: null })
    expect(rpc).toHaveBeenCalledWith('get_group_invitation_status', { target_group_id: groupId })
  })

  it('maps revoke and redemption booleans from the RPC response', async () => {
    rpc.mockResolvedValueOnce({ data: { revoked: true }, error: null })
    rpc.mockResolvedValueOnce({ data: { success: false }, error: null })
    await expect(revokeGroupInvitation(groupId)).resolves.toEqual({ data: true, error: null })
    await expect(redeemGroupInvitation('')).resolves.toEqual({ data: false, error: null })
    expect(rpc).toHaveBeenNthCalledWith(2, 'redeem_group_invitation', { invitation_code: '' })
  })

  it('does not expose invalid-code distinctions through the service result', async () => {
    rpc.mockResolvedValue({ data: { success: false }, error: null })
    await expect(redeemGroupInvitation('invalid')).resolves.toEqual({ data: false, error: null })
  })
})

import { normalizeError } from '../errors'
import { createClient } from '../supabase/client'
import type { ServiceResult } from './exam-service'

export interface GroupInvitationIssue {
  code: string
  expires_at: string
}

export interface GroupInvitationStatus {
  exists: boolean
  created_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

function validationError(message: string) {
  return { code: 'validation_error' as const, message }
}

function validGroupId(groupId: string): boolean {
  return typeof groupId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)
}

async function issueInvitation(
  rpc: 'create_group_invitation' | 'rotate_group_invitation',
  groupId: string,
): Promise<ServiceResult<GroupInvitationIssue>> {
  if (!validGroupId(groupId)) return { data: null, error: validationError('A valid group is required.') }
  try {
    const { data, error } = await createClient().rpc(rpc, { target_group_id: groupId })
    if (error) throw error
    if (!data || typeof data !== 'object' || !('code' in data) || !('expires_at' in data)) {
      throw new Error('Invitation function returned an invalid response')
    }
    return { data: data as unknown as GroupInvitationIssue, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export function createGroupInvitation(groupId: string): Promise<ServiceResult<GroupInvitationIssue>> {
  return issueInvitation('create_group_invitation', groupId)
}

export function rotateGroupInvitation(groupId: string): Promise<ServiceResult<GroupInvitationIssue>> {
  return issueInvitation('rotate_group_invitation', groupId)
}

export async function getGroupInvitationStatus(groupId: string): Promise<ServiceResult<GroupInvitationStatus>> {
  if (!validGroupId(groupId)) return { data: null, error: validationError('A valid group is required.') }
  try {
    const { data, error } = await createClient().rpc('get_group_invitation_status', { target_group_id: groupId })
    if (error) throw error
    return { data: data as unknown as GroupInvitationStatus, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function revokeGroupInvitation(groupId: string): Promise<ServiceResult<boolean>> {
  if (!validGroupId(groupId)) return { data: null, error: validationError('A valid group is required.') }
  try {
    const { data, error } = await createClient().rpc('revoke_group_invitation', { target_group_id: groupId })
    if (error) throw error
    return { data: Boolean((data as { revoked?: boolean } | null)?.revoked), error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function redeemGroupInvitation(code: string): Promise<ServiceResult<boolean>> {
  if (typeof code !== 'string') return { data: null, error: validationError('Enter an invitation code.') }
  try {
    const { data, error } = await createClient().rpc('redeem_group_invitation', { invitation_code: code })
    if (error) throw error
    return { data: Boolean((data as { success?: boolean } | null)?.success), error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

import type { Group } from '../types'
import { normalizeError, type TestoError } from '../errors'
import { sanitizeText } from '../sanitize'
import { createClient } from '../supabase/client'
import type { ServiceResult } from './exam-service'

export interface GroupStudent { id: string; email: string; full_name: string }
export interface JoinedGroup { group_id: string; group_name: string }
export interface AssociatedParticipant { id: string; display_name: string }

function validationError(message: string): TestoError {
  return { code: 'validation_error', message }
}

export async function createGroup(input: { name: string }): Promise<ServiceResult<Group>> {
  const name = typeof input?.name === 'string' ? sanitizeText(input.name).trim() : ''
  if (!name) return { data: null, error: validationError('Group name is required.') }

  try {
    const client = createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError) throw authError
    if (!user) return { data: null, error: { code: 'access_denied', message: 'Access denied.' } }
    const { data, error } = await client.from('groups').insert({ name, owner_id: user.id }).select('*').single()
    if (error) throw error
    return { data: data as Group, error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function listAdminGroups(): Promise<ServiceResult<Group[]>> {
  try {
    const { data, error } = await createClient().from('groups').select('*').order('name', { ascending: true })
    if (error) throw error
    return { data: (data ?? []) as Group[], error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function listJoinedGroups(): Promise<ServiceResult<JoinedGroup[]>> {
  try {
    const { data, error } = await createClient().rpc('list_my_joined_groups')
    if (error) throw error
    return { data: (data ?? []) as JoinedGroup[], error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function getGroup(groupId: string): Promise<ServiceResult<Group | null>> {
  if (!groupId) return { data: null, error: validationError('Group id is required.') }
  try {
    const { data, error } = await createClient().from('groups').select('*').eq('id', groupId).maybeSingle()
    if (error) throw error
    return { data: data as Group | null, error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function lookupAssociatedParticipant(contextKind: 'group' | 'exam', contextId: string, email: string): Promise<ServiceResult<AssociatedParticipant[]>> {
  const normalizedEmail = typeof email === 'string' ? email.trim() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { data: null, error: validationError('Enter a complete email address.') }
  }
  try {
    const { data, error } = await createClient().rpc('lookup_associated_participant', {
      p_context_kind: contextKind,
      p_context_id: contextId,
      p_email: normalizedEmail,
    })
    if (error) throw error
    return { data: (data ?? []) as AssociatedParticipant[], error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function listGroupStudents(groupId: string): Promise<ServiceResult<GroupStudent[]>> {
  if (!groupId) return { data: null, error: validationError('Group id is required.') }
  try {
    const { data, error } = await createClient().rpc('list_associated_participants', {
      p_context_kind: 'group',
      p_context_id: groupId,
    })
    if (error) throw error
    return {
      data: ((data ?? []) as Array<{ id: string; display_name: string; email: string }>).map(({ id, display_name, email }) => ({
        id,
        email,
        full_name: display_name,
      })),
      error: null,
    }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function removeStudentFromGroup(groupId: string, studentId: string): Promise<ServiceResult<boolean>> {
  if (!groupId || !studentId) return { data: null, error: validationError('Group and student are required.') }
  try {
    const { error } = await createClient().from('group_students').delete().eq('group_id', groupId).eq('student_id', studentId)
    if (error) throw error
    return { data: true, error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

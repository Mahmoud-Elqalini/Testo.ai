import { normalizeError, type TestoError } from '../errors'
import { createClient } from '../supabase/client'
import type { ServiceResult } from './exam-service'

export interface ExamPermissionDetails {
  id: string
  exam_id: string
  group_id: string
  group_name: string
}

function validationError(message: string): TestoError { return { code: 'validation_error', message } }

export async function listExamPermissions(examId: string): Promise<ServiceResult<ExamPermissionDetails[]>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }
  try {
    const { data, error } = await createClient().rpc('list_owned_exam_permissions', { target_exam_id: examId })
    if (error) throw error
    return { data: (data ?? []) as ExamPermissionDetails[], error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function grantExamGroupAccess(examId: string, groupId: string): Promise<ServiceResult<boolean>> {
  if (!examId || !groupId) return { data: null, error: validationError('Exam and group are required.') }
  try {
    const { error } = await createClient().from('exam_permissions')
      .upsert({ exam_id: examId, group_id: groupId }, { onConflict: 'exam_id,group_id', ignoreDuplicates: true })
    if (error) throw error
    return { data: true, error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function revokeExamPermission(examId: string, groupId: string): Promise<ServiceResult<boolean>> {
  if (!examId || !groupId) return { data: null, error: validationError('Exam and group are required.') }
  try {
    const { error } = await createClient().from('exam_permissions').delete()
      .eq('exam_id', examId).eq('group_id', groupId)
    if (error) throw error
    return { data: true, error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

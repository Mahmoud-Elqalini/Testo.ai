import type { ExamPermission } from '../types'
import { normalizeError, type TestoError } from '../errors'
import { createClient } from '../supabase/client'
import type { ServiceResult } from './exam-service'

export type PermissionTarget = { studentId: string; groupId?: never } | { groupId: string; studentId?: never }
export interface ExamPermissionDetails extends ExamPermission {
  student_email: string | null
  student_name: string | null
  group_name: string | null
}

function validationError(message: string): TestoError { return { code: 'validation_error', message } }

export async function listExamPermissions(examId: string): Promise<ServiceResult<ExamPermissionDetails[]>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }
  try {
    const { data, error } = await createClient().rpc('list_exam_permissions', { target_exam_id: examId })
    if (error) throw error
    return { data: (data ?? []) as ExamPermissionDetails[], error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function grantExamStudentAccess(examId: string, studentId: string): Promise<ServiceResult<boolean>> {
  if (!examId || !studentId) return { data: null, error: validationError('Exam and student are required.') }
  try {
    const { error } = await createClient().from('exam_permissions')
      .upsert({ exam_id: examId, student_id: studentId, group_id: null }, { onConflict: 'exam_id,student_id', ignoreDuplicates: true })
    if (error) throw error
    return { data: true, error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function grantExamGroupAccess(examId: string, groupId: string): Promise<ServiceResult<boolean>> {
  if (!examId || !groupId) return { data: null, error: validationError('Exam and group are required.') }
  try {
    const { error } = await createClient().from('exam_permissions')
      .upsert({ exam_id: examId, group_id: groupId, student_id: null }, { onConflict: 'exam_id,group_id', ignoreDuplicates: true })
    if (error) throw error
    return { data: true, error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

export async function revokeExamPermission(examId: string, target: Partial<PermissionTarget>): Promise<ServiceResult<boolean>> {
  const hasStudent = typeof target.studentId === 'string' && target.studentId.length > 0
  const hasGroup = typeof target.groupId === 'string' && target.groupId.length > 0
  if (!examId || hasStudent === hasGroup) {
    return { data: null, error: validationError('Provide exactly one student or group permission to remove.') }
  }
  try {
    let query = createClient().from('exam_permissions').delete().eq('exam_id', examId)
    query = hasStudent ? query.eq('student_id', target.studentId!) : query.eq('group_id', target.groupId!)
    const { error } = await query
    if (error) throw error
    return { data: true, error: null }
  } catch (error) { return { data: null, error: normalizeError(error) } }
}

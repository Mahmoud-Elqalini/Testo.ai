import type { Exam } from '../types'
import { normalizeError, type TestoError } from '../errors'
import { sanitizeText } from '../sanitize'
import { createClient } from '../supabase/client'

export interface CreateExamInput {
  title: string
  description?: string
  start_time: string
  duration_minutes: number
}

export type UpdateExamInput = Partial<CreateExamInput>

export interface ExamPermissionSummary {
  studentCount: number
  groupCount: number
}

export interface ServiceResult<T> {
  data: T | null
  error: TestoError | null
}

function validationError(message: string): TestoError {
  return { code: 'validation_error', message }
}

function validateExamInput(input: CreateExamInput | UpdateExamInput): string | null {
  if ('title' in input && (typeof input.title !== 'string' || !sanitizeText(input.title).trim())) {
    return 'Exam title is required.'
  }

  if ('description' in input && typeof input.description !== 'string') {
    return 'Exam description must be text.'
  }

  if ('start_time' in input && (!input.start_time || Number.isNaN(Date.parse(input.start_time)))) {
    return 'A valid exam start time is required.'
  }

  if (
    'duration_minutes' in input &&
    (input.duration_minutes === undefined ||
      !Number.isInteger(input.duration_minutes) ||
      input.duration_minutes <= 0)
  ) {
    return 'Exam duration must be a positive whole number of minutes.'
  }

  return null
}

export async function createExam(input: CreateExamInput): Promise<ServiceResult<Exam>> {
  const validationMessage = validateExamInput(input)
  if (validationMessage) return { data: null, error: validationError(validationMessage) }

  try {
    const client = createClient()
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError) throw userError
    if (!user) return { data: null, error: { code: 'access_denied', message: 'Access denied.' } }

    const { data, error } = await client
      .from('exams')
      .insert({
        title: sanitizeText(input.title).trim(),
        description: sanitizeText(input.description ?? ''),
        start_time: input.start_time,
        duration_minutes: input.duration_minutes,
        admin_id: user.id,
      })
      .select('*')
      .single()

    if (error) throw error
    return { data: data as Exam, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function listAdminExams(): Promise<ServiceResult<Exam[]>> {
  try {
    const { data, error } = await createClient()
      .from('exams')
      .select('*')
      .order('start_time', { ascending: false })

    if (error) throw error
    return { data: (data ?? []) as Exam[], error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function getExam(examId: string): Promise<ServiceResult<Exam>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }

  try {
    const { data, error } = await createClient()
      .from('exams')
      .select('*')
      .eq('id', examId)
      .maybeSingle()

    if (error) throw error
    return { data: data as Exam | null, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function updateExam(
  examId: string,
  input: UpdateExamInput,
): Promise<ServiceResult<Exam>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }
  const validationMessage = validateExamInput(input)
  if (validationMessage) return { data: null, error: validationError(validationMessage) }
  if (Object.keys(input).length === 0) {
    return { data: null, error: validationError('At least one exam field must be updated.') }
  }

  const update: Record<string, unknown> = { ...input }
  if (input.title !== undefined) update.title = sanitizeText(input.title).trim()
  if (input.description !== undefined) update.description = sanitizeText(input.description)

  try {
    const { data, error } = await createClient()
      .from('exams')
      .update(update)
      .eq('id', examId)
      .select('*')
      .single()

    if (error) throw error
    return { data: data as Exam, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function deleteExam(examId: string): Promise<ServiceResult<boolean>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }

  try {
    const { error } = await createClient().from('exams').delete().eq('id', examId)
    if (error) throw error
    return { data: true, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function getExamPermissionSummary(
  examId: string,
): Promise<ServiceResult<ExamPermissionSummary>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }

  try {
    const { data, error } = await createClient()
      .from('exam_permissions')
      .select('student_id, group_id')
      .eq('exam_id', examId)

    if (error) throw error
    const permissions = (data ?? []) as Array<{ student_id: string | null; group_id: string | null }>
    return {
      data: {
        studentCount: permissions.filter(({ student_id }) => student_id !== null).length,
        groupCount: permissions.filter(({ group_id }) => group_id !== null).length,
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

/** True once any attempt has progressed past pending; used to lock exam content in the editor. */
export async function hasExamStartedAttempts(examId: string): Promise<ServiceResult<boolean>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }

  try {
    const { data, error } = await createClient()
      .from('exam_attempts')
      .select('id')
      .eq('exam_id', examId)
      .neq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return { data: Boolean(data), error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

export async function publishExam(examId: string): Promise<ServiceResult<Exam>> {
  return updatePublicationState(examId, true)
}

export async function unpublishExam(examId: string): Promise<ServiceResult<Exam>> {
  return updatePublicationState(examId, false)
}

async function updatePublicationState(
  examId: string,
  isPublished: boolean,
): Promise<ServiceResult<Exam>> {
  if (!examId) return { data: null, error: validationError('Exam id is required.') }

  try {
    const { data, error } = await createClient()
      .from('exams')
      .update({ is_published: isPublished })
      .eq('id', examId)
      .select('*')
      .single()

    if (error) throw error
    return { data: data as Exam, error: null }
  } catch (error) {
    return { data: null, error: normalizeError(error) }
  }
}

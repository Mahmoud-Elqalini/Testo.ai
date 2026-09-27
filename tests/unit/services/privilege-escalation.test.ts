import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createTestStudent } from './test-context'

describe('RLS blocks student privilege escalation on admin-owned tables (local Supabase)', () => {
  let student: Awaited<ReturnType<typeof createTestStudent>>
  let groupId: string
  let examId: string

  beforeAll(async () => {
    student = await createTestStudent()

    const { data: group, error: groupError } = await adminClient
      .from('groups')
      .insert({ name: 'Student escalation fixture', admin_id: student.userId })
      .select('id')
      .single()
    expect(groupError).toBeNull()
    groupId = group!.id

    const { data: exam, error: examError } = await adminClient
      .from('exams')
      .insert({
        title: 'Student escalation fixture',
        start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        admin_id: student.userId,
      })
      .select('id')
      .single()
    expect(examError).toBeNull()
    examId = exam!.id
  }, 30_000)

  afterAll(async () => {
    if (student) await student.cleanup()
  })

  it('blocks INSERT into exams even when admin_id is the student uid', async () => {
    const { error } = await student.client.from('exams').insert({
      title: 'Unauthorized exam',
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
      admin_id: student.userId,
    })
    expect(error?.code).toBe('42501')
  })

  it('blocks INSERT into groups even when admin_id is the student uid', async () => {
    const { error } = await student.client.from('groups').insert({
      name: 'Unauthorized group',
      admin_id: student.userId,
    })
    expect(error?.code).toBe('42501')
  })

  it('blocks INSERT into group_students for a group whose admin_id is the student uid', async () => {
    const { error } = await student.client.from('group_students').insert({
      group_id: groupId,
      student_id: student.userId,
    })
    expect(error?.code).toBe('42501')
  })

  it('blocks INSERT into exam_permissions for an exam whose admin_id is the student uid', async () => {
    const { error } = await student.client.from('exam_permissions').insert({
      exam_id: examId,
      student_id: student.userId,
    })
    expect(error?.code).toBe('42501')
  })

  it('blocks INSERT into questions for an exam whose admin_id is the student uid', async () => {
    const { error } = await student.client.from('questions').insert({
      exam_id: examId,
      type: 'essay',
      text: 'Unauthorized question',
      order: 1,
      reference_answers: [{ id: 'ref', text: 'Answer' }],
    })
    expect(error?.code).toBe('42501')
  })
})

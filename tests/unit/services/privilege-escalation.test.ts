import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createTestStudent } from './test-context'

describe('RLS enforces resource ownership and relationship-based access (local Supabase)', () => {
  let student: Awaited<ReturnType<typeof createTestStudent>>
  let foreignOwnerId: string
  let foreignGroupId: string
  let foreignExamId: string
  let studentGroupId: string
  let studentExamId: string

  beforeAll(async () => {
    student = await createTestStudent()

    const { data: foreignOwner, error: foreignOwnerError } = await adminClient.auth.admin.createUser({
      email: `foundation-foreign-owner-${crypto.randomUUID()}@testo.local`,
      password: 'Testo-service-test-password-123!',
      email_confirm: true,
    })
    expect(foreignOwnerError).toBeNull()
    expect(foreignOwner.user).toBeDefined()
    foreignOwnerId = foreignOwner.user!.id

    const { data: foreignGroup, error: foreignGroupError } = await adminClient
      .from('groups')
      .insert({ name: 'Foreign owner fixture', owner_id: foreignOwnerId })
      .select('id')
      .single()
    expect(foreignGroupError).toBeNull()
    foreignGroupId = foreignGroup!.id

    const { data: foreignExam, error: foreignExamError } = await adminClient
      .from('exams')
      .insert({
        title: 'Foreign owner fixture',
        start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        owner_id: foreignOwnerId,
      })
      .select('id')
      .single()
    expect(foreignExamError).toBeNull()
    foreignExamId = foreignExam!.id

    const { data: studentGroup, error: studentGroupError } = await adminClient
      .from('groups')
      .insert({ name: 'Student ownership fixture', owner_id: student.userId })
      .select('id')
      .single()
    expect(studentGroupError).toBeNull()
    studentGroupId = studentGroup!.id

    const { data: studentExam, error: studentExamError } = await adminClient
      .from('exams')
      .insert({
        title: 'Student ownership fixture',
        start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        owner_id: student.userId,
      })
      .select('id')
      .single()
    expect(studentExamError).toBeNull()
    studentExamId = studentExam!.id
  }, 30_000)

  afterAll(async () => {
    if (student) await student.cleanup()
    if (foreignExamId) {
      const { error } = await adminClient.from('exams').delete().eq('id', foreignExamId)
      expect(error).toBeNull()
    }
    if (foreignGroupId) {
      const { error } = await adminClient.from('groups').delete().eq('id', foreignGroupId)
      expect(error).toBeNull()
    }
    if (foreignOwnerId) {
      const { error } = await adminClient.auth.admin.deleteUser(foreignOwnerId)
      expect(error).toBeNull()
    }
  })

  it('allows a user to create exams and groups that they own', async () => {
    const { error: examError } = await student.client.from('exams').insert({
      title: 'Student-owned exam',
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
      owner_id: student.userId,
    })
    expect(examError).toBeNull()

    const { error: groupError } = await student.client.from('groups').insert({
      name: 'Student-owned group',
      owner_id: student.userId,
    })
    expect(groupError).toBeNull()
  })

  it('denies exam and group inserts that name another user as owner', async () => {
    const { error: examError } = await student.client.from('exams').insert({
      title: 'Foreign-owned exam attempt',
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
      owner_id: foreignOwnerId,
    })
    expect(examError?.code).toBe('42501')

    const { error: groupError } = await student.client.from('groups').insert({
      name: 'Foreign-owned group attempt',
      owner_id: foreignOwnerId,
    })
    expect(groupError?.code).toBe('42501')
  })

  it('blocks INSERT into group_students for a group the student owns', async () => {
    const { error } = await student.client.from('group_students').insert({
      group_id: studentGroupId,
      student_id: student.userId,
    })
    expect(error?.code).toBe('42501')
  })

  it('blocks direct individual exam_permissions for an exam the student owns', async () => {
    const { error } = await student.client.from('exam_permissions').insert({
      exam_id: studentExamId,
      student_id: student.userId,
    })
    expect(error?.code).toBe('42501')
  })

  it('denies questions attached to an exam owned by another user', async () => {
    const { error } = await student.client.from('questions').insert({
      exam_id: foreignExamId,
      type: 'essay',
      text: 'Foreign exam question attempt',
      order: 1,
      reference_answers: [{ id: 'ref', text: 'Answer' }],
    })
    expect(error?.code).toBe('42501')
  })

  it('allows a user to add questions to their own exam', async () => {
    const { error } = await student.client.from('questions').insert({
      exam_id: studentExamId,
      type: 'essay',
      text: 'Student-owned exam question',
      order: 1,
      reference_answers: [{ id: 'ref', text: 'Answer' }],
    })
    expect(error).toBeNull()
  })
})

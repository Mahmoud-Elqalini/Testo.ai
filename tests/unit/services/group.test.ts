import { afterEach, describe, expect, it } from 'vitest'
import {
  addStudentToGroup,
  createGroup,
  listGroupStudents,
  listAdminGroups,
  removeStudentFromGroup,
  searchStudentsByEmail,
} from '../../../src/lib/services/group-service'
import { createTestAdmin, createTestStudent } from './test-context'

describe('group service (local Supabase)', () => {
  let admin: Awaited<ReturnType<typeof createTestAdmin>> | undefined
  let student: Awaited<ReturnType<typeof createTestStudent>> | undefined

  afterEach(async () => {
    if (admin) { await admin.cleanup(); admin = undefined }
    if (student) { await student.cleanup(); student = undefined }
  })

  it('creates an owned group, finds a student by exact email, and adds/removes that student', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()

    const created = await createGroup({ name: 'Algebra cohort' })
    expect(created.error).toBeNull()
    expect(created.data).toMatchObject({ name: 'Algebra cohort', admin_id: admin.userId })

    const search = await searchStudentsByEmail(student.email.toUpperCase())
    expect(search.error).toBeNull()
    expect(search.data).toEqual([{ id: student.userId, email: student.email, full_name: '' }])
    const studentSearch = await student.client.rpc('search_student_by_email', { search_email: admin.email })
    expect(studentSearch.error).toBeNull()
    expect(studentSearch.data).toEqual([])
    expect(await searchStudentsByEmail('student')).toMatchObject({ data: null, error: { code: 'validation_error' } })

    const added = await addStudentToGroup(created.data!.id, student.userId)
    expect(added.error).toBeNull()
    const members = await listGroupStudents(created.data!.id)
    expect(members.data).toEqual([{ id: student.userId, email: student.email, full_name: '' }])

    const listed = await listAdminGroups()
    expect(listed.data?.map(({ id }) => id)).toContain(created.data!.id)

    const removed = await removeStudentFromGroup(created.data!.id, student.userId)
    expect(removed.error).toBeNull()
    expect((await listGroupStudents(created.data!.id)).data).toEqual([])
  }, 30_000)

  it('does not find non-students or expose another admin’s groups', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    const created = await createGroup({ name: 'Private group' })
    expect(created.error).toBeNull()

    const { adminClient } = await import('../helpers/supabase-admin')
    const { data: other, error } = await adminClient.auth.admin.createUser({
      email: `foundation-other-${crypto.randomUUID()}@testo.local`,
      password: 'Testo-service-test-password-123!',
      email_confirm: true,
    })
    expect(error).toBeNull()
    expect(other.user).toBeDefined()
    await adminClient.from('profiles').update({ role: 'admin' }).eq('id', other.user!.id)
    const otherGroups = await adminClient.from('groups').insert({ name: 'Foreign', admin_id: other.user!.id }).select('id').single()
    expect(otherGroups.error).toBeNull()

    expect((await listAdminGroups()).data?.map(({ id }) => id)).not.toContain(otherGroups.data!.id)
    expect((await listGroupStudents(otherGroups.data!.id)).data).toEqual([])
    await adminClient.auth.admin.deleteUser(other.user!.id)
  }, 30_000)
})

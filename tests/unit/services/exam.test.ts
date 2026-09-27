import { afterEach, describe, expect, it } from 'vitest'
import {
  createExam,
  deleteExam,
  getExam,
  listAdminExams,
  updateExam,
} from '../../../src/lib/services/exam-service'
import { adminClient } from '../helpers/supabase-admin'
import { createTestAdmin } from './test-context'

describe('exam service (local Supabase)', () => {
  let admin: Awaited<ReturnType<typeof createTestAdmin>> | undefined

  afterEach(async () => {
    if (admin) {
      await admin.cleanup()
      admin = undefined
    }
  })

  it('creates, reads, updates, and deletes an exam within the signed-in admin scope', async () => {
    admin = await createTestAdmin()
    const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const created = await createExam({
      title: 'Foundations CRUD exam',
      description: 'Initial description',
      start_time: startTime,
      duration_minutes: 45,
    })

    expect(created.error).toBeNull()
    expect(created.data).toMatchObject({
      title: 'Foundations CRUD exam',
      description: 'Initial description',
      duration_minutes: 45,
      admin_id: admin.userId,
      is_published: false,
    })
    const examId = created.data!.id

    const read = await getExam(examId)
    expect(read.error).toBeNull()
    expect(read.data?.id).toBe(examId)

    const updated = await updateExam(examId, { title: 'Updated CRUD exam' })
    expect(updated.error).toBeNull()
    expect(updated.data?.title).toBe('Updated CRUD exam')

    const listed = await listAdminExams()
    expect(listed.error).toBeNull()
    expect(listed.data?.map(({ id }) => id)).toContain(examId)

    const deleted = await deleteExam(examId)
    expect(deleted.error).toBeNull()
    const afterDelete = await getExam(examId)
    expect(afterDelete.error).toBeNull()
    expect(afterDelete.data).toBeNull()
  }, 30_000)

  it('does not expose or modify an exam owned by another admin', async () => {
    admin = await createTestAdmin()
    const { data: other, error: otherError } = await adminClient.auth.admin.createUser({
      email: `foundation-other-admin-${crypto.randomUUID()}@testo.local`,
      password: 'Testo-service-test-password-123!',
      email_confirm: true,
    })
    expect(otherError).toBeNull()
    expect(other.user).toBeDefined()

    const { error: roleError } = await adminClient
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', other.user!.id)
    expect(roleError).toBeNull()

    const { data: foreignExam, error: insertError } = await adminClient
      .from('exams')
      .insert({
        title: 'Other admin exam',
        start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        admin_id: other.user!.id,
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    const read = await getExam(foreignExam!.id)
    expect(read.error).toBeNull()
    expect(read.data).toBeNull()

    const update = await updateExam(foreignExam!.id, { title: 'Attempted takeover' })
    expect(update.data).toBeNull()
    expect(update.error).not.toBeNull()

    await adminClient.auth.admin.deleteUser(other.user!.id)
  }, 30_000)
})

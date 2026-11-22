import { afterEach, describe, expect, it } from 'vitest'
import { createGroup, listAdminGroups, listGroupStudents, listJoinedGroups, removeStudentFromGroup } from '../../../src/lib/services/group-service'
import { createGroupInvitation } from '../../../src/lib/services/group-invitation-service'
import { createClient } from '../../../src/lib/supabase/client'
import { adminClient } from '../helpers/supabase-admin'
import { createTestAdmin, createTestStudent } from './test-context'

describe('group service (local Supabase)', () => {
  let admin: Awaited<ReturnType<typeof createTestAdmin>> | undefined
  let student: Awaited<ReturnType<typeof createTestStudent>> | undefined

  afterEach(async () => {
    if (admin) { await admin.cleanup(); admin = undefined }
    if (student) { await student.cleanup(); student = undefined }
  })

  it('creates an owned group and allows a student to join through its invitation', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()

    const created = await createGroup({ name: 'Algebra cohort' })
    expect(created.error).toBeNull()
    expect(created.data).toMatchObject({ name: 'Algebra cohort', owner_id: admin.userId })
    const { data: ownerSessionData, error: ownerSessionError } = await createClient().auth.getSession()
    expect(ownerSessionError).toBeNull()
    expect(ownerSessionData.session).not.toBeNull()

    const invitation = await createGroupInvitation(created.data!.id)
    expect(invitation.error).toBeNull()
    const redeemed = await student.client.rpc('redeem_group_invitation', { invitation_code: invitation.data!.code })
    expect(redeemed.error).toBeNull()
    expect(redeemed.data).toEqual({ success: true })

    const members = await listGroupStudents(created.data!.id)
    expect(members.error).toBeNull()
    expect(members.data).toEqual([{ id: student.userId, email: student.email, full_name: '' }])

    const ownedGroups = await listAdminGroups()
    expect(ownedGroups.error).toBeNull()
    expect(ownedGroups.data?.map(({ id }) => id)).toContain(created.data!.id)

    const { data: studentSession, error: studentSessionError } = await student.client.auth.getSession()
    expect(studentSessionError).toBeNull()
    expect(studentSession.session).not.toBeNull()
    const { error: appSessionError } = await createClient().auth.setSession({
      access_token: studentSession.session!.access_token,
      refresh_token: studentSession.session!.refresh_token,
    })
    expect(appSessionError).toBeNull()
    const studentJoinedGroups = await listJoinedGroups()
    expect(studentJoinedGroups.error).toBeNull()
    expect(studentJoinedGroups.data).toContainEqual({ group_id: created.data!.id, group_name: 'Algebra cohort' })

    const { error: ownerSessionRestoreError } = await createClient().auth.setSession({
      access_token: ownerSessionData.session!.access_token,
      refresh_token: ownerSessionData.session!.refresh_token,
    })
    expect(ownerSessionRestoreError).toBeNull()
    const removed = await removeStudentFromGroup(created.data!.id, student.userId)
    expect(removed.error).toBeNull()
    expect((await listGroupStudents(created.data!.id)).data).toEqual([])
  }, 30_000)

  it('does not expose another owner’s groups or their members', async () => {
    admin = await createTestAdmin()
    student = await createTestStudent()
    const created = await createGroup({ name: 'Private group' })
    expect(created.error).toBeNull()
    const otherGroup = await adminClient.from('groups')
      .insert({ name: 'Foreign group', owner_id: student.userId })
      .select('id')
      .single()
    expect(otherGroup.error).toBeNull()

    const ownGroups = await listAdminGroups()
    expect(ownGroups.data?.map(({ id }) => id)).toContain(created.data!.id)
    expect(ownGroups.data?.map(({ id }) => id)).not.toContain(otherGroup.data!.id)
    expect((await listGroupStudents(otherGroup.data!.id)).data).toEqual([])
  }, 30_000)
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createExam } from '../../../src/lib/services/exam-service'
import { createGroup } from '../../../src/lib/services/group-service'
import { createClient } from '../../../src/lib/supabase/client'
import { createAttackIdentity, type AttackIdentity } from './identity-attack-context'

describe('owner_id services against live local Supabase', () => {
  let identity: AttackIdentity | undefined

  beforeAll(async () => {
    identity = await createAttackIdentity('owner-service')
    const { data, error } = await identity.client.auth.getSession()
    if (error || !data.session) throw error ?? new Error('Could not read the owner service test session')
    const { error: appSessionError } = await createClient().auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
    if (appSessionError) throw appSessionError
  }, 30_000)

  afterAll(async () => {
    const { error: signOutError } = await createClient().auth.signOut()
    if (signOutError) throw signOutError
    if (identity) await identity.cleanup()
  }, 30_000)

  it('creates groups and exams with the authenticated user as owner', async () => {
    const group = await createGroup({ name: `identity-owner-service-group-${crypto.randomUUID()}` })
    expect(group.error).toBeNull()
    expect(group.data?.owner_id).toBe(identity!.userId)

    const exam = await createExam({
      title: `identity-owner-service-exam-${crypto.randomUUID()}`,
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
    })
    expect(exam.error).toBeNull()
    expect(exam.data?.owner_id).toBe(identity!.userId)

    const { data: storedGroup, error: groupError } = await adminClient.from('groups')
      .select('id,owner_id').eq('id', group.data!.id).single()
    expect(groupError).toBeNull()
    expect(storedGroup).toEqual({ id: group.data!.id, owner_id: identity!.userId })
    const { data: storedExam, error: examError } = await adminClient.from('exams')
      .select('id,owner_id').eq('id', exam.data!.id).single()
    expect(examError).toBeNull()
    expect(storedExam).toEqual({ id: exam.data!.id, owner_id: identity!.userId })
  }, 30_000)
})

import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { getDashboardData } from '@/lib/services/dashboard-service'
import { createAttackIdentity, type AttackIdentity } from './identity-attack-context'

type ExamKey = 'active' | 'future' | 'expired' | 'draft'
type DashboardExamFixture = { id: string; title: string }
type DashboardFixtures = Record<ExamKey, DashboardExamFixture>

const runToken = crypto.randomUUID().replaceAll('-', '')
const actorLabel = runToken.slice(0, 6)

describe('dashboard data layer against live local Supabase', () => {
  let owner: AttackIdentity | undefined
  let member: AttackIdentity | undefined
  let unrelated: AttackIdentity | undefined
  let group: { id: string; name: string } | undefined
  let exams: DashboardFixtures | undefined

  beforeAll(async () => {
    const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!configuredUrl) throw new Error('Local Supabase URL is required for the dashboard live test')
    const hostname = new URL(configuredUrl).hostname
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) {
      throw new Error(`Dashboard live test requires local Supabase; configured host was ${hostname}`)
    }

    owner = await createAttackIdentity(`d-${actorLabel}-o`)
    member = await createAttackIdentity(`d-${actorLabel}-m`)
    unrelated = await createAttackIdentity(`d-${actorLabel}-u`)

    const groupName = `dashboard-live-${runToken}-group`
    const { data: createdGroup, error: groupError } = await adminClient
      .from('groups')
      .insert({ name: groupName, owner_id: owner.userId })
      .select('id,name')
      .single()
    if (groupError || !createdGroup) throw groupError ?? new Error('Could not create the dashboard live-test group')
    group = createdGroup

    const now = Date.now()
    const examSpecs: Array<{
      key: ExamKey
      title: string
      start_time: string
      duration_minutes: number
      is_published: boolean
    }> = [
      {
        key: 'active',
        title: `dashboard-live-${runToken}-active`,
        start_time: new Date(now - 15 * 60_000).toISOString(),
        duration_minutes: 60,
        is_published: true,
      },
      {
        key: 'future',
        title: `dashboard-live-${runToken}-future`,
        start_time: new Date(now + 2 * 60 * 60_000).toISOString(),
        duration_minutes: 60,
        is_published: true,
      },
      {
        key: 'expired',
        title: `dashboard-live-${runToken}-expired`,
        start_time: new Date(now - 3 * 60 * 60_000).toISOString(),
        duration_minutes: 60,
        is_published: true,
      },
      {
        key: 'draft',
        title: `dashboard-live-${runToken}-draft`,
        start_time: new Date(now + 24 * 60 * 60_000).toISOString(),
        duration_minutes: 60,
        is_published: false,
      },
    ]

    const { data: createdExams, error: examsError } = await adminClient
      .from('exams')
      .insert(examSpecs.map(({ title, start_time, duration_minutes, is_published }) => ({
        title,
        start_time,
        duration_minutes,
        is_published,
        owner_id: owner!.userId,
      })))
      .select('id,title')
    if (examsError || !createdExams) throw examsError ?? new Error('Could not create dashboard live-test exams')

    exams = {} as DashboardFixtures
    for (const spec of examSpecs) {
      const createdExam = createdExams.find(({ title }) => title === spec.title)
      if (!createdExam) throw new Error(`Supabase did not return the ${spec.key} dashboard exam`)
      exams[spec.key] = createdExam
    }

    const { error: permissionsError } = await adminClient.from('exam_permissions').insert(
      examSpecs.map(({ key }) => ({ exam_id: exams![key].id, group_id: group!.id })),
    )
    if (permissionsError) throw permissionsError

    const { data: invitation, error: invitationError } = await owner.client.rpc('create_group_invitation', {
      target_group_id: group.id,
    })
    if (invitationError) throw invitationError
    const invitationCode = (invitation as { code?: unknown } | null)?.code
    if (typeof invitationCode !== 'string') throw new Error('Owner invitation RPC did not return a code')

    const { data: redemption, error: redemptionError } = await member.client.rpc('redeem_group_invitation', {
      invitation_code: invitationCode,
    })
    if (redemptionError) throw redemptionError
    if ((redemption as { success?: unknown } | null)?.success !== true) {
      throw new Error('Member could not join the test group through invitation redemption')
    }
  }, 60_000)

  afterAll(async () => {
    const cleanupErrors: unknown[] = []
    for (const identity of [member, unrelated, owner]) {
      if (!identity) continue
      try {
        await identity.cleanup()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    if (group) {
      try {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(group.id)) {
          throw new Error('Refusing invitation cleanup verification with an invalid run group id')
        }

        const containers = spawnSync(
          'docker',
          ['ps', '--filter', 'name=supabase_db_', '--format', '{{.Names}}'],
          { cwd: process.cwd(), encoding: 'utf8' },
        )
        if (containers.error) throw containers.error
        if (containers.status !== 0) {
          throw new Error(containers.stderr || 'Unable to locate the local Supabase database container')
        }
        const containerName = containers.stdout.trim().split(/\r?\n/).find(Boolean)
        if (!containerName) throw new Error('Local Supabase database is not running; invitation cleanup could not be verified')

        const verificationSql = `SELECT count(*) FROM private.group_invitations WHERE group_id = '${group.id}'::uuid;`
        const verification = spawnSync(
          'docker',
          [
            'exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'postgres',
            '-v', 'ON_ERROR_STOP=1', '-t', '-A',
          ],
          { cwd: process.cwd(), encoding: 'utf8', input: verificationSql, maxBuffer: 1024 * 1024 },
        )
        if (verification.error) throw verification.error
        if (verification.status !== 0) {
          throw new Error(verification.stderr || verification.stdout || 'Invitation cleanup SELECT failed')
        }
        const remainingInvitations = verification.stdout.trim()
        if (!/^\d+$/.test(remainingInvitations)) {
          throw new Error(`Invitation cleanup SELECT returned an invalid count: ${JSON.stringify(remainingInvitations)}`)
        }
        if (Number(remainingInvitations) !== 0) {
          throw new Error(`SECURITY FINDING: ${remainingInvitations} invitation row(s) remain for run group ${group.id}`)
        }
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Dashboard live-test cleanup or invitation verification failed')
    }
  }, 60_000)

  it('keeps expired and unpublished participant exams out while preserving each actor’s scope', async () => {
    if (!owner || !member || !unrelated || !group || !exams) {
      throw new Error('Dashboard live-test fixtures were not initialized')
    }
    const expectedGroupId = group.id

    const snapshotBefore = await Promise.all([
      adminClient.from('profiles')
        .select('id,full_name,preferred_language,preferred_theme')
        .in('id', [owner.userId, member.userId, unrelated.userId])
        .order('id'),
      adminClient.from('groups')
        .select('id,name,owner_id')
        .eq('id', group.id),
      adminClient.from('exams')
        .select('id,title,start_time,duration_minutes,is_published,owner_id')
        .in('id', Object.values(exams).map(({ id }) => id))
        .order('id'),
      adminClient.from('exam_permissions')
        .select('exam_id,group_id,student_id')
        .in('exam_id', Object.values(exams).map(({ id }) => id))
        .order('exam_id'),
      adminClient.from('group_students')
        .select('group_id,student_id')
        .eq('group_id', group.id)
        .order('student_id'),
    ])
    const snapshotErrors = snapshotBefore.map(({ error }) => error).filter(Boolean)
    if (snapshotErrors.length > 0) throw new AggregateError(snapshotErrors, 'Could not snapshot dashboard fixtures before the member read')

    const memberResult = await getDashboardData(member.client)
    if (!memberResult.data) throw memberResult.error ?? new Error('Member dashboard did not return data')
    const memberData = memberResult.data

    const snapshotAfter = await Promise.all([
      adminClient.from('profiles')
        .select('id,full_name,preferred_language,preferred_theme')
        .in('id', [owner.userId, member.userId, unrelated.userId])
        .order('id'),
      adminClient.from('groups')
        .select('id,name,owner_id')
        .eq('id', group.id),
      adminClient.from('exams')
        .select('id,title,start_time,duration_minutes,is_published,owner_id')
        .in('id', Object.values(exams).map(({ id }) => id))
        .order('id'),
      adminClient.from('exam_permissions')
        .select('exam_id,group_id,student_id')
        .in('exam_id', Object.values(exams).map(({ id }) => id))
        .order('exam_id'),
      adminClient.from('group_students')
        .select('group_id,student_id')
        .eq('group_id', group.id)
        .order('student_id'),
    ])
    const afterSnapshotErrors = snapshotAfter.map(({ error }) => error).filter(Boolean)
    if (afterSnapshotErrors.length > 0) throw new AggregateError(afterSnapshotErrors, 'Could not verify dashboard fixtures after the member read')
    expect(snapshotAfter.map(({ data }) => data)).toEqual(snapshotBefore.map(({ data }) => data))

    const allowedMemberExamIds = new Set([exams.active.id, exams.future.id])
    const unexpectedMemberExams = memberData.exams
      .filter(({ id }) => !allowedMemberExamIds.has(id))
      .map(({ id, title }) => ({ id, title }))
    if (unexpectedMemberExams.length > 0) {
      const finding = `SECURITY FINDING in tests/unit/services/dashboard-live.test.ts: member ${member.userId} received out-of-scope exams: ${JSON.stringify(unexpectedMemberExams)}`
      console.error(finding)
      throw new Error(finding)
    }
    if (memberData.groups.length > 0) {
      const finding = `SECURITY FINDING in tests/unit/services/dashboard-live.test.ts: member ${member.userId} received owned groups: ${JSON.stringify(memberData.groups.map(({ id, name }) => ({ id, name })))}`
      console.error(finding)
      throw new Error(finding)
    }
    const unexpectedMemberGroups = memberData.joinedGroups.filter(({ group_id }) => group_id !== expectedGroupId)
    if (unexpectedMemberGroups.length > 0) {
      const finding = `SECURITY FINDING in tests/unit/services/dashboard-live.test.ts: member ${member.userId} received unexpected joined groups: ${JSON.stringify(unexpectedMemberGroups)}`
      console.error(finding)
      throw new Error(finding)
    }

    expect(memberResult.error).toBeNull()
    expect(memberResult.unauthenticated).toBe(false)
    expect(memberData.exams.map(({ id }) => id).sort()).toEqual([exams.active.id, exams.future.id].sort())
    expect(memberData.joinedGroups).toEqual([{ group_id: group.id, group_name: group.name }])
    expect(memberData.sectionErrors).toEqual({ ownedGroups: false, joinedGroups: false, exams: false })
    expect(memberResult.data).not.toHaveProperty('role')

    const ownerResult = await getDashboardData(owner.client)
    if (!ownerResult.data) throw ownerResult.error ?? new Error('Owner dashboard did not return data')
    expect(ownerResult.error).toBeNull()
    expect(ownerResult.unauthenticated).toBe(false)
    expect(ownerResult.data.exams.map(({ id }) => id).sort()).toEqual(Object.values(exams).map(({ id }) => id).sort())
    expect(ownerResult.data.groups.map(({ id }) => id)).toEqual([group.id])
    expect(ownerResult.data.sectionErrors).toEqual({ ownedGroups: false, joinedGroups: false, exams: false })
    expect(ownerResult.data).not.toHaveProperty('role')

    const unrelatedResult = await getDashboardData(unrelated.client)
    if (!unrelatedResult.data) throw unrelatedResult.error ?? new Error('Unrelated dashboard did not return data')
    const unexpectedUnrelatedData = {
      exams: unrelatedResult.data.exams.map(({ id, title }) => ({ id, title })),
      groups: unrelatedResult.data.groups.map(({ id, name }) => ({ id, name })),
      joinedGroups: unrelatedResult.data.joinedGroups,
    }
    if (
      unexpectedUnrelatedData.exams.length > 0
      || unexpectedUnrelatedData.groups.length > 0
      || unexpectedUnrelatedData.joinedGroups.length > 0
    ) {
      const finding = `SECURITY FINDING in tests/unit/services/dashboard-live.test.ts: unrelated user ${unrelated.userId} received dashboard data: ${JSON.stringify(unexpectedUnrelatedData)}`
      console.error(finding)
      throw new Error(finding)
    }
    expect(unrelatedResult.error).toBeNull()
    expect(unrelatedResult.unauthenticated).toBe(false)
    expect(unrelatedResult.data.sectionErrors).toEqual({ ownedGroups: false, joinedGroups: false, exams: false })
    expect(unrelatedResult.data).not.toHaveProperty('role')
  }, 60_000)
})

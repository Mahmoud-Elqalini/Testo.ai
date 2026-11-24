import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createAnonymousAttackClient, createAttackIdentity, logAttackOutcome, setProfileRole, type AttackIdentity } from './identity-attack-context'

const { error: roleColumnError } = await adminClient.from('profiles').select('role').limit(0)
const fixedRoleSchemaAvailable = !roleColumnError

type QueryResult = { data: unknown; error: { code?: string } | null }

async function currentRole(userId: string) {
  const { data, error } = await adminClient.from('profiles').select('role').eq('id', userId).single()
  if (error || !data) throw error ?? new Error('Could not inspect role fixture')
  return data.role as 'admin' | 'student'
}

async function currentProfile(userId: string) {
  const { data, error } = await adminClient.from('profiles')
    .select('id,role,full_name,preferred_language,preferred_theme').eq('id', userId).single()
  if (error || !data) throw error ?? new Error('Could not inspect profile fixture')
  return data
}

async function currentMirrorRole(userId: string) {
  const { data, error } = await adminClient.from('private_user_roles').select('role').eq('user_id', userId).single()
  if (error || !data) throw error ?? new Error('Could not inspect role mirror fixture')
  return data.role as 'admin' | 'student'
}

async function readEmptyAccessSnapshot(user: AttackIdentity) {
  const [groups, exams, memberships, attempts, joinedGroups] = await Promise.all([
    user.client.from('groups').select('id'),
    user.client.from('exams').select('id'),
    user.client.from('group_students').select('group_id,student_id').eq('student_id', user.userId),
    user.client.from('exam_attempts').select('id').eq('student_id', user.userId),
    user.client.rpc('list_my_joined_groups'),
  ])
  for (const result of [groups, exams, memberships, attempts, joinedGroups]) expect(result.error).toBeNull()
  return {
    groups: groups.data,
    exams: exams.data,
    memberships: memberships.data,
    attempts: attempts.data,
    joinedGroups: joinedGroups.data,
  }
}

async function expectProfileAttack(
  name: string,
  attack: QueryResult,
  readRole: () => Promise<'admin' | 'student'>,
  expectedRole: 'admin' | 'student',
  errorCode?: string,
) {
  logAttackOutcome(name, attack.error ? { errorCode: attack.error.code } : { rows: attack.data })
  expect(await readRole()).toBe(expectedRole)
  if (errorCode) expect(attack.error?.code).toBe(errorCode)
  else {
    expect(attack.error).toBeNull()
    expect(attack.data).toEqual([])
  }
}

describe.skipIf(!fixedRoleSchemaAvailable)('unified identity fixed-role attacks (live local Supabase, before 0022)', () => {
  let userA: AttackIdentity | undefined
  let userB: AttackIdentity | undefined
  let groupB: string
  let examB: string

  beforeAll(async () => {
    userA = await createAttackIdentity('role-user-a')
    userB = await createAttackIdentity('role-user-b')
    const { data: group, error: groupError } = await userB.client.from('groups').insert({
      name: `identity-role-resource-group-${crypto.randomUUID()}`,
      owner_id: userB.userId,
    }).select('id').single()
    if (groupError || !group) throw groupError ?? new Error('Could not create owner B role fixture group')
    groupB = group.id
    const { data: exam, error: examError } = await userB.client.from('exams').insert({
      title: `identity-role-resource-exam-${crypto.randomUUID()}`,
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 30,
      owner_id: userB.userId,
    }).select('id').single()
    if (examError || !exam) throw examError ?? new Error('Could not create owner B role fixture exam')
    examB = exam.id
  }, 60_000)

  afterAll(async () => {
    const identities = [userB, userA].filter((identity): identity is AttackIdentity => Boolean(identity))
    const cleanupFailures: unknown[] = []
    for (const identity of identities) {
      try { await identity.cleanup() } catch (error) { cleanupFailures.push(error) }
    }
    if (cleanupFailures.length > 0) throw new AggregateError(cleanupFailures, 'Fixed-role attack fixture cleanup failed')
  }, 60_000)

  it('creates default student profiles and role mirrors for new accounts', async () => {
    for (const identity of [userA!, userB!]) {
      const profile = await currentProfile(identity.userId)
      expect(profile).toMatchObject({
        id: identity.userId,
        role: 'student',
        full_name: '',
        preferred_language: 'en',
        preferred_theme: 'light',
      })
      expect(await currentMirrorRole(identity.userId)).toBe('student')
    }
  })

  it('rejects user role changes and keeps ownership and membership access unchanged for every role value', async () => {
    const initialRoleA = await currentRole(userA!.userId)
    expect(initialRoleA).toBe('student')
    expect(await currentMirrorRole(userA!.userId)).toBe('student')
    const selfPromote = await userA!.client.from('profiles').update({ role: 'admin' })
      .eq('id', userA!.userId).select('id,role')
    await expectProfileAttack('A self-update role=admin', selfPromote, () => currentRole(userA!.userId), 'student', '42501')
    expect(await currentMirrorRole(userA!.userId)).toBe('student')

    await setProfileRole(userA!.userId, 'admin')
    expect(await currentMirrorRole(userA!.userId)).toBe('admin')
    const selfDemote = await userA!.client.from('profiles').update({ role: 'student' })
      .eq('id', userA!.userId).select('id,role')
    await expectProfileAttack('A self-update role=student', selfDemote, () => currentRole(userA!.userId), 'admin', '42501')
    expect(await currentMirrorRole(userA!.userId)).toBe('admin')

    const initialRoleB = await currentRole(userB!.userId)
    expect(initialRoleB).toBe('student')
    const otherPromote = await userA!.client.from('profiles').update({ role: 'admin' })
      .eq('id', userB!.userId).select('id,role')
    await expectProfileAttack('A update B role=admin', otherPromote, () => currentRole(userB!.userId), 'student', '42501')
    const otherDemote = await userA!.client.from('profiles').update({ role: 'student' })
      .eq('id', userB!.userId).select('id,role')
    await expectProfileAttack('A update B role=student', otherDemote, () => currentRole(userB!.userId), 'student', '42501')

    const snapshots: Array<{ role: 'admin' | 'student'; snapshot: Awaited<ReturnType<typeof readEmptyAccessSnapshot>> }> = []
    for (const role of ['student', 'admin'] as const) {
      await setProfileRole(userA!.userId, role)
      snapshots.push({ role, snapshot: await readEmptyAccessSnapshot(userA!) })
      const foreignGroup = await userA!.client.from('groups').select('id').eq('id', groupB)
      const foreignExam = await userA!.client.from('exams').select('id').eq('id', examB)
      logAttackOutcome(`A role=${role} reads B group`, foreignGroup.error ? { errorCode: foreignGroup.error.code } : { rows: foreignGroup.data })
      logAttackOutcome(`A role=${role} reads B exam`, foreignExam.error ? { errorCode: foreignExam.error.code } : { rows: foreignExam.data })
      expect(foreignGroup.error).toBeNull()
      expect(foreignGroup.data).toEqual([])
      expect(foreignExam.error).toBeNull()
      expect(foreignExam.data).toEqual([])
    }

    expect(snapshots[0].snapshot).toEqual({ groups: [], exams: [], memberships: [], attempts: [], joinedGroups: [] })
    expect(snapshots[1].snapshot).toEqual(snapshots[0].snapshot)

    for (const role of ['student', 'admin'] as const) {
      await setProfileRole(userB!.userId, role)
      const aGroupRead = await userA!.client.from('groups').select('id').eq('id', groupB)
      const aExamRead = await userA!.client.from('exams').select('id').eq('id', examB)
      logAttackOutcome(`B role=${role}, A reads B group`, aGroupRead.error ? { errorCode: aGroupRead.error.code } : { rows: aGroupRead.data })
      logAttackOutcome(`B role=${role}, A reads B exam`, aExamRead.error ? { errorCode: aExamRead.error.code } : { rows: aExamRead.data })
      expect(aGroupRead.error).toBeNull()
      expect(aGroupRead.data).toEqual([])
      expect(aExamRead.error).toBeNull()
      expect(aExamRead.data).toEqual([])
    }
  }, 90_000)

  it('protects identity columns, denies anonymous and cross-user writes, and permits safe profile updates', async () => {
    await setProfileRole(userA!.userId, 'student')
    const initialProfileA = await currentProfile(userA!.userId)
    const initialProfileB = await currentProfile(userB!.userId)
    expect(initialProfileA).toMatchObject({
      id: userA!.userId,
      role: 'student',
      preferred_language: 'en',
      preferred_theme: 'light',
    })
    expect(await currentMirrorRole(userA!.userId)).toBe('student')

    const idAttack = await userA!.client.from('profiles').update({ id: userB!.userId })
      .eq('id', userA!.userId).select('id')
    logAttackOutcome('A self-update id=B', idAttack.error ? { errorCode: idAttack.error.code } : { rows: idAttack.data })
    expect(idAttack.error?.code).toBe('42501')
    expect(idAttack.data).toBeNull()
    expect(await currentProfile(userA!.userId)).toEqual(initialProfileA)

    const otherProfileAttack = await userA!.client.from('profiles').update({ full_name: 'Cross-user profile attack' })
      .eq('id', userB!.userId).select('id,full_name')
    logAttackOutcome('A updates B full_name', otherProfileAttack.error ? { errorCode: otherProfileAttack.error.code } : { rows: otherProfileAttack.data })
    expect(otherProfileAttack.error).toBeNull()
    expect(otherProfileAttack.data).toEqual([])
    expect(await currentProfile(userB!.userId)).toEqual(initialProfileB)

    const anonClient = createAnonymousAttackClient()
    const { data: anonSession } = await anonClient.auth.getSession()
    expect(anonSession.session).toBeNull()
    const anonAttack = await anonClient.from('profiles').update({ full_name: 'Anonymous profile attack' })
      .eq('id', userA!.userId).select('id,full_name')
    logAttackOutcome('anonymous updates A full_name', anonAttack.error ? { errorCode: anonAttack.error.code } : { rows: anonAttack.data })
    expect(anonAttack.error?.code).toBe('42501')
    expect(anonAttack.data).toBeNull()
    expect(await currentProfile(userA!.userId)).toEqual(initialProfileA)

    const safeUpdate = await userA!.client.from('profiles').update({
      full_name: 'Role attack safe profile update',
      preferred_language: 'ar',
      preferred_theme: 'dark',
    }).eq('id', userA!.userId).select('id,full_name,preferred_language,preferred_theme').single()
    logAttackOutcome('A updates safe profile columns', safeUpdate.error ? { errorCode: safeUpdate.error.code } : { rows: safeUpdate.data })
    expect(safeUpdate.error).toBeNull()
    expect(safeUpdate.data).toMatchObject({
      id: userA!.userId,
      full_name: 'Role attack safe profile update',
      preferred_language: 'ar',
      preferred_theme: 'dark',
    })
    expect(await currentProfile(userA!.userId)).toMatchObject(safeUpdate.data!)
  })
})

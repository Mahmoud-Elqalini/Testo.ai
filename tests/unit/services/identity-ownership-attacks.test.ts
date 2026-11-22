import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createAttackIdentity, logAttackOutcome, type AttackIdentity } from './identity-attack-context'

const { error: adminIdError } = await adminClient.from('groups').select('admin_id').limit(0)
const ownerMirrorSchemaAvailable = !adminIdError

type QueryResult = { data: unknown; error: { code?: string } | null }

async function expectEmptyRows(name: string, result: QueryResult) {
  logAttackOutcome(name, result.error ? { errorCode: result.error.code } : { rows: result.data })
  expect(result.error).toBeNull()
  expect(result.data).toEqual([])
}

async function expectErrorCode(name: string, result: QueryResult, code: string) {
  logAttackOutcome(name, result.error ? { errorCode: result.error.code } : { data: result.data })
  expect(result.error?.code).toBe(code)
}

async function expectDeniedAndUnchanged(
  name: string,
  attack: QueryResult,
  readAfter: () => PromiseLike<{ data: unknown; error: { code?: string } | null }>,
  before: unknown,
  errorCode?: string,
) {
  logAttackOutcome(name, attack.error ? { errorCode: attack.error.code } : { rows: attack.data })
  const after = await readAfter()
  expect(after.error).toBeNull()
  expect(after.data).toEqual(before)
  if (errorCode) expect(attack.error?.code).toBe(errorCode)
  else {
    expect(attack.error).toBeNull()
    expect(attack.data).toEqual([])
  }
}

async function insertOwnedGroup(owner: AttackIdentity, name: string) {
  const { data, error } = await owner.client.from('groups')
    .insert({ name, owner_id: owner.userId }).select('id').single()
  if (error || !data) throw error ?? new Error('Could not create an owned group fixture')
  return data.id as string
}

async function insertOwnedExam(owner: AttackIdentity, title: string) {
  const { data, error } = await owner.client.from('exams').insert({
    title,
    start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    duration_minutes: 45,
    owner_id: owner.userId,
  }).select('id').single()
  if (error || !data) throw error ?? new Error('Could not create an owned exam fixture')
  return data.id as string
}

describe.skipIf(!ownerMirrorSchemaAvailable)('unified identity cross-user ownership attacks (live local Supabase, before 0021)', () => {
  let ownerA: AttackIdentity | undefined
  let ownerB: AttackIdentity | undefined
  let member: AttackIdentity | undefined
  let outsider: AttackIdentity | undefined
  let groupA: string
  let groupB: string
  let examA: string
  let examB: string
  let questionB: string
  let permissionA: string
  let permissionB: string
  const prefix = `identity-ownership-${crypto.randomUUID()}`

  beforeAll(async () => {
    ownerA = await createAttackIdentity('owner-a')
    ownerB = await createAttackIdentity('owner-b')
    member = await createAttackIdentity('member')
    outsider = await createAttackIdentity('outsider')

    groupA = await insertOwnedGroup(ownerA, `${prefix}-group-a`)
    groupB = await insertOwnedGroup(ownerB, `${prefix}-group-b`)
    examA = await insertOwnedExam(ownerA, `${prefix}-exam-a`)
    examB = await insertOwnedExam(ownerB, `${prefix}-exam-b`)

    const { data: question, error: questionError } = await ownerB.client.from('questions').insert({
      exam_id: examB,
      type: 'essay',
      text: `${prefix}-question-b`,
      order: 1,
      reference_answers: [{ id: 'ref', text: 'Private answer key' }],
    }).select('id').single()
    if (questionError || !question) throw questionError ?? new Error('Could not create the foreign question fixture')
    questionB = question.id

    const { data: permissionAResult, error: permissionAError } = await ownerA.client.from('exam_permissions')
      .insert({ exam_id: examA, group_id: groupA }).select('id').single()
    if (permissionAError || !permissionAResult) throw permissionAError ?? new Error('Could not create owner A permission fixture')
    permissionA = permissionAResult.id
    const { data: permissionBResult, error: permissionBError } = await ownerB.client.from('exam_permissions')
      .insert({ exam_id: examB, group_id: groupB }).select('id').single()
    if (permissionBError || !permissionBResult) throw permissionBError ?? new Error('Could not create owner B permission fixture')
    permissionB = permissionBResult.id

    const { data: invitation, error: invitationError } = await ownerB.client.rpc('create_group_invitation', { target_group_id: groupB })
    if (invitationError || !invitation) throw invitationError ?? new Error('Could not create owner B invitation fixture')
    const { data: redeemed, error: redeemError } = await member.client.rpc('redeem_group_invitation', {
      invitation_code: (invitation as { code: string }).code,
    })
    if (redeemError || JSON.stringify(redeemed) !== JSON.stringify({ success: true })) {
      throw redeemError ?? new Error('The member could not redeem the owner B invitation fixture')
    }
  }, 60_000)

  afterAll(async () => {
    const identities = [outsider, member, ownerB, ownerA].filter((identity): identity is AttackIdentity => Boolean(identity))
    const cleanupFailures: unknown[] = []
    for (const identity of identities) {
      try { await identity.cleanup() } catch (error) { cleanupFailures.push(error) }
    }
    if (cleanupFailures.length > 0) throw new AggregateError(cleanupFailures, 'Cross-user attack fixture cleanup failed')
  }, 60_000)

  it('denies cross-owner reads and writes, owner spoofing, transfers, invalid permission joins, and invitation disclosure', async () => {
    const groupBefore = await adminClient.from('groups').select('id,name,owner_id,admin_id').eq('id', groupB).single()
    const examBefore = await adminClient.from('exams').select('id,title,owner_id,admin_id').eq('id', examB).single()
    const questionBefore = await adminClient.from('questions').select('id,exam_id,text,correct_choice,reference_answers').eq('id', questionB).single()
    const permissionBefore = await adminClient.from('exam_permissions').select('id,exam_id,group_id,student_id').eq('id', permissionB).single()
    const membershipBefore = await adminClient.from('group_students').select('group_id,student_id').eq('group_id', groupB).eq('student_id', member!.userId).single()
    for (const result of [groupBefore, examBefore, questionBefore, permissionBefore, membershipBefore]) expect(result.error).toBeNull()

    await expectEmptyRows('A select B group', await ownerA!.client.from('groups').select('id,name').eq('id', groupB))
    await expectEmptyRows('A select B exam', await ownerA!.client.from('exams').select('id,title').eq('id', examB))
    await expectEmptyRows('A select B question', await ownerA!.client.from('questions').select('id,text').eq('id', questionB))
    await expectEmptyRows('A select B exam permission', await ownerA!.client.from('exam_permissions').select('id,exam_id,group_id').eq('id', permissionB))
    await expectEmptyRows('A select B group membership', await ownerA!.client.from('group_students').select('group_id,student_id').eq('group_id', groupB).eq('student_id', member!.userId))

    await expectDeniedAndUnchanged(
      'A update B group',
      await ownerA!.client.from('groups').update({ name: `${prefix}-stolen-group` }).eq('id', groupB).select('id,name'),
      () => adminClient.from('groups').select('id,name,owner_id,admin_id').eq('id', groupB).single(),
      groupBefore.data,
    )
    await expectDeniedAndUnchanged(
      'A delete B group',
      await ownerA!.client.from('groups').delete().eq('id', groupB).select('id'),
      () => adminClient.from('groups').select('id,name,owner_id,admin_id').eq('id', groupB).single(),
      groupBefore.data,
    )
    await expectDeniedAndUnchanged(
      'A update B exam',
      await ownerA!.client.from('exams').update({ title: `${prefix}-stolen-exam` }).eq('id', examB).select('id,title'),
      () => adminClient.from('exams').select('id,title,owner_id,admin_id').eq('id', examB).single(),
      examBefore.data,
    )
    await expectDeniedAndUnchanged(
      'A delete B exam',
      await ownerA!.client.from('exams').delete().eq('id', examB).select('id'),
      () => adminClient.from('exams').select('id,title,owner_id,admin_id').eq('id', examB).single(),
      examBefore.data,
    )
    await expectDeniedAndUnchanged(
      'A update B question',
      await ownerA!.client.from('questions').update({ text: `${prefix}-stolen-question` }).eq('id', questionB).select('id,text'),
      () => adminClient.from('questions').select('id,exam_id,text,correct_choice,reference_answers').eq('id', questionB).single(),
      questionBefore.data,
    )
    await expectDeniedAndUnchanged(
      'A delete B question',
      await ownerA!.client.from('questions').delete().eq('id', questionB).select('id'),
      () => adminClient.from('questions').select('id,exam_id,text,correct_choice,reference_answers').eq('id', questionB).single(),
      questionBefore.data,
    )
    await expectDeniedAndUnchanged(
      'A update B exam permission',
      await ownerA!.client.from('exam_permissions').update({ group_id: groupA }).eq('id', permissionB).select('id,group_id'),
      () => adminClient.from('exam_permissions').select('id,exam_id,group_id,student_id').eq('id', permissionB).single(),
      permissionBefore.data,
    )
    await expectDeniedAndUnchanged(
      'A delete B exam permission',
      await ownerA!.client.from('exam_permissions').delete().eq('id', permissionB).select('id'),
      () => adminClient.from('exam_permissions').select('id,exam_id,group_id,student_id').eq('id', permissionB).single(),
      permissionBefore.data,
    )
    await expectDeniedAndUnchanged(
      'A update B group membership',
      await ownerA!.client.from('group_students').update({ student_id: outsider!.userId }).eq('group_id', groupB).eq('student_id', member!.userId).select('group_id,student_id'),
      () => adminClient.from('group_students').select('group_id,student_id').eq('group_id', groupB).eq('student_id', member!.userId).single(),
      membershipBefore.data,
      '42501',
    )
    await expectDeniedAndUnchanged(
      'A delete B group membership',
      await ownerA!.client.from('group_students').delete().eq('group_id', groupB).eq('student_id', member!.userId).select('group_id,student_id'),
      () => adminClient.from('group_students').select('group_id,student_id').eq('group_id', groupB).eq('student_id', member!.userId).single(),
      membershipBefore.data,
    )

    const invitationStatusBefore = await ownerB!.client.rpc('get_group_invitation_status', { target_group_id: groupB })
    expect(invitationStatusBefore.error).toBeNull()
    const foreignStatus = await ownerA!.client.rpc('get_group_invitation_status', { target_group_id: groupB })
    await expectErrorCode('A read B invitation lifecycle', foreignStatus, '42501')
    const foreignRevocation = await ownerA!.client.rpc('revoke_group_invitation', { target_group_id: groupB })
    await expectErrorCode('A revoke B invitation', foreignRevocation, '42501')
    const invitationStatusAfter = await ownerB!.client.rpc('get_group_invitation_status', { target_group_id: groupB })
    expect(invitationStatusAfter.error).toBeNull()
    expect(invitationStatusAfter.data).toEqual(invitationStatusBefore.data)

    for (const table of ['groups', 'exams'] as const) {
      const marker = `${prefix}-${table}-spoof-owner`
      const fields = table === 'groups' ? { name: marker } : {
        title: marker,
        start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 45,
      }
      const ownerSpoof = await ownerA!.client.from(table).insert({ ...fields, owner_id: ownerB!.userId })
        .select('id')
      await expectErrorCode(`A insert ${table} owner_id=B`, ownerSpoof, '42501')
      const noOwnerSpoof = await adminClient.from(table).select('id').eq(table === 'groups' ? 'name' : 'title', marker)
      expect(noOwnerSpoof.error).toBeNull()
      expect(noOwnerSpoof.data).toEqual([])

      const mirrorOnly = await ownerA!.client.from(table).insert({ ...fields, admin_id: ownerB!.userId }).select('id')
      await expectErrorCode(`A insert ${table} admin_id=B`, mirrorOnly, '42501')
      const mirrorOnlyCheck = await adminClient.from(table).select('id').eq(table === 'groups' ? 'name' : 'title', marker)
      expect(mirrorOnlyCheck.error).toBeNull()
      expect(mirrorOnlyCheck.data).toEqual([])

      const conflictingOwners = await ownerA!.client.from(table)
        .insert({ ...fields, owner_id: ownerA!.userId, admin_id: ownerB!.userId }).select('id')
      await expectErrorCode(`A insert ${table} owner_id=A/admin_id=B`, conflictingOwners, '23514')
      const conflictingCheck = await adminClient.from(table).select('id').eq(table === 'groups' ? 'name' : 'title', marker)
      expect(conflictingCheck.error).toBeNull()
      expect(conflictingCheck.data).toEqual([])
    }

    const transferChecks = [
      {
        name: 'A transfer own group with owner_id',
        attack: await ownerA!.client.from('groups').update({ owner_id: ownerB!.userId }).eq('id', groupA).select('id'),
        read: () => adminClient.from('groups').select('id,owner_id,admin_id').eq('id', groupA).single(),
        before: await adminClient.from('groups').select('id,owner_id,admin_id').eq('id', groupA).single(),
      },
      {
        name: 'A transfer own group with admin_id',
        attack: await ownerA!.client.from('groups').update({ admin_id: ownerB!.userId }).eq('id', groupA).select('id'),
        read: () => adminClient.from('groups').select('id,owner_id,admin_id').eq('id', groupA).single(),
        before: await adminClient.from('groups').select('id,owner_id,admin_id').eq('id', groupA).single(),
      },
      {
        name: 'A transfer own exam with owner_id',
        attack: await ownerA!.client.from('exams').update({ owner_id: ownerB!.userId }).eq('id', examA).select('id'),
        read: () => adminClient.from('exams').select('id,owner_id,admin_id').eq('id', examA).single(),
        before: await adminClient.from('exams').select('id,owner_id,admin_id').eq('id', examA).single(),
      },
      {
        name: 'A transfer own exam with admin_id',
        attack: await ownerA!.client.from('exams').update({ admin_id: ownerB!.userId }).eq('id', examA).select('id'),
        read: () => adminClient.from('exams').select('id,owner_id,admin_id').eq('id', examA).single(),
        before: await adminClient.from('exams').select('id,owner_id,admin_id').eq('id', examA).single(),
      },
    ]
    for (const attempt of transferChecks) {
      expect(attempt.before.error).toBeNull()
      await expectDeniedAndUnchanged(attempt.name, attempt.attack, attempt.read, attempt.before.data, '42501')
    }

    const takeoverGroup = await ownerA!.client.from('groups').update({ owner_id: ownerA!.userId }).eq('id', groupB).select('id')
    await expectDeniedAndUnchanged('A take B group with owner_id', takeoverGroup,
      () => adminClient.from('groups').select('id,name,owner_id,admin_id').eq('id', groupB).single(), groupBefore.data)
    const takeoverGroupMirror = await ownerA!.client.from('groups').update({ admin_id: ownerA!.userId }).eq('id', groupB).select('id')
    await expectDeniedAndUnchanged('A take B group with admin_id', takeoverGroupMirror,
      () => adminClient.from('groups').select('id,name,owner_id,admin_id').eq('id', groupB).single(), groupBefore.data)
    const takeoverExam = await ownerA!.client.from('exams').update({ owner_id: ownerA!.userId }).eq('id', examB).select('id')
    await expectDeniedAndUnchanged('A take B exam with owner_id', takeoverExam,
      () => adminClient.from('exams').select('id,title,owner_id,admin_id').eq('id', examB).single(), examBefore.data)
    const takeoverExamMirror = await ownerA!.client.from('exams').update({ admin_id: ownerA!.userId }).eq('id', examB).select('id')
    await expectDeniedAndUnchanged('A take B exam with admin_id', takeoverExamMirror,
      () => adminClient.from('exams').select('id,title,owner_id,admin_id').eq('id', examB).single(), examBefore.data)

    const permissionCountBefore = await adminClient.from('exam_permissions').select('id,exam_id,group_id,student_id')
      .in('exam_id', [examA, examB]).order('exam_id')
    expect(permissionCountBefore.error).toBeNull()
    const attachAToB = await ownerA!.client.from('exam_permissions').insert({ exam_id: examA, group_id: groupB }).select('id')
    await expectErrorCode('A attach A exam to B group', attachAToB, '23514')
    const attachAToBCheck = await adminClient.from('exam_permissions').select('id,exam_id,group_id,student_id')
      .in('exam_id', [examA, examB]).order('exam_id')
    expect(attachAToBCheck.data).toEqual(permissionCountBefore.data)
    const attachBToA = await ownerA!.client.from('exam_permissions').insert({ exam_id: examB, group_id: groupA }).select('id')
    await expectErrorCode('A attach B exam to A group', attachBToA, '23514')
    const attachBToACheck = await adminClient.from('exam_permissions').select('id,exam_id,group_id,student_id')
      .in('exam_id', [examA, examB]).order('exam_id')
    expect(attachBToACheck.error).toBeNull()
    expect(attachBToACheck.data).toEqual(permissionCountBefore.data)
  }, 120_000)
})

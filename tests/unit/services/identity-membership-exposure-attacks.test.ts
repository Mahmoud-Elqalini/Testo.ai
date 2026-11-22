import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient } from '../helpers/supabase-admin'
import { createAnonymousAttackClient, createAttackIdentity, logAttackOutcome, type AttackIdentity } from './identity-attack-context'

type QueryResult = { data: unknown; error: { code?: string } | null }

async function insertOwnedExam(owner: AttackIdentity, title: string, isPublished: boolean) {
  const { data, error } = await owner.client.from('exams').insert({
    title,
    start_time: new Date(Date.now() - 60 * 1000).toISOString(),
    duration_minutes: 90,
    owner_id: owner.userId,
    is_published: isPublished,
  }).select('id').single()
  if (error || !data) throw error ?? new Error('Could not create the group-access exam fixture')
  return data.id as string
}

async function expectHiddenRows(name: string, result: QueryResult) {
  logAttackOutcome(name, result.error ? { errorCode: result.error.code } : { rows: result.data })
  if (result.error) expect(result.error.code).toBe('42501')
  else expect(result.data).toEqual([])
}

async function expectRpcDenied(name: string, result: QueryResult) {
  logAttackOutcome(name, result.error ? { errorCode: result.error.code } : { data: result.data })
  expect(result.error?.code).toBe('42501')
}

describe('unified identity membership and answer exposure attacks (live local Supabase)', () => {
  let owner: AttackIdentity | undefined
  let memberA: AttackIdentity | undefined
  let memberB: AttackIdentity | undefined
  let outsider: AttackIdentity | undefined
  let groupId: string
  let examId: string
  let unpublishedExamId: string
  let permissionId: string
  let questionIds: string[]
  let attemptAId: string
  let attemptBId: string
  let sessionA: string
  let sessionB: string
  let invitationCode: string
  const anonClient = createAnonymousAttackClient()
  const prefix = `identity-exposure-${crypto.randomUUID()}`

  beforeAll(async () => {
    owner = await createAttackIdentity('exposure-owner')
    memberA = await createAttackIdentity('exposure-member-a')
    memberB = await createAttackIdentity('exposure-member-b')
    outsider = await createAttackIdentity('exposure-outsider')

    const { data: group, error: groupError } = await owner.client.from('groups').insert({
      name: `${prefix}-group`, owner_id: owner.userId,
    }).select('id').single()
    if (groupError || !group) throw groupError ?? new Error('Could not create the member group fixture')
    groupId = group.id

    examId = await insertOwnedExam(owner, `${prefix}-published-after-membership`, false)
    unpublishedExamId = await insertOwnedExam(owner, `${prefix}-unpublished`, false)
    const { data: permission, error: permissionError } = await owner.client.from('exam_permissions')
      .insert({ exam_id: examId, group_id: groupId }).select('id').single()
    if (permissionError || !permission) throw permissionError ?? new Error('Could not create the group exam permission fixture')
    permissionId = permission.id
    const { error: unpublishedPermissionError } = await owner.client.from('exam_permissions')
      .insert({ exam_id: unpublishedExamId, group_id: groupId })
    if (unpublishedPermissionError) throw unpublishedPermissionError

    const { data: invitation, error: invitationError } = await owner.client.rpc('create_group_invitation', { target_group_id: groupId })
    if (invitationError || !invitation) throw invitationError ?? new Error('Could not create the membership invitation fixture')
    invitationCode = (invitation as { code: string }).code
    for (const student of [memberA, memberB]) {
      const { data, error } = await student.client.rpc('redeem_group_invitation', { invitation_code: invitationCode })
      if (error || JSON.stringify(data) !== JSON.stringify({ success: true })) {
        throw error ?? new Error('A member could not redeem the group invitation fixture')
      }
    }

    const { data: questions, error: questionError } = await owner.client.from('questions').insert([
      {
        exam_id: examId,
        type: 'mcq',
        text: `${prefix}-multiple-choice`,
        order: 1,
        mcq_choices: [{ id: 'alpha', text: 'Alpha' }, { id: 'beta', text: 'Beta' }],
        correct_choice: 'alpha',
      },
      {
        exam_id: examId,
        type: 'essay',
        text: `${prefix}-essay`,
        order: 2,
        reference_answers: [{ id: 'reference', text: 'Confidential reference answer' }],
      },
    ]).select('id')
    if (questionError || !questions || questions.length !== 2) throw questionError ?? new Error('Could not create the answer-key question fixtures')
    questionIds = questions.map(({ id }) => id)

  }, 60_000)

  afterAll(async () => {
    const identities = [outsider, memberB, memberA, owner].filter((identity): identity is AttackIdentity => Boolean(identity))
    const cleanupFailures: unknown[] = []
    for (const identity of identities) {
      try { await identity.cleanup() } catch (error) { cleanupFailures.push(error) }
    }
    const { error: anonSignOutError } = await anonClient.auth.signOut()
    if (anonSignOutError) cleanupFailures.push(anonSignOutError)
    if (cleanupFailures.length > 0) throw new AggregateError(cleanupFailures, 'Membership and exposure attack fixture cleanup failed')
  }, 60_000)

  it('limits exam and participant visibility to current group membership and hides answer keys and other attempts', async () => {
    const unpublished = await memberA!.client.from('exams').select('id').eq('id', examId)
    const separatelyUnpublished = await memberA!.client.from('exams').select('id').eq('id', unpublishedExamId)
    await expectHiddenRows('member cannot read unpublished permitted exam', unpublished)
    await expectHiddenRows('member cannot read second unpublished exam', separatelyUnpublished)

    const { error: publishError } = await owner!.client.from('exams').update({ is_published: true }).eq('id', examId)
    expect(publishError).toBeNull()
    const publishedMember = await memberA!.client.from('exams').select('id').eq('id', examId)
    logAttackOutcome('group member reads published permitted exam', publishedMember.error ? { errorCode: publishedMember.error.code } : { rows: publishedMember.data })
    expect(publishedMember.error).toBeNull()
    expect(publishedMember.data).toEqual([{ id: examId }])
    const publishedOutsider = await outsider!.client.from('exams').select('id').eq('id', examId)
    await expectHiddenRows('non-member cannot read published exam', publishedOutsider)

    const { data: fixtureAttempts, error: attemptsError } = await adminClient.from('exam_attempts').insert([
      { exam_id: examId, student_id: memberA!.userId, access_token: crypto.randomUUID(), status: 'pending' },
      { exam_id: examId, student_id: memberB!.userId, access_token: crypto.randomUUID(), status: 'pending' },
    ]).select('id,student_id')
    expect(attemptsError).toBeNull()
    expect(fixtureAttempts).toHaveLength(2)
    attemptAId = fixtureAttempts!.find(({ student_id }) => student_id === memberA!.userId)!.id
    attemptBId = fixtureAttempts!.find(({ student_id }) => student_id === memberB!.userId)!.id
    sessionA = crypto.randomUUID()
    sessionB = crypto.randomUUID()

    const startA = await memberA!.client.rpc('fn_start_attempt', { p_attempt_id: attemptAId, p_session_id: sessionA })
    expect(startA.error).toBeNull()
    expect(startA.data).toMatchObject({ attempt_id: attemptAId, session_id: sessionA })
    const startB = await memberB!.client.rpc('fn_start_attempt', { p_attempt_id: attemptBId, p_session_id: sessionB })
    expect(startB.error).toBeNull()
    expect(startB.data).toMatchObject({ attempt_id: attemptBId, session_id: sessionB })

    const hiddenColumnRead = await memberA!.client.from('questions')
      .select('id,correct_choice,reference_answers').eq('exam_id', examId)
    await expectHiddenRows('member direct select of answer-key columns', hiddenColumnRead)
    const questionsA = await memberA!.client.rpc('fn_get_exam_questions', { p_attempt_id: attemptAId, p_session_id: sessionA })
    expect(questionsA.error).toBeNull()
    expect(questionsA.data).toHaveProperty('questions')
    const visibleQuestions = (questionsA.data as { questions: Array<Record<string, unknown>> }).questions
    expect(visibleQuestions).toHaveLength(2)
    for (const question of visibleQuestions) {
      expect(question).not.toHaveProperty('correct_choice')
      expect(question).not.toHaveProperty('reference_answers')
    }
    logAttackOutcome('member question RPC omits answer keys', visibleQuestions)

    const saveA = await memberA!.client.rpc('fn_save_attempt_answer', {
      p_attempt_id: attemptAId,
      p_session_id: sessionA,
      p_question_id: questionIds[0],
      p_mcq_answer: 'alpha',
      p_essay_answer: null,
    })
    expect(saveA.error).toBeNull()
    expect(saveA.data).toMatchObject({ saved: true, question_id: questionIds[0] })
    const saveB = await memberB!.client.rpc('fn_save_attempt_answer', {
      p_attempt_id: attemptBId,
      p_session_id: sessionB,
      p_question_id: questionIds[0],
      p_mcq_answer: 'beta',
      p_essay_answer: null,
    })
    expect(saveB.error).toBeNull()
    expect(saveB.data).toMatchObject({ saved: true, question_id: questionIds[0] })

    const { data: storedAnswers, error: storedAnswersError } = await adminClient.from('answers')
      .select('attempt_id,question_id,mcq_answer').in('attempt_id', [attemptAId, attemptBId]).order('attempt_id')
    expect(storedAnswersError).toBeNull()
    expect(storedAnswers).toHaveLength(2)
    const ownAnswersA = await memberA!.client.from('answers').select('attempt_id,question_id,mcq_answer').eq('attempt_id', attemptBId)
    await expectHiddenRows('member A cannot read member B answers', ownAnswersA)
    const ownAnswersB = await memberB!.client.from('answers').select('attempt_id,question_id,mcq_answer').eq('attempt_id', attemptAId)
    await expectHiddenRows('member B cannot read member A answers', ownAnswersB)
    const attemptReadB = await memberA!.client.from('exam_attempts').select('id,student_id,status').eq('id', attemptBId)
    await expectHiddenRows('member A cannot read member B attempt', attemptReadB)
    const attemptReadA = await memberB!.client.from('exam_attempts').select('id,student_id,status').eq('id', attemptAId)
    await expectHiddenRows('member B cannot read member A attempt', attemptReadA)

    const otherAttemptQuestions = await memberB!.client.rpc('fn_get_exam_questions', {
      p_attempt_id: attemptAId,
      p_session_id: sessionA,
    })
    expect(otherAttemptQuestions.error).toBeNull()
    expect(otherAttemptQuestions.data).toEqual({ denial_reason: 'owner_mismatch' })
    const memberAnswersA = await memberA!.client.rpc('fn_get_exam_questions', { p_attempt_id: attemptAId, p_session_id: sessionA })
    expect(memberAnswersA.error).toBeNull()
    expect((memberAnswersA.data as { answers: Array<Record<string, unknown>> }).answers)
      .toContainEqual({ question_id: questionIds[0], mcq_answer: 'alpha', essay_answer: null })
    expect(JSON.stringify(memberAnswersA.data)).not.toContain('Confidential reference answer')

    const { data: associatedMembers, error: associatedError } = await owner!.client.rpc('list_associated_participants', {
      p_context_kind: 'group', p_context_id: groupId,
    })
    expect(associatedError).toBeNull()
    expect(associatedMembers).toHaveLength(2)
    const ownerParticipantsOutsideGroup = await outsider!.client.rpc('list_associated_participants', {
      p_context_kind: 'group', p_context_id: groupId,
    })
    expect(ownerParticipantsOutsideGroup.error).toBeNull()
    expect(ownerParticipantsOutsideGroup.data).toEqual([])
    const ownerParticipantsOutsideExam = await outsider!.client.rpc('list_associated_participants', {
      p_context_kind: 'exam', p_context_id: examId,
    })
    expect(ownerParticipantsOutsideExam.error).toBeNull()
    expect(ownerParticipantsOutsideExam.data).toEqual([])
    const existingUnrelatedEmail = await outsider!.client.rpc('lookup_associated_participant', {
      p_context_kind: 'group', p_context_id: groupId, p_email: memberA!.email,
    })
    const nonexistentEmail = await outsider!.client.rpc('lookup_associated_participant', {
      p_context_kind: 'group', p_context_id: groupId, p_email: `missing-${crypto.randomUUID()}@testo.local`,
    })
    expect(existingUnrelatedEmail.error).toBeNull()
    expect(nonexistentEmail.error).toBeNull()
    expect(existingUnrelatedEmail.data).toEqual([])
    expect(nonexistentEmail.data).toEqual([])
    expect(existingUnrelatedEmail.data).toEqual(nonexistentEmail.data)
    logAttackOutcome('unrelated email lookup response shapes', {
      existingAccount: existingUnrelatedEmail.data,
      nonexistentAccount: nonexistentEmail.data,
    })

    const submitA = await memberA!.client.rpc('fn_submit_attempt', { p_attempt_id: attemptAId, p_session_id: sessionA })
    expect(submitA.error).toBeNull()
    expect(submitA.data).toMatchObject({ attempt_id: attemptAId, status: 'submitted' })
    const submitB = await memberB!.client.rpc('fn_submit_attempt', { p_attempt_id: attemptBId, p_session_id: sessionB })
    expect(submitB.error).toBeNull()
    expect(submitB.data).toMatchObject({ attempt_id: attemptBId, status: 'submitted' })
    const { data: removedMembership, error: removeError } = await owner!.client.from('group_students').delete()
      .eq('group_id', groupId).eq('student_id', memberA!.userId).select('group_id,student_id')
    expect(removeError).toBeNull()
    expect(removedMembership).toEqual([{ group_id: groupId, student_id: memberA!.userId }])
    const removedVerified = await adminClient.from('group_students').select('group_id,student_id')
      .eq('group_id', groupId).eq('student_id', memberA!.userId)
    expect(removedVerified.error).toBeNull()
    expect(removedVerified.data).toEqual([])
    const revokedExamRead = await memberA!.client.from('exams').select('id').eq('id', examId)
    await expectHiddenRows('removed member loses published exam access', revokedExamRead)
    const revokedQuestionRead = await memberA!.client.rpc('fn_get_exam_questions', {
      p_attempt_id: attemptAId, p_session_id: sessionA,
    })
    expect(revokedQuestionRead.error).toBeNull()
    expect(revokedQuestionRead.data).toEqual({ denial_reason: 'owner_mismatch' })
    const memberBStillHasExam = await memberB!.client.from('exams').select('id').eq('id', examId)
    expect(memberBStillHasExam.error).toBeNull()
    expect(memberBStillHasExam.data).toEqual([{ id: examId }])
  }, 120_000)

  it('blocks anonymous table reads and all sensitive 0017 SECURITY DEFINER RPCs', async () => {
    const { data: sessionData, error: sessionError } = await anonClient.auth.getSession()
    expect(sessionError).toBeNull()
    expect(sessionData.session).toBeNull()

    const anonymousReads: Array<[string, PromiseLike<QueryResult>]> = [
      ['groups', anonClient.from('groups').select('id').eq('id', groupId)],
      ['exams', anonClient.from('exams').select('id').eq('id', examId)],
      ['questions', anonClient.from('questions').select('id').eq('exam_id', examId)],
      ['exam_permissions', anonClient.from('exam_permissions').select('id').eq('id', permissionId)],
      ['group_students', anonClient.from('group_students').select('group_id,student_id').eq('group_id', groupId)],
      ['exam_attempts', anonClient.from('exam_attempts').select('id,exam_id,student_id,status').eq('id', attemptAId)],
      ['answers', anonClient.from('answers').select('attempt_id,question_id,mcq_answer').eq('attempt_id', attemptAId)],
      ['profiles', anonClient.from('profiles').select('id,full_name').eq('id', memberA!.userId)],
    ]
    for (const [name, query] of anonymousReads) await expectHiddenRows(`anonymous read ${name}`, await query)
    const privateInvitationRead = await anonClient.schema('private').from('group_invitations').select('*').eq('group_id', groupId)
    logAttackOutcome('anonymous read private invitation table', privateInvitationRead.error ? { errorCode: privateInvitationRead.error.code } : { rows: privateInvitationRead.data })
    expect(privateInvitationRead.error).not.toBeNull()

    const rpcAttacks: Array<[string, PromiseLike<QueryResult>]> = [
      ['fn_start_attempt', anonClient.rpc('fn_start_attempt', { p_attempt_id: attemptAId, p_session_id: sessionA })],
      ['fn_get_exam_questions', anonClient.rpc('fn_get_exam_questions', { p_attempt_id: attemptAId, p_session_id: sessionA })],
      ['fn_save_attempt_answer', anonClient.rpc('fn_save_attempt_answer', {
        p_attempt_id: attemptAId, p_session_id: sessionA, p_question_id: questionIds[0], p_mcq_answer: 'alpha', p_essay_answer: null,
      })],
      ['fn_submit_attempt', anonClient.rpc('fn_submit_attempt', { p_attempt_id: attemptAId, p_session_id: sessionA })],
      ['fn_get_student_attempt_result', anonClient.rpc('fn_get_student_attempt_result', { p_attempt_id: attemptAId })],
      ['create_group_invitation', anonClient.rpc('create_group_invitation', { target_group_id: groupId })],
      ['rotate_group_invitation', anonClient.rpc('rotate_group_invitation', { target_group_id: groupId })],
      ['revoke_group_invitation', anonClient.rpc('revoke_group_invitation', { target_group_id: groupId })],
      ['get_group_invitation_status', anonClient.rpc('get_group_invitation_status', { target_group_id: groupId })],
      ['redeem_group_invitation', anonClient.rpc('redeem_group_invitation', { invitation_code: invitationCode })],
      ['list_owned_exam_permissions', anonClient.rpc('list_owned_exam_permissions', { target_exam_id: examId })],
      ['list_my_joined_groups', anonClient.rpc('list_my_joined_groups')],
      ['list_associated_participants', anonClient.rpc('list_associated_participants', { p_context_kind: 'group', p_context_id: groupId })],
      ['lookup_associated_participant', anonClient.rpc('lookup_associated_participant', {
        p_context_kind: 'group', p_context_id: groupId, p_email: memberA!.email,
      })],
    ]
    for (const [name, call] of rpcAttacks) await expectRpcDenied(`anonymous RPC ${name}`, await call)
  }, 60_000)
})

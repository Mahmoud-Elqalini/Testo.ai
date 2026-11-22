import { createTestAdmin, createTestStudent } from '../services/test-context'
import { adminClient } from '../helpers/supabase-admin'

export async function createAttemptFixture(options: {
  startsInMs?: number;
  durationMinutes?: number;
  status?: string;
  sessionId?: string;
  withEssayQuestion?: boolean;
} = {}) {
  const admin = await createTestAdmin()
  const student = await createTestStudent()
  const startTime = new Date(Date.now() + (options.startsInMs ?? -60_000)).toISOString()
  const { data: exam, error: examError } = await adminClient.from('exams').insert({
    title: `Attempt test ${crypto.randomUUID()}`,
    start_time: startTime,
    duration_minutes: options.durationMinutes ?? 30,
    owner_id: admin.userId,
    is_published: true,
  }).select('id').single()
  if (examError || !exam) throw examError ?? new Error('Exam was not created')
  const { data: question, error: questionError } = await adminClient.from('questions').insert({
    exam_id: exam.id,
    type: 'mcq',
    text: 'Which answer is correct?',
    points: 2,
    order: 1,
    mcq_choices: [{ id: 'a', text: 'Alpha', is_correct: true }, { id: 'b', text: 'Beta' }],
    correct_choice: 'a',
    reference_answers: [{ id: 'ref1', text: 'private reference' }],
  }).select('id').single()
  if (questionError || !question) throw questionError ?? new Error('Question was not created')

  let essayQuestionId: string | undefined
  if (options.withEssayQuestion) {
    const { data: essay, error: essayError } = await adminClient.from('questions').insert({
      exam_id: exam.id,
      type: 'essay',
      text: 'Explain your reasoning.',
      points: 5,
      order: 2,
      reference_answers: [{ id: 'ref2', text: 'Expected explanation' }],
    }).select('id').single()
    if (essayError || !essay) throw essayError ?? new Error('Essay question was not created')
    essayQuestionId = essay.id
  }

  const { data: attempt, error: attemptError } = await adminClient.from('exam_attempts').insert({
    exam_id: exam.id,
    student_id: student.userId,
    access_token: crypto.randomUUID(),
    status: options.status ?? 'pending',
    session_id: options.sessionId ?? null,
  }).select('id').single()
  if (attemptError || !attempt) throw attemptError ?? new Error('Attempt was not created')

  const { data: group, error: groupError } = await adminClient.from('groups').insert({
    name: `Attempt test group ${crypto.randomUUID()}`,
    owner_id: admin.userId,
  }).select('id').single()
  if (groupError || !group) throw groupError ?? new Error('Group was not created')

  const { error: membershipError } = await adminClient.from('group_students').insert({
    group_id: group.id,
    student_id: student.userId,
  })
  if (membershipError) throw membershipError

  const { error: permissionError } = await adminClient.from('exam_permissions').insert({
    exam_id: exam.id,
    group_id: group.id,
  })
  if (permissionError) throw permissionError

  return {
    admin, student, examId: exam.id, questionId: question.id, essayQuestionId, attemptId: attempt.id,
    async cleanup() {
      const cleanupErrors: unknown[] = []
      const runCleanupStep = async (label: string, step: () => PromiseLike<{ error?: unknown } | void> | { error?: unknown } | void) => {
        try {
          const result = await step()
          if (result?.error) cleanupErrors.push(new Error(`${label} failed`, { cause: result.error }))
        } catch (error) {
          cleanupErrors.push(new Error(`${label} failed`, { cause: error }))
        }
      }

      await runCleanupStep('Delete fixture answers', () => adminClient.from('answers').delete().eq('attempt_id', attempt.id))
      await runCleanupStep('Delete fixture attempt', () => adminClient.from('exam_attempts').delete().eq('id', attempt.id))
      await runCleanupStep('Delete fixture exam permission', () => adminClient.from('exam_permissions').delete().eq('exam_id', exam.id).eq('group_id', group.id))
      await runCleanupStep('Delete fixture group membership', () => adminClient.from('group_students').delete().eq('group_id', group.id).eq('student_id', student.userId))
      await runCleanupStep('Delete fixture group', () => adminClient.from('groups').delete().eq('id', group.id))
      await runCleanupStep('Delete fixture questions', () => adminClient.from('questions').delete().eq('exam_id', exam.id))
      await runCleanupStep('Delete fixture exam', () => adminClient.from('exams').delete().eq('id', exam.id))
      await runCleanupStep('Sign out fixture student', () => student.client.auth.signOut())
      await runCleanupStep('Sign out fixture admin', () => admin.client.auth.signOut())
      await runCleanupStep('Delete fixture student user', () => adminClient.auth.admin.deleteUser(student.userId))
      await runCleanupStep('Delete fixture admin user', () => adminClient.auth.admin.deleteUser(admin.userId))

      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, `Attempt fixture cleanup had ${cleanupErrors.length} error(s)`)
      }
    },
  }
}

export async function responseBody(error: unknown) {
  const response = (error as { context?: Response } | null)?.context
  return response ? { status: response.status, body: await response.clone().json() as Record<string, unknown> } : null
}

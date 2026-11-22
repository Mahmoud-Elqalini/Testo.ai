import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '../helpers/supabase-admin'

const password = 'Unified-identity-attack-test-password-123!'
type AttackClient = SupabaseClient<any, any, any>

export interface AttackIdentity {
  userId: string
  email: string
  client: AttackClient
  cleanup(): Promise<void>
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Local Supabase URL and anon key are required for identity attack tests')
  return { url, anonKey }
}

export async function createAttackIdentity(label: string): Promise<AttackIdentity> {
  const email = `identity-attack-${label}-${crypto.randomUUID()}@testo.local`
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('Supabase did not return the attack test user')

  const { url, anonKey } = config()
  const client: AttackClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `identity-attack-${crypto.randomUUID()}`,
    },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(data.user.id)
    if (deleteError) throw new AggregateError([signInError, deleteError], 'Could not initialize or clean up an attack test user')
    throw signInError
  }

  return {
    userId: data.user.id,
    email,
    client,
    async cleanup() {
      const { error: signOutError } = await client.auth.signOut()
      if (signOutError) throw signOutError

      const { error: studentAttemptsError } = await adminClient.from('exam_attempts').delete().eq('student_id', data.user.id)
      if (studentAttemptsError) throw studentAttemptsError
      const { data: ownedExams, error: ownedExamsError } = await adminClient.from('exams')
        .select('id').eq('owner_id', data.user.id)
      if (ownedExamsError) throw ownedExamsError
      const examIds = (ownedExams ?? []).map(({ id }) => id)
      if (examIds.length > 0) {
        const { error: ownedAttemptsError } = await adminClient.from('exam_attempts').delete().in('exam_id', examIds)
        if (ownedAttemptsError) throw ownedAttemptsError
        const { error: examPermissionsError } = await adminClient.from('exam_permissions').delete().in('exam_id', examIds)
        if (examPermissionsError) throw examPermissionsError
        const { error: questionsError } = await adminClient.from('questions').delete().in('exam_id', examIds)
        if (questionsError) throw questionsError
        const { error: examsDeleteError } = await adminClient.from('exams').delete().in('id', examIds)
        if (examsDeleteError) throw examsDeleteError
      }

      const { data: ownedGroups, error: ownedGroupsError } = await adminClient.from('groups')
        .select('id').eq('owner_id', data.user.id)
      if (ownedGroupsError) throw ownedGroupsError
      const groupIds = (ownedGroups ?? []).map(({ id }) => id)
      if (groupIds.length > 0) {
        const { error: groupPermissionsError } = await adminClient.from('exam_permissions').delete().in('group_id', groupIds)
        if (groupPermissionsError) throw groupPermissionsError
        const { error: groupAttemptsError } = await adminClient.from('group_students').delete().in('group_id', groupIds)
        if (groupAttemptsError) throw groupAttemptsError
      }
      const { error: studentMembershipsError } = await adminClient.from('group_students').delete().eq('student_id', data.user.id)
      if (studentMembershipsError) throw studentMembershipsError
      if (groupIds.length > 0) {
        const { error: groupsDeleteError } = await adminClient.from('groups').delete().in('id', groupIds)
        if (groupsDeleteError) throw groupsDeleteError
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(data.user.id)
      if (deleteError) throw new Error(`Could not clean up attack test user ${data.user.id}: ${deleteError.message}`, { cause: deleteError })
    },
  }
}

export function createAnonymousAttackClient(): AttackClient {
  const { url, anonKey } = config()
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `identity-attack-anon-${crypto.randomUUID()}`,
    },
  })
}

export async function setProfileRole(userId: string, role: 'admin' | 'student'): Promise<void> {
  const { error } = await adminClient.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}

export function logAttackOutcome(name: string, outcome: unknown): void {
  console.info(`[identity attack] ${name}: ${JSON.stringify(outcome)}`)
}

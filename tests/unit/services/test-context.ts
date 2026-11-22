import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '../helpers/supabase-admin'
import { signIn, signOut } from '../../../src/lib/auth'
import { createClient as createBrowserClient } from '../../../src/lib/supabase/client'

const password = 'Testo-service-test-password-123!'

function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Local Supabase URL and anon key are required for service tests')
  }

  return createSupabaseClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `testo-service-user-${crypto.randomUUID()}`,
    },
  })
}

async function createTestUser(role: 'admin' | 'student') {
  const email = `foundation-${role}-${crypto.randomUUID()}@testo.local`
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error || !data.user) {
    throw error ?? new Error('Supabase did not return the test user')
  }

  const client = role === 'admin' ? createBrowserClient() : createAnonClient()
  const { error: signInError } = role === 'admin'
    ? await signIn(email, password)
    : await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    await adminClient.auth.admin.deleteUser(data.user.id)
    throw signInError
  }

  return {
    userId: data.user.id,
    email,
    client,
    async cleanup() {
      if (role === 'admin') await signOut()
      else await client.auth.signOut()
      const { error: attemptsError } = await adminClient
        .from('exam_attempts')
        .delete()
        .eq('student_id', data.user.id)
      if (attemptsError) throw attemptsError

      const { data: ownedExams, error: examsError } = await adminClient
        .from('exams')
        .select('id')
        .eq('owner_id', data.user.id)
      if (examsError) throw examsError

      const examIds = (ownedExams ?? []).map(({ id }) => id)
      if (examIds.length > 0) {
        const { error: ownedAttemptsError } = await adminClient
          .from('exam_attempts')
          .delete()
          .in('exam_id', examIds)
        if (ownedAttemptsError) throw ownedAttemptsError

        const { error: permissionsError } = await adminClient
          .from('exam_permissions')
          .delete()
          .in('exam_id', examIds)
        if (permissionsError) throw permissionsError

        const { error: questionsError } = await adminClient
          .from('questions')
          .delete()
          .in('exam_id', examIds)
        if (questionsError) throw questionsError

        const { error: ownedExamsDeleteError } = await adminClient
          .from('exams')
          .delete()
          .in('id', examIds)
        if (ownedExamsDeleteError) throw ownedExamsDeleteError
      }

      const { data: ownedGroups, error: groupsSelectError } = await adminClient
        .from('groups')
        .select('id')
        .eq('owner_id', data.user.id)
      if (groupsSelectError) throw groupsSelectError
      const groupIds = (ownedGroups ?? []).map(({ id }) => id)
      if (groupIds.length > 0) {
        const { error: groupPermissionsError } = await adminClient
          .from('exam_permissions')
          .delete()
          .in('group_id', groupIds)
        if (groupPermissionsError) throw groupPermissionsError

        const { error: membershipsError } = await adminClient
          .from('group_students')
          .delete()
          .in('group_id', groupIds)
        if (membershipsError) throw membershipsError

        const { error: groupsError } = await adminClient
          .from('groups')
          .delete()
          .in('id', groupIds)
        if (groupsError) throw groupsError
      }

      const { error: membershipsByStudentError } = await adminClient
        .from('group_students')
        .delete()
        .eq('student_id', data.user.id)
      if (membershipsByStudentError) throw membershipsByStudentError

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(data.user.id)
      if (deleteError) throw deleteError
    },
  }
}

export function createTestAdmin() {
  return createTestUser('admin')
}

export function createTestStudent() {
  return createTestUser('student')
}

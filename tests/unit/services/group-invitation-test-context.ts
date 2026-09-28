import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '../helpers/supabase-admin'

const password = 'Testo-invitation-test-password-123!'

export async function createInvitationTestUser(role: 'admin' | 'student') {
  const email = `invitation-${role}-${crypto.randomUUID()}@testo.local`
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('Supabase did not return the test user')

  if (role === 'admin') {
    const { error: roleError } = await adminClient.from('profiles').update({ role }).eq('id', data.user.id)
    if (roleError) {
      await adminClient.auth.admin.deleteUser(data.user.id)
      throw roleError
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Local Supabase URL and anon key are required for invitation tests')

  const client = createSupabaseClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: `testo-invitation-user-${crypto.randomUUID()}`,
    },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    await adminClient.auth.admin.deleteUser(data.user.id)
    throw signInError
  }

  return {
    userId: data.user.id,
    email,
    client,
    async cleanup() {
      await client.auth.signOut()
      await adminClient.from('exam_attempts').delete().eq('student_id', data.user.id)
      if (role === 'admin') await adminClient.from('groups').delete().eq('admin_id', data.user.id)
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(data.user.id)
      if (deleteError) throw deleteError
    },
  }
}

export type InvitationTestUser = Awaited<ReturnType<typeof createInvitationTestUser>>

export async function createInvitationTestGroup(admin: InvitationTestUser) {
  const { data, error } = await adminClient
    .from('groups')
    .insert({ name: `Invitation group ${crypto.randomUUID()}`, admin_id: admin.userId })
    .select('id')
    .single()

  if (error || !data) throw error ?? new Error('Supabase did not return the test group')
  return data.id
}

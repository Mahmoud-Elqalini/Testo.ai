import { redirect } from 'next/navigation'
import StudentDashboard from '@/components/student/StudentDashboard'
import { createClient } from '@/lib/supabase/server'

export default async function StudentDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'student') redirect('/dashboard')
  return <StudentDashboard />
}

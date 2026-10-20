import { redirect } from 'next/navigation'
import StudentResultPage from '@/components/results/StudentResultPage'
import { createClient } from '@/lib/supabase/server'

export default async function StudentResultsRoute({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'student') redirect('/dashboard')
  return <StudentResultPage attemptId={attemptId} />
}

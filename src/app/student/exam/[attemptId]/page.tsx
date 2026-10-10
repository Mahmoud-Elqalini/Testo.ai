import { redirect } from 'next/navigation'
import ExamTakingPage from '@/components/exam/ExamTakingPage'
import { createClient } from '@/lib/supabase/server'

export default async function StudentExamPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'student') redirect('/dashboard')
  const { data: attempt } = await supabase.from('exam_attempts').select('exam:exams(title)').eq('id', attemptId).maybeSingle()
  const exam = Array.isArray(attempt?.exam) ? attempt.exam[0] : attempt?.exam
  return <ExamTakingPage attemptId={attemptId} examTitle={exam?.title ?? null} />
}

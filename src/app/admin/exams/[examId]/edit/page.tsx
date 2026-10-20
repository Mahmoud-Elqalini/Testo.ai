import { ExamForm } from '@/components/admin/ExamForm'
import { QuestionEditor } from '@/components/admin/QuestionEditor'
import { WorkspaceLayout } from '@/components/shared/WorkspaceLayout'

export default async function EditExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params

  return <WorkspaceLayout role="admin" active="exams"><main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <ExamForm examId={examId} />
      <QuestionEditor examId={examId} />
    </main></WorkspaceLayout>
}

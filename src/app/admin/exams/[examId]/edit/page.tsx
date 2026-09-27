import { ExamForm } from '@/components/admin/ExamForm'
import { QuestionEditor } from '@/components/admin/QuestionEditor'

export default async function EditExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-10 sm:px-6">
      <ExamForm examId={examId} />
      <QuestionEditor examId={examId} />
    </main>
  )
}

import { PublishExamConfirmation } from '@/components/admin/PublishExamConfirmation'

export default async function PublishExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  return (
    <main className="mx-auto flex w-full max-w-5xl justify-center px-4 py-10 sm:px-6">
      <PublishExamConfirmation examId={examId} />
    </main>
  )
}

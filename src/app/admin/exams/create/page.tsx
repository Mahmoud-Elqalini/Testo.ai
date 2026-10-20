import { ExamForm } from '@/components/admin/ExamForm'
import { WorkspaceLayout } from '@/components/shared/WorkspaceLayout'

export default function CreateExamPage() {
  return <WorkspaceLayout role="admin" active="exams"><main className="mx-auto w-full max-w-6xl"><ExamForm /></main></WorkspaceLayout>
}

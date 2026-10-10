import { invokeEdgeFunction } from '../edge-functions'
import type { GetExamQuestionsResponse, StartAttemptResponse, SubmitAttemptResponse } from '../types'

export interface SaveAnswerInput {
  attempt_id: string
  session_id: string
  question_id: string
  mcq_answer: string | null
  essay_answer: string | null
}

export async function startAttempt(attemptId: string) {
  return invokeEdgeFunction<StartAttemptResponse, { attempt_id: string }>('start-attempt', { body: { attempt_id: attemptId } })
}

export async function getExamQuestions(attemptId: string, sessionId: string) {
  return invokeEdgeFunction<GetExamQuestionsResponse>('get-exam-questions', {
    method: 'GET', query: { attempt_id: attemptId, session_id: sessionId },
  })
}

export async function saveAnswer(input: SaveAnswerInput) {
  return invokeEdgeFunction<{ saved: true; question_id: string; saved_at: string }, SaveAnswerInput>('save-answer', { body: input })
}

export async function submitAttempt(attemptId: string, sessionId: string) {
  return invokeEdgeFunction<SubmitAttemptResponse, { attempt_id: string; session_id: string }>('submit-attempt', {
    body: { attempt_id: attemptId, session_id: sessionId },
  })
}

import { callOperation, isUuid, preflight, validation } from '../_shared/http.ts'

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'GET') return validation('GET is required.')
  const url = new URL(request.url)
  const attemptId = url.searchParams.get('attempt_id')
  const sessionId = url.searchParams.get('session_id')
  if (!isUuid(attemptId) || !isUuid(sessionId)) return validation('Valid attempt_id and session_id are required.')
  return callOperation(request, 'get-exam-questions', 'fn_get_exam_questions', { p_attempt_id: attemptId, p_session_id: sessionId }, attemptId)
})

import { callOperation, isUuid, preflight, readJson, validation } from '../_shared/http.ts'

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') return validation('POST is required.')
  const body = await readJson(request)
  if (!body || !isUuid(body.attempt_id) || !isUuid(body.session_id) || !isUuid(body.question_id)) return validation('Valid attempt_id, session_id, and question_id are required.')
  if (!(body.mcq_answer === null || typeof body.mcq_answer === 'string') || !(body.essay_answer === null || typeof body.essay_answer === 'string')) return validation('Both answer fields must be text or null.')
  if (body.mcq_answer !== null && body.essay_answer !== null) return validation('Only one answer type may be submitted at a time.')
  return callOperation(request, 'save-answer', 'fn_save_attempt_answer', {
    p_attempt_id: body.attempt_id, p_session_id: body.session_id, p_question_id: body.question_id,
    p_mcq_answer: body.mcq_answer, p_essay_answer: body.essay_answer,
  }, body.attempt_id)
})

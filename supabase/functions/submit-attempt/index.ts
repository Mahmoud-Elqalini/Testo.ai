import { callOperation, isUuid, readJson, validation, withAuth } from '../_shared/http.ts'

Deno.serve(withAuth('submit-attempt', async (request, user) => {
  if (request.method !== 'POST') return validation('POST is required.')
  const body = await readJson(request)
  if (!body || !isUuid(body.attempt_id) || !isUuid(body.session_id)) return validation('Valid attempt_id and session_id are required.')
  return callOperation(request, 'submit-attempt', 'fn_submit_attempt', { p_attempt_id: body.attempt_id, p_session_id: body.session_id }, { attemptId: body.attempt_id, user })
}))

import { callOperation, isUuid, preflight, readJson, validation } from '../_shared/http.ts'

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') return validation('POST is required.')
  const body = await readJson(request)
  if (!body || !isUuid(body.attempt_id) || !isUuid(body.session_id)) return validation('Valid attempt_id and session_id are required.')
  return callOperation(request, 'submit-attempt', 'fn_submit_attempt', { p_attempt_id: body.attempt_id, p_session_id: body.session_id }, body.attempt_id)
})

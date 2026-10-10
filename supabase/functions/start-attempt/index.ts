import { callOperation, isUuid, preflight, readJson, validation } from '../_shared/http.ts'

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') return validation('POST is required.')
  const body = await readJson(request)
  if (!body || !isUuid(body.attempt_id)) return validation('A valid attempt_id is required.')
  return callOperation(request, 'start-attempt', 'fn_start_attempt', { p_attempt_id: body.attempt_id, p_session_id: crypto.randomUUID() }, body.attempt_id)
})

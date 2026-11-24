import { callOperation, isUuid, readJson, validation, withAuth } from '../_shared/http.ts'

Deno.serve(withAuth('start-attempt', async (request, user) => {
  if (request.method !== 'POST') return validation('POST is required.')
  const body = await readJson(request)
  if (!body || !isUuid(body.attempt_id)) return validation('A valid attempt_id is required.')
  return callOperation(request, 'start-attempt', 'fn_start_attempt', { p_attempt_id: body.attempt_id, p_session_id: crypto.randomUUID() }, { attemptId: body.attempt_id, user })
}))

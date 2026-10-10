import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

export function preflight(request: Request): Response | null {
  return request.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function validation(message: string) {
  return json({ error: 'validation_error', message }, 400)
}

export function denial(functionName: string, userId: string, reason: string, context: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), function_name: functionName, auth_uid: userId, denial_reason: reason, context }))
  return json({ error: 'access_denied', message: 'Access denied.' }, 403)
}

export function internalError(functionName: string, error: unknown) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), function_name: functionName, error: String(error) }))
  return json({ error: 'internal_error', message: 'An unexpected error occurred.' }, 500)
}

export async function authenticate(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new Error('Supabase auth configuration is missing')
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase service configuration is missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch { return null }
}

export async function callOperation(request: Request, functionName: string, operation: string, args: Record<string, unknown>, attemptId?: string) {
  const options = preflight(request)
  if (options) return options
  try {
    const user = await authenticate(request)
    if (!user) return json({ error: 'unauthorized', message: 'Authentication required.' }, 401)
    const { data, error } = await serviceClient().rpc(operation, { ...args, p_student_id: user.id })
    if (error) throw error
    const result = data as Record<string, unknown>
    if (typeof result?.denial_reason === 'string') return denial(functionName, user.id, result.denial_reason, attemptId ? { attempt_id: attemptId } : {})
    if (typeof result?.validation_error === 'string') return validation(result.validation_error)
    return json(result)
  } catch (error) { return internalError(functionName, error) }
}

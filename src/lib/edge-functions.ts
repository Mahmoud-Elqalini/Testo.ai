import { createClient } from './supabase/client';
import { normalizeError, TestoError } from './errors';

export type EdgeFunctionNames = 
  | 'start-attempt'
  | 'get-exam-questions'
  | 'save-answer'
  | 'submit-attempt';

export interface InvokeEdgeFunctionOptions<TBody = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: TBody;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
}

/**
 * Invokes a Supabase Edge Function securely and cleanly.
 * Supports both GET (with query parameters) and POST/PUT/PATCH (with JSON body).
 * Automatically wraps responses and normalizes errors per error-policy.md (T022).
 */
export async function invokeEdgeFunction<TResponse = unknown, TBody = Record<string, unknown>>(
  functionName: EdgeFunctionNames,
  options?: InvokeEdgeFunctionOptions<TBody>
): Promise<{ data: TResponse | null; error: TestoError | null }> {
  try {
    const supabase = createClient();

    let method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST';
    let body: unknown = undefined;
    let query: Record<string, string | number | boolean | undefined | null> | undefined;
    let headers: Record<string, string> | undefined;

    if (options) {
      method = options.method ?? 'POST';
      body = options.body;
      query = options.query;
      headers = options.headers;
    }

    let functionPath: string = functionName;
    if (query) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          searchParams.set(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        functionPath += `?${qs}`;
      }
    }

    const { data, error } = await supabase.functions.invoke(functionPath, {
      method,
      headers,
      ...(method !== 'GET' && body !== undefined ? { body } : {}),
    });

    if (error) {
      let errPayload: unknown = error;

      // Look for a JSON payload inside the error object thrown by functions.invoke.
      // FunctionsHttpError in @supabase/supabase-js contains a `context: Response` property.
      if (error && typeof error === 'object' && 'context' in error) {
        const ctx = (error as { context?: unknown }).context;
        if (ctx && typeof (ctx as { json?: unknown }).json === 'function') {
          try {
            errPayload = await (ctx as { json: () => Promise<unknown> }).json();
          } catch {
            // Context JSON parsing failed (e.g. invalid JSON or empty body),
            // fall back gracefully to the raw error.
          }
        } else if (ctx && typeof ctx === 'object') {
          errPayload = ctx;
        }
      }

      throw errPayload;
    }

    return { data: data as TResponse, error: null };
  } catch (err) {
    const normalized = normalizeError(err);
    return { data: null, error: normalized };
  }
}

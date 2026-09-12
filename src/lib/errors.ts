export type ErrorCode = 
  | 'access_denied'
  | 'validation_error'
  | 'internal_error'
  | 'network_error'
  | 'unknown_error';

export interface TestoError {
  code: ErrorCode;
  message: string;
  originalError?: unknown;
}

/**
 * Normalizes any caught error into a standardized TestoError.
 * Implements the uniform-denial principle from error-policy.md:
 * - Security-sensitive errors are always mapped to a generic "Access denied."
 * - Internal details are logged to the console but not surfaced in the message.
 */
export function normalizeError(error: unknown): TestoError {
  // If it's already a normalized TestoError, return it
  if (isTestoError(error)) {
    return error;
  }

  // Log the original error for developer context (uniform-denial principle: log specific, surface generic)
  console.error('[TestoError] Original error:', error);

  // 1. Handle Edge Function custom responses (parsed JSON with an 'error' field)
  if (error && typeof error === 'object' && 'error' in error) {
    const errObj = error as Record<string, unknown>;
    
    // Exact match for edge function access_denied
    if (errObj.error === 'access_denied') {
      return {
        code: 'access_denied',
        message: 'Access denied.',
        originalError: error,
      };
    }

    if (errObj.error === 'validation_error') {
      return {
        code: 'validation_error',
        message: typeof errObj.message === 'string' ? errObj.message : 'Validation error.',
        originalError: error,
      };
    }

    if (errObj.error === 'internal_error') {
      return {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
        originalError: error,
      };
    }
  }

  // 2. Handle Supabase standard Postgres/PostgREST errors (e.g. RLS violations)
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as { code: string; message: string; details?: string };
    
    // RLS violations or insufficient privileges
    if (pgError.code === '42501' || pgError.code === 'insufficient_privilege') {
      return {
        code: 'access_denied',
        message: 'Access denied.',
        originalError: error,
      };
    }
  }

  // 3. Handle standard Error objects (e.g. fetch failures, FunctionsHttpError)
  if (error instanceof Error) {
    // Supabase FunctionsHttpError or network-related failures
    if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError' || error.message.includes('fetch')) {
      return {
        code: 'network_error',
        message: 'A network error occurred. Please check your connection.',
        originalError: error,
      };
    }

    // Supabase FunctionsHttpError returns standard HTTP statuses
    if (error.name === 'FunctionsHttpError') {
      // We don't have the body here if it wasn't caught gracefully, but we can assume generic internal error
      return {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
        originalError: error,
      };
    }

    return {
      code: 'unknown_error',
      message: error.message || 'An unknown error occurred.',
      originalError: error,
    };
  }

  // 4. Fallback for completely unknown errors (e.g. throw "string")
  return {
    code: 'unknown_error',
    message: 'An unexpected error occurred.',
    originalError: error,
  };
}

const validErrorCodes: ErrorCode[] = [
  'access_denied',
  'validation_error',
  'internal_error',
  'network_error',
  'unknown_error',
];

export function isTestoError(error: unknown): error is TestoError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    validErrorCodes.includes((error as TestoError).code)
  );
}

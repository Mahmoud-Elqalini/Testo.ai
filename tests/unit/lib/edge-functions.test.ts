import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeEdgeFunction } from '../../../src/lib/edge-functions';
import { createClient } from '../../../src/lib/supabase/client';

vi.mock('../../../src/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

describe('invokeEdgeFunction utility', () => {
  const mockInvoke = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      functions: {
        invoke: mockInvoke,
      },
    });
  });

  it('performs a successful POST invoke with body', async () => {
    const mockResponse = { attempt_id: 'att-123', status: 'in_progress' };
    mockInvoke.mockResolvedValueOnce({ data: mockResponse, error: null });

    const result = await invokeEdgeFunction('start-attempt', {
      body: { access_token: 'valid-token' },
    });

    expect(mockInvoke).toHaveBeenCalledWith('start-attempt', {
      method: 'POST',
      headers: undefined,
      body: { access_token: 'valid-token' },
    });
    expect(result.data).toEqual(mockResponse);
    expect(result.error).toBeNull();
  });

  it('performs a successful GET invoke with query parameters', async () => {
    const mockResponse = {
      attempt_id: 'att-123',
      remaining_seconds: 3600,
      questions: [],
    };
    mockInvoke.mockResolvedValueOnce({ data: mockResponse, error: null });

    const result = await invokeEdgeFunction('get-exam-questions', {
      method: 'GET',
      query: {
        attempt_id: 'att-123',
        session_id: 'sess-456',
      },
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'get-exam-questions?attempt_id=att-123&session_id=sess-456',
      {
        method: 'GET',
        headers: undefined,
      }
    );
    expect(result.data).toEqual(mockResponse);
    expect(result.error).toBeNull();
  });

  it('extracts JSON body from FunctionsHttpError context and enforces uniform denial', async () => {
    // Suppress console.error during developer logging
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Simulating FunctionsHttpError returned by @supabase/functions-js
    const httpError = {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: {
        json: vi.fn().mockResolvedValue({
          error: 'access_denied',
          message: 'Internal reason: token_not_found',
        }),
      },
    };

    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError });

    const result = await invokeEdgeFunction('start-attempt', {
      body: { access_token: 'nonexistent-token' },
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('access_denied');
    // Critical: uniform denial ensures generic message to client
    expect(result.error?.message).toBe('Access denied.');
    // Developer context contains the internal payload
    expect(result.error?.originalError).toEqual({
      error: 'access_denied',
      message: 'Internal reason: token_not_found',
    });

    consoleSpy.mockRestore();
  });

  it('handles context.json() throwing gracefully without unhandled rejection', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const httpError = new Error('FunctionsHttpError');
    httpError.name = 'FunctionsHttpError';
    (httpError as any).context = {
      json: vi.fn().mockRejectedValue(new Error('SyntaxError: Unexpected end of JSON input')),
    };

    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError });

    const result = await invokeEdgeFunction('start-attempt', {
      body: { access_token: 'bad-token' },
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    // Normalized to an internal_error or unknown_error without crashing
    expect(result.error?.code).toBe('internal_error');
    expect(result.error?.message).toBe('An unexpected error occurred.');

    consoleSpy.mockRestore();
  });

  it('handles thrown exceptions during invoke cleanly', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockInvoke.mockRejectedValueOnce(new Error('Network request failed: fetch error'));

    const result = await invokeEdgeFunction('save-answer', {
      body: {
        attempt_id: 'att-1',
        question_id: 'q-1',
      }
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('network_error');

    consoleSpy.mockRestore();
  });
});

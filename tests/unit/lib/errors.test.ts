import { describe, it, expect, vi } from 'vitest';
import { normalizeError, isTestoError } from '../../../src/lib/errors';

describe('Error Normalization', () => {
  it('identifies already normalized errors', () => {
    const error = { code: 'validation_error', message: 'Test message' };
    expect(isTestoError(error)).toBe(true);
    expect(normalizeError(error)).toBe(error);
  });

  it('maps Edge Function access_denied to generic message (uniform denial)', () => {
    // Suppress console.error during test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Pretend an edge function returned this JSON payload
    const rawError = { error: 'access_denied', message: 'Specific internal reason that should be hidden' };
    
    const normalized = normalizeError(rawError);
    
    expect(normalized.code).toBe('access_denied');
    expect(normalized.message).toBe('Access denied.'); // MUST NOT BE the specific reason
    expect(normalized.originalError).toBe(rawError); // But original is preserved
    
    // Verify it was logged for developer use
    expect(consoleSpy).toHaveBeenCalledWith('[TestoError] Original error:', rawError);
    
    consoleSpy.mockRestore();
  });

  it('maps Edge Function validation_error and passes message through', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const rawError = { error: 'validation_error', message: 'Missing required field: question_id' };
    const normalized = normalizeError(rawError);
    
    expect(normalized.code).toBe('validation_error');
    expect(normalized.message).toBe('Missing required field: question_id');
    
    consoleSpy.mockRestore();
  });

  it('maps Supabase Postgres RLS violations (42501) to access_denied', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const rawError = { code: '42501', message: 'new row violates row-level security policy for table "exams"' };
    const normalized = normalizeError(rawError);
    
    expect(normalized.code).toBe('access_denied');
    expect(normalized.message).toBe('Access denied.'); // Generic message
    
    consoleSpy.mockRestore();
  });

  it('maps Network/Fetch errors to a friendly network error message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const rawError = new Error('fetch failed');
    const normalized = normalizeError(rawError);
    
    expect(normalized.code).toBe('network_error');
    expect(normalized.message).toBe('A network error occurred. Please check your connection.');
    
    consoleSpy.mockRestore();
  });

  it('handles completely unknown errors gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const normalizedString = normalizeError('Something went totally wrong');
    expect(normalizedString.code).toBe('unknown_error');
    expect(normalizedString.message).toBe('An unexpected error occurred.');

    const normalizedEmptyObject = normalizeError({});
    expect(normalizedEmptyObject.code).toBe('unknown_error');

    consoleSpy.mockRestore();
  });
});

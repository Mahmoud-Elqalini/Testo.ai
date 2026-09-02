# Error Response Policy: 001-foundation Edge Functions

**Applies to**: `start-attempt`, `get-exam-questions`, `save-answer`, `submit-attempt`

## Principle: Uniform Denial — No Information Leakage

All security-sensitive denial reasons MUST return the **same HTTP status and response body** to the client, regardless of the actual cause. A probing attacker MUST NOT be able to distinguish:

- "Token does not exist"
- "Token exists but you are not the owner"
- "Attempt is not in the expected status"
- "Exam window has not opened yet / has already closed"
- "Session ID does not match the current active session"
- "Exam is not published"

### Client-Facing Response (uniform for ALL denials)

```
HTTP 403 Forbidden
Content-Type: application/json

{
  "error": "access_denied",
  "message": "Access denied."
}
```

- No `reason`, `code`, `detail`, or any other field that varies by cause.
- No variation in HTTP status code between denial types (e.g., do NOT use 404 for "token not found" vs 403 for "wrong owner" — both return 403).
- The only exception: **401 Unauthorized** is returned if no valid Supabase auth JWT is present at all (i.e., the request is entirely unauthenticated). This is handled by Supabase's own auth middleware before the Edge Function logic runs, and is a fundamentally different class of failure (no identity at all) that cannot be confused with the above cases.

### Server-Side Logging (per denial)

Every denial MUST log a structured entry server-side (via `console.error` or a dedicated logging service) containing:

```typescript
interface DenialLog {
  timestamp: string;         // ISO 8601
  function_name: string;     // e.g. "start-attempt"
  auth_uid: string | null;   // auth.uid() if available
  denial_reason: string;     // internal code: "token_not_found" | "owner_mismatch" | "status_not_startable" | "outside_exam_window" | "session_mismatch" | "exam_not_published" | "attempt_not_in_progress"
  context: Record<string, unknown>; // additional context (attempt_id, exam_id, etc.)
}
```

This allows Admin investigation of support tickets without leaking the reason to the client.

### Non-Security Errors

The following errors are NOT security-sensitive and MAY return specific messages:

| Scenario | HTTP Status | Response |
|---|---|---|
| Request body missing required fields | `400 Bad Request` | `{"error": "validation_error", "message": "Missing required field: ..."}` |
| Invalid JSON body | `400 Bad Request` | `{"error": "validation_error", "message": "Invalid request body."}` |
| Server-side unexpected error | `500 Internal Server Error` | `{"error": "internal_error", "message": "An unexpected error occurred."}` |

## Rate Limiting — Flagged, Not Implemented

> **⚠️ NOTICE**: `spec.md` does not contain an explicit FR for rate limiting. Per the critical constraint of not silently introducing undocumented behavior, rate limiting is **flagged as a suggested spec addition** rather than implemented in these contracts.
>
> **Recommended addition to spec.md (suggested FR-XXX)**:
> - `start-attempt`: Limit to 1 successful call per `access_token` (already inherently idempotent since `pending` → `in_progress` can only happen once, but an explicit rate limit of e.g. 5 requests/minute per IP or per `auth.uid()` would prevent brute-force token probing).
> - `save-answer`: Limit to e.g. 30 requests/minute per attempt (well above the debounce rate from FR-014, but prevents scripted flooding).
> - Implementation: Supabase Edge Functions can leverage a simple in-memory counter or a Redis/KV-backed sliding window. This is a low-effort addition once the FR is approved.

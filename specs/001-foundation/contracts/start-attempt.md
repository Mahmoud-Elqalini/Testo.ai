# Edge Function Contract: `start-attempt`

**Implements**: data-model.md §8 (exam_attempts), State Transitions: Attempt Access (Principle III & FR-009a), Session Invalidation (FR-021a)
**Error policy**: See [error-policy.md](./error-policy.md) — all security denials return uniform `403`.

---

## Endpoint

| Property | Value |
|---|---|
| **Method** | `POST` |
| **Path** | `/functions/v1/start-attempt` |
| **Auth** | Supabase JWT required (`Authorization: Bearer <token>`) |
| **Privileges** | Runs with **service-role** (bypasses RLS) |

## Request

```typescript
// Content-Type: application/json
interface StartAttemptRequest {
  access_token: string;  // From the emailed exam link (FR-009)
}
```

## Validation Checks (strict order)

Every check that fails returns `403 Access denied` (uniform — see error-policy.md).
The internal `denial_reason` logged server-side is noted in parentheses.

| Step | Check | Denial Reason (logged) |
|---|---|---|
| 1 | `auth.uid()` is present (Supabase middleware) | Returns `401` (handled by Supabase, not this function) |
| 2 | `access_token` is present and non-empty in request body | `"token_not_found"` |
| 3 | An `exam_attempts` row exists with this `access_token` | `"token_not_found"` |
| 4 | The attempt's `student_id` matches `auth.uid()` | `"owner_mismatch"` |
| 5 | The attempt's `status` is `'pending'` OR `'in_progress'` | `"status_not_startable"` |
| 6 | Join to `exams`: `now() >= exam.start_time` | `"outside_exam_window"` |
| 7 | Join to `exams`: `now() < exam.start_time + (exam.duration_minutes * interval '1 minute')` | `"outside_exam_window"` |

## Success Action (atomic read-and-update)

Inside the Edge Function, the transaction logic must read the old session state before overwriting it:

```sql
-- 1. Read existing state
SELECT ea.id, ea.session_id INTO v_attempt_id, v_old_session_id
FROM exam_attempts ea
JOIN exams e ON e.id = ea.exam_id
WHERE ea.access_token = :access_token
  AND ea.student_id = auth.uid()
  AND ea.status IN ('pending', 'in_progress')
  AND now() >= e.start_time AND now() < e.start_time + (e.duration_minutes * interval '1 minute')
FOR UPDATE; -- Lock the row to prevent TOCTOU races

-- 2. Check for takeover and log (performed in the Edge Function runtime)
-- IF v_old_session_id IS NOT NULL THEN
--   Log structured event: { event: "session_takeover", attempt_id: v_attempt_id, auth_uid: auth.uid(), previous_session_id: v_old_session_id, new_session_id: v_new_session_id, timestamp: now() }
--   Set was_takeover = true for response
-- ELSE
--   Set was_takeover = false for response
-- END IF;

-- 3. Perform the update
UPDATE exam_attempts
SET session_id = :v_new_session_id   -- takeover: overwrite session, don't touch started_at if already in_progress
    , status = 'in_progress'
    , started_at = COALESCE(started_at, now())  -- only set started_at on the FIRST transition into in_progress
WHERE id = v_attempt_id;
```

`v_new_session_id` should be generated via `crypto.randomUUID()` in the Edge Function runtime or `gen_random_uuid()` in SQL.

## Success Response

```
HTTP 200 OK
Content-Type: application/json
```

```typescript
interface StartAttemptResponse {
  attempt_id: string;           // uuid
  session_id: string;           // uuid — client must include this in all subsequent requests
  was_takeover: boolean;        // true if a pre-existing non-null session_id was just overwritten
  remaining_seconds: number;    // server-computed: floor((exam.start_time + duration - now()) in seconds)
  exam_ends_at: string;         // ISO 8601 timestamptz — the absolute deadline, for client display
}
```

- `remaining_seconds` is server-computed from `exam.start_time + exam.duration_minutes - now()`. The client MAY use this to display a countdown but MUST NOT treat it as authoritative — the server re-validates the window on every subsequent call.
- `exam_ends_at` is `exam.start_time + (exam.duration_minutes * interval '1 minute')`, provided so the client can display the absolute deadline.

## Idempotency and Session Takeover

This function is **NOT idempotent** for the initial start, but it **is idempotent for session takeover**.
Calling it twice with the same `access_token` while the attempt is `pending` or `in_progress` will succeed both times. The second call will overwrite the `session_id`, acting as a session takeover (FR-021a), but `started_at` will remain locked to the first call's timestamp. If the status is no longer `pending` or `in_progress` (e.g. `submitted`), it returns `403`.

**Visibility distinction (Recovery vs. Takeover)**:
- **Recovery**: If the client lost the network response during the very first call, they simply retry `start-attempt`. It will succeed, overwrite the first session, and return `was_takeover: true`. The client should quietly accept the new session.
- **Genuine Takeover**: If the student opens their exam on a second device, this endpoint also returns `was_takeover: true` and invalidates the first device. Both are authorized actions; the `was_takeover` flag and server-side log simply provide observability into the event so the student can be notified (e.g. "Your exam was opened elsewhere") and Admins can audit disputes.

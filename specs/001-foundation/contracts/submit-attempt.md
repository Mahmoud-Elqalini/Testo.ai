# Edge Function Contract: `submit-attempt`

**Implements**: data-model.md §8 (exam_attempts — status transitions), FR-017 (manual submission), FR-020 (attempt lifecycle)
**Error policy**: See [error-policy.md](./error-policy.md) — all security denials return uniform `403`.

---

## Endpoint

| Property | Value |
|---|---|
| **Method** | `POST` |
| **Path** | `/functions/v1/submit-attempt` |
| **Auth** | Supabase JWT required (`Authorization: Bearer <token>`) |
| **Privileges** | Runs with **service-role** (bypasses RLS) |

## Request

```typescript
// Content-Type: application/json
interface SubmitAttemptRequest {
  attempt_id: string;    // uuid
  session_id: string;    // uuid — must match current active session (FR-021a)
}
```

## Validation Checks (strict order)

| Step | Check | Denial Reason (logged) |
|---|---|---|
| 1 | `auth.uid()` is present | Returns `401` (Supabase middleware) |
| 2 | Required fields present and valid UUIDs | `400 validation_error` |
| 3 | An `exam_attempts` row exists with `id = attempt_id` AND `student_id = auth.uid()` | `"owner_mismatch"` |
| 4 | The attempt's `session_id` matches the provided `session_id` | `"session_mismatch"` |
| 5 | The attempt's `status` is `'in_progress'` **OR** `'submitted'` (see idempotency below) | `"attempt_not_in_progress"` |

**Note on check 5**: If the attempt is already `submitted`, the function returns a **success response** (idempotent no-op) rather than a 403. This handles the case where a client retries after a lost network response. If the status is `auto_submitted`, `abandoned`, or `voided`, the function returns 403 — re-submitting a system-closed attempt is not permitted.

## Success Action

```sql
UPDATE exam_attempts
SET status      = 'submitted',
    finished_at = now()
WHERE id         = :attempt_id
  AND student_id = auth.uid()
  AND status     = 'in_progress'
RETURNING id, status, finished_at;
```

If the `UPDATE` affects 0 rows (because `status` was already `'submitted'`), the function treats this as an idempotent success — it re-reads the existing row and returns its data.

## Success Response

```
HTTP 200 OK
Content-Type: application/json
```

```typescript
interface SubmitAttemptResponse {
  attempt_id: string;       // uuid
  status: 'submitted';      // always 'submitted' on success
  finished_at: string;      // ISO 8601 — when the submission was recorded
  already_submitted: boolean; // true if this was an idempotent no-op (status was already 'submitted')
}
```

## Idempotency

Fully idempotent for `submitted` status:
- **First call**: `in_progress` → `submitted`, sets `finished_at`, returns `already_submitted: false`.
- **Duplicate call**: Status is already `submitted`, returns the existing `finished_at`, returns `already_submitted: true`.
- **After auto_submitted / abandoned / voided**: Returns `403 Access denied` (the attempt's lifecycle is over).

## Time Window Note

Unlike `save-answer`, this function does **not** re-validate the exam time window. A student MAY manually submit before or up to the deadline. The pg_cron sweep handles post-deadline cleanup for attempts that are never manually submitted.

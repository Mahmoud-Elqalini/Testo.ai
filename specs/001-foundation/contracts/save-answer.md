# Edge Function Contract: `save-answer`

**Implements**: data-model.md §9 (answers — write-path lockdown), State Transitions: Answer-Save Time Re-validation (FR-016), Session Invalidation (FR-021a)
**Error policy**: See [error-policy.md](./error-policy.md) — all security denials return uniform `403`.

---

## Endpoint

| Property | Value |
|---|---|
| **Method** | `POST` |
| **Path** | `/functions/v1/save-answer` |
| **Auth** | Supabase JWT required (`Authorization: Bearer <token>`) |
| **Privileges** | Runs with **service-role** (bypasses RLS — students have NO direct write on `answers`) |

## Request

```typescript
// Content-Type: application/json
interface SaveAnswerRequest {
  attempt_id: string;       // uuid
  session_id: string;       // uuid — must match current active session (FR-021a)
  question_id: string;      // uuid — which question is being answered
  mcq_answer: string | null;   // the stable choice `id` (for MCQ) — null if essay
  essay_answer: string | null; // essay text — null if MCQ
}
```

- Exactly one of `mcq_answer` or `essay_answer` should be non-null per request. The function MAY accept both as null (clearing an answer) but MUST NOT accept both as non-null simultaneously (return `400 validation_error`).

## Validation Checks (strict order)

| Step | Check | Denial Reason (logged) |
|---|---|---|
| 1 | `auth.uid()` is present | Returns `401` (Supabase middleware) |
| 2 | Required fields present and valid UUIDs | `400 validation_error` |
| 3 | An `exam_attempts` row exists with `id = attempt_id` AND `student_id = auth.uid()` | `"owner_mismatch"` |
| 4 | The attempt's `session_id` matches the provided `session_id` | `"session_mismatch"` |
| 5 | The attempt's `status` is `'in_progress'` | `"attempt_not_in_progress"` |
| 6 | **Time re-validation (FR-016)**: Join to `exams`: `now() < exam.start_time + (exam.duration_minutes * interval '1 minute')` — this check runs on **every single call**, not cached from attempt-start | `"outside_exam_window"` |
| 7 | The `question_id` belongs to the same `exam_id` as the attempt | `400 validation_error` (not security-sensitive — this is a client bug, not an attack vector) |

## Success Action (idempotent UPSERT)

```sql
INSERT INTO answers (id, attempt_id, question_id, mcq_answer, essay_answer)
VALUES (gen_random_uuid(), :attempt_id, :question_id, :mcq_answer, :essay_answer)
ON CONFLICT (attempt_id, question_id)
DO UPDATE SET
  mcq_answer   = EXCLUDED.mcq_answer,
  essay_answer  = EXCLUDED.essay_answer;
```

- **Requires**: A `UNIQUE` constraint on `answers(attempt_id, question_id)` — see migration SQL.
- Idempotent: a retried request (e.g., offline client resyncing) simply overwrites with the latest value. No duplicate rows, no error on retry.
- The `score` column is never touched by this function — it is populated exclusively by `002-automated-grading`.

## Success Response

```
HTTP 200 OK
Content-Type: application/json
```

```typescript
interface SaveAnswerResponse {
  saved: true;
  question_id: string;        // echoed back for client-side correlation
  saved_at: string;           // ISO 8601 server timestamp — client uses this to show "saved" state (FR-015)
}
```

## Idempotency

Fully idempotent. Calling with the same `attempt_id` + `question_id` overwrites the previous answer. The `saved_at` timestamp updates to the latest call. This is safe for offline client retry and debounce resync.

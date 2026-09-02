# Edge Function Contract: `get-exam-questions`

**Implements**: data-model.md §7 (questions — student access), State Transitions: Visibility (Principle II)
**Error policy**: See [error-policy.md](./error-policy.md) — all security denials return uniform `403`.

---

## Endpoint

| Property | Value |
|---|---|
| **Method** | `GET` |
| **Path** | `/functions/v1/get-exam-questions?attempt_id=<uuid>&session_id=<uuid>` |
| **Auth** | Supabase JWT required (`Authorization: Bearer <token>`) |
| **Privileges** | Runs with **service-role** (bypasses RLS — students have NO direct RLS on `questions`) |

## Request

```typescript
// Query parameters (GET — no body)
interface GetExamQuestionsParams {
  attempt_id: string;   // uuid — identifies which attempt (and therefore which exam)
  session_id: string;   // uuid — must match the attempt's current session_id (FR-021a)
}
```

## Validation Checks (strict order)

| Step | Check | Denial Reason (logged) |
|---|---|---|
| 1 | `auth.uid()` is present | Returns `401` (Supabase middleware) |
| 2 | `attempt_id` and `session_id` are present and valid UUIDs | `400 validation_error` |
| 3 | An `exam_attempts` row exists with `id = attempt_id` AND `student_id = auth.uid()` | `"owner_mismatch"` |
| 4 | The attempt's `session_id` matches the provided `session_id` | `"session_mismatch"` |
| 5 | The attempt's `status` is `'in_progress'` | `"attempt_not_in_progress"` |
| 6 | Join to `exams`: `now() < exam.start_time + (exam.duration_minutes * interval '1 minute')` | `"outside_exam_window"` |

## Success Query

```sql
SELECT q.id, q.type, q.text, q.points, q.order, q.mcq_choices
FROM questions q
WHERE q.exam_id = (SELECT exam_id FROM exam_attempts WHERE id = :attempt_id)
ORDER BY q.order ASC;
```

**Critical**: This query selects exactly `id, type, text, points, order, mcq_choices`. The columns `correct_choice` and `reference_answers` are **never selected** — they do not appear in the query, the response type, or any intermediate variable.

## Success Response

```
HTTP 200 OK
Content-Type: application/json
```

```typescript
// COMPILE-TIME GUARANTEE: correct_choice and reference_answers are absent from this type.
// Any field not listed here MUST NOT be present in the response.
interface ExamQuestion {
  id: string;                          // uuid
  type: 'mcq' | 'essay';
  text: string;
  points: number;
  order: number;
  mcq_choices: McqChoice[] | null;     // null for essay questions
}

interface McqChoice {
  id: string;     // stable choice identifier (e.g. "a", "b", "c")
  text: string;   // choice display text
  // NO `is_correct` or similar field — ever.
}

// Top-level response
interface GetExamQuestionsResponse {
  attempt_id: string;
  remaining_seconds: number;           // server-recomputed on every call
  questions: ExamQuestion[];
}

// TYPE-LEVEL ASSERTION (enforced at build time):
// type AssertNoLeakage = ExamQuestion extends { correct_choice: any } ? never : true;
// type AssertNoLeakage2 = ExamQuestion extends { reference_answers: any } ? never : true;
```

## `mcq_choices` Filtering

The `mcq_choices` JSONB column in the database may contain additional internal fields in the future. The Edge Function MUST explicitly map/filter each choice object to emit only `{id, text}`, never passing the raw JSONB through — this is a defense-in-depth measure matching the same principle as not relying on column-level GRANTs.

```typescript
// Inside the Edge Function:
const safeChoices = rawChoices?.map((c: any) => ({ id: c.id, text: c.text })) ?? null;
```

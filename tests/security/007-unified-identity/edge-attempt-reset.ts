import type { SecurityTestContext } from "./context.ts";

export function resetStaticAttemptForEdgeCases(ctx: SecurityTestContext) {
  ctx.runSql(`BEGIN;
DELETE FROM answers
WHERE attempt_id IN (
  SELECT id FROM exam_attempts
  WHERE exam_id = 'c7000000-0000-4000-8000-000000000004'
);
-- Extra attempts are deleted because any non-pending attempt makes the exam immutable.
DELETE FROM exam_attempts
WHERE exam_id = 'c7000000-0000-4000-8000-000000000004'
  AND id <> 'e7000000-0000-4000-8000-000000000003';
UPDATE exam_attempts
SET status = 'pending', session_id = NULL, started_at = NULL, finished_at = NULL
WHERE id = 'e7000000-0000-4000-8000-000000000003'
  AND exam_id = 'c7000000-0000-4000-8000-000000000004';
UPDATE exams
SET start_time = now() - interval '1 minute', duration_minutes = 60, is_published = true
WHERE id = 'c7000000-0000-4000-8000-000000000004';
COMMIT;`);
}

\set ON_ERROR_STOP on

-- Additive regression coverage for context-scoped associated-email lookup.
-- Fixture and rate-limit writes are transaction-scoped and rolled back below.
BEGIN;
CREATE TEMP TABLE lookup_context_0019_group_students AS
SELECT to_jsonb(gs) AS row_value FROM public.group_students AS gs;
CREATE TEMP TABLE lookup_context_0019_exam_permissions AS
SELECT to_jsonb(ep) AS row_value FROM public.exam_permissions AS ep;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);

SELECT 'CASE_RESULT|lookup_context.group_member_allow|' || CASE WHEN (
  SELECT count(*) = 1 AND bool_and(id = 'a7000000-0000-4000-8000-000000000003'::uuid)
         AND bool_and(display_name = '007 Participant A')
  FROM public.lookup_associated_participant('group','b7000000-0000-4000-8000-000000000001','participant-a-007@example.test')
) THEN 'PASS' ELSE 'FAIL' END || '|owned group member resolves to id and display name';

SELECT 'CASE_RESULT|lookup_context.group_unassociated_missing_same_result|' || CASE WHEN (
  (SELECT count(*) FROM public.lookup_associated_participant('group','b7000000-0000-4000-8000-000000000001','unrelated-007@example.test')) = 0
  AND
  (SELECT count(*) FROM public.lookup_associated_participant('group','b7000000-0000-4000-8000-000000000001','not-present-007@example.test')) = 0
) THEN 'PASS' ELSE 'FAIL' END || '|existing outside-group and nonexistent emails both return zero rows';

SELECT 'CASE_RESULT|lookup_context.response_has_no_email|' || CASE WHEN NOT EXISTS (
  SELECT 1
  FROM public.lookup_associated_participant('group','b7000000-0000-4000-8000-000000000001','participant-a-007@example.test') AS result
  CROSS JOIN LATERAL jsonb_each_text(to_jsonb(result)) AS field
  WHERE field.key ILIKE '%email%' OR field.value = 'participant-a-007@example.test'
) THEN 'PASS' ELSE 'FAIL' END || '|response exposes no email field or email value';
SELECT 'CASE_RESULT|lookup_context.response_fields_unchanged|' || CASE WHEN
  pg_get_function_result('public.lookup_associated_participant(text,uuid,text)'::regprocedure) = 'TABLE(id uuid, display_name text)'
THEN 'PASS' ELSE 'FAIL' END || '|lookup response remains id and display_name only';

SELECT 'CASE_RESULT|lookup_context.exam_linked_group_member_allow|' || CASE WHEN (
  SELECT count(*) = 1
  FROM public.lookup_associated_participant('exam','c7000000-0000-4000-8000-000000000001','participant-a-007@example.test')
) THEN 'PASS' ELSE 'FAIL' END || '|linked-group member is visible through exam context';

-- Remove the group membership only inside this transaction. The existing exam
-- attempt must continue to associate the participant with the owned exam.
RESET ROLE;
DELETE FROM public.group_students
WHERE group_id='b7000000-0000-4000-8000-000000000001'::uuid
  AND student_id='a7000000-0000-4000-8000-000000000003'::uuid;
SET LOCAL ROLE authenticated;
SELECT 'CASE_RESULT|lookup_context.exam_attempt_holder_after_membership_removal_allow|' || CASE WHEN (
  SELECT count(*) = 1
  FROM public.lookup_associated_participant('exam','c7000000-0000-4000-8000-000000000001','participant-a-007@example.test')
) THEN 'PASS' ELSE 'FAIL' END || '|attempt holder remains visible after group membership removal';
SELECT 'CASE_RESULT|lookup_context.exam_unassociated_missing_same_result|' || CASE WHEN (
  (SELECT count(*) FROM public.lookup_associated_participant('exam','c7000000-0000-4000-8000-000000000001','unrelated-007@example.test')) = 0
  AND
  (SELECT count(*) FROM public.lookup_associated_participant('exam','c7000000-0000-4000-8000-000000000001','not-present-007@example.test')) = 0
) THEN 'PASS' ELSE 'FAIL' END || '|existing unrelated and nonexistent emails both return zero rows';

RESET ROLE;
INSERT INTO public.group_students (group_id, student_id)
VALUES ('b7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
SELECT 'CASE_RESULT|lookup_context.non_owner_deny|' || CASE WHEN (
  SELECT count(*) = 0
  FROM public.lookup_associated_participant('group','b7000000-0000-4000-8000-000000000002','participant-a-007@example.test')
) THEN 'PASS' ELSE 'FAIL' END || '|non-owner receives no participant row';
SELECT 'CASE_RESULT|lookup_context.owner_self_lookup_deny|' || CASE WHEN (
  SELECT count(*) = 0
  FROM public.lookup_associated_participant('group','b7000000-0000-4000-8000-000000000001','owner-a-007@example.test')
) THEN 'PASS' ELSE 'FAIL' END || '|owner cannot resolve their own identity as a participant';

RESET ROLE;
DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer;
BEGIN
  DELETE FROM private.associated_profile_lookup_rate_limits
  WHERE requester_id='a7000000-0000-4000-8000-000000000001'::uuid
    AND context_kind='group'
    AND context_id='b7000000-0000-4000-8000-000000000001'::uuid;
  FOR v_rows IN 1..11 LOOP
    BEGIN
      PERFORM * FROM public.lookup_associated_participant(
        'group','b7000000-0000-4000-8000-000000000001','not-present-rate-0019@example.test'
      );
    EXCEPTION WHEN SQLSTATE 'PT429' THEN
      v_denied := true;
      EXIT;
    END;
  END LOOP;
  RAISE NOTICE 'CASE_RESULT|lookup_context.rate_limit_deny|%|eleventh request in requester/context window is rejected',
    CASE WHEN v_denied THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

RESET ROLE;
SELECT 'CASE_RESULT|lookup_context.no_relationship_writes|' || CASE WHEN
  NOT EXISTS (
    (SELECT to_jsonb(gs) FROM public.group_students AS gs
     EXCEPT ALL SELECT row_value FROM lookup_context_0019_group_students)
    UNION ALL
    (SELECT row_value FROM lookup_context_0019_group_students
     EXCEPT ALL SELECT to_jsonb(gs) FROM public.group_students AS gs)
  )
  AND NOT EXISTS (
    (SELECT to_jsonb(ep) FROM public.exam_permissions AS ep
     EXCEPT ALL SELECT row_value FROM lookup_context_0019_exam_permissions)
    UNION ALL
    (SELECT row_value FROM lookup_context_0019_exam_permissions
     EXCEPT ALL SELECT to_jsonb(ep) FROM public.exam_permissions AS ep)
  )
THEN 'PASS' ELSE 'FAIL' END || '|lookup calls do not create, remove or change memberships/permissions';

ROLLBACK;

\set ON_ERROR_STOP on

-- T024 after-state contract for migration 0017. Run only after the atomic
-- database + Edge + service cutover has been deployed; all writes roll back.
BEGIN;
SET LOCAL ROLE authenticated;

-- Stable 007 fixture identities: owner A, owner B, participant A, unrelated.
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);

SELECT 'CASE_RESULT|cutover.group.owner_select|' || CASE WHEN EXISTS (
  SELECT 1 FROM public.groups WHERE id='b7000000-0000-4000-8000-000000000001'
) THEN 'PASS' ELSE 'FAIL' END || '|group owner can still read owned group';
SELECT 'CASE_RESULT|cutover.group.cross_owner_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.groups WHERE id='b7000000-0000-4000-8000-000000000002'
) THEN 'PASS' ELSE 'FAIL' END || '|owner A cannot read owner B group';
SELECT 'CASE_RESULT|cutover.exam.owner_select|' || CASE WHEN EXISTS (
  SELECT 1 FROM public.exams WHERE id='c7000000-0000-4000-8000-000000000001'
) THEN 'PASS' ELSE 'FAIL' END || '|exam owner can still read owned exam';
SELECT 'CASE_RESULT|cutover.exam.cross_owner_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.exams WHERE id='c7000000-0000-4000-8000-000000000002'
) THEN 'PASS' ELSE 'FAIL' END || '|owner A cannot read owner B exam';

-- Direct membership table writes must be unavailable to every client identity.
SELECT 'CASE_RESULT|cutover.group_students.no_client_insert|' || CASE WHEN
  NOT has_table_privilege('authenticated','public.group_students','INSERT') AND
  NOT has_table_privilege('authenticated','public.group_students','UPDATE') AND
  NOT has_table_privilege('anon','public.group_students','INSERT') AND
  NOT has_table_privilege('anon','public.group_students','UPDATE')
  THEN 'PASS' ELSE 'FAIL' END || '|anon and authenticated have no direct INSERT/UPDATE privilege';

DO $$
DECLARE v_code text; v_result jsonb;
BEGIN
  BEGIN
    INSERT INTO public.group_students(group_id,student_id)
    VALUES ('b7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'T024 expected direct owner self-join to be denied';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;
  BEGIN
    UPDATE public.group_students SET student_id='a7000000-0000-4000-8000-000000000001'
    WHERE group_id='b7000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'T024 expected direct membership UPDATE to be denied';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;

  -- Invitation redemption is the sole client path that creates membership.
  v_code := public.create_group_invitation('b7000000-0000-4000-8000-000000000001')->>'code';
  IF v_code IS NOT NULL THEN
    IF (public.redeem_group_invitation(v_code)->>'success')::boolean IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'T024 expected group owner invitation self-join denial';
    END IF;
    PERFORM set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);
    v_result := public.redeem_group_invitation(v_code);
    IF (v_result->>'success')::boolean IS DISTINCT FROM true OR NOT EXISTS (
      SELECT 1 FROM public.group_students
      WHERE group_id='b7000000-0000-4000-8000-000000000001'
        AND student_id='a7000000-0000-4000-8000-000000000004'
    ) THEN
      RAISE EXCEPTION 'T024 expected invitation redemption to create participant membership';
    END IF;
    RAISE NOTICE 'CASE_RESULT|cutover.invitation_redemption.membership_allow|PASS|invitation redemption creates membership for authenticated user';
  END IF;
END;
$$;

-- Create one disposable owner-as-exam-taker row as trusted test setup. This
-- proves the owner cannot start their own exam and gives the promoted account
-- a foreign attempt/result target. The enclosing transaction rolls it back.
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.exam_attempts(id,exam_id,student_id,access_token,status)
VALUES ('e7000000-0000-4000-8000-000000000099','c7000000-0000-4000-8000-000000000001',
        'a7000000-0000-4000-8000-000000000001','t024-owner-self-exam','pending')
ON CONFLICT (id) DO NOTHING;
RESET ROLE;
SET LOCAL ROLE authenticated;

-- A student self-promotion attempt is either blocked or inert. Relationship
-- authorization must still deny another owner's resources and data.
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000003',true);
DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET role='admin'::public.user_role
    WHERE id='a7000000-0000-4000-8000-000000000003';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;
END;
$$;
SELECT 'CASE_RESULT|cutover.self_promotion.group_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.groups WHERE id='b7000000-0000-4000-8000-000000000001'
) THEN 'PASS' ELSE 'FAIL' END || '|role promotion does not grant another owner group access';
SELECT 'CASE_RESULT|cutover.self_promotion.exam_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.exams WHERE id='c7000000-0000-4000-8000-000000000001'
) THEN 'PASS' ELSE 'FAIL' END || '|role promotion does not grant another owner exam access';
SELECT 'CASE_RESULT|cutover.self_promotion.lookup_deny|' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.list_associated_participants('group','b7000000-0000-4000-8000-000000000001'))
  THEN 'PASS' ELSE 'FAIL' END || '|role promotion does not grant cross-owner participant lookup';
DO $$
BEGIN
  BEGIN
    PERFORM public.get_group_invitation_status('b7000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'T024 expected non-owner invitation status denial';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'CASE_RESULT|cutover.self_promotion.invitation_status_deny|PASS|role promotion does not grant invitation status access';
  END;
  BEGIN
    PERFORM public.create_group_invitation('b7000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'T024 expected non-owner invitation management denial';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'CASE_RESULT|cutover.self_promotion.invitation_create_deny|PASS|role promotion does not grant invitation creation';
  END;
END;
$$;
SELECT 'CASE_RESULT|cutover.self_promotion.attempt_deny|' || CASE WHEN
  (public.fn_start_attempt('e7000000-0000-4000-8000-000000000099','a7000000-0000-4000-8000-000000000099')->>'denial_reason') IS NOT NULL
  THEN 'PASS' ELSE 'FAIL' END || '|role promotion does not let owner start another participant attempt';
SELECT 'CASE_RESULT|cutover.self_promotion.result_deny|' || CASE WHEN
  (public.fn_get_student_attempt_result('e7000000-0000-4000-8000-000000000099')->>'error') = 'access_denied'
  THEN 'PASS' ELSE 'FAIL' END || '|role promotion does not grant another participant result';

SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
SELECT 'CASE_RESULT|cutover.owner.self_exam_deny|' || CASE WHEN
  (public.fn_start_attempt('e7000000-0000-4000-8000-000000000099','a7000000-0000-4000-8000-000000000098')->>'denial_reason') IS NOT NULL
  THEN 'PASS' ELSE 'FAIL' END || '|exam owner cannot start their own exam';

-- Unrelated caller must not see another participant's attempts/results.
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);
SELECT 'CASE_RESULT|cutover.attempt.cross_user_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.exam_attempts WHERE id='e7000000-0000-4000-8000-000000000001'
) THEN 'PASS' ELSE 'FAIL' END || '|unrelated participant cannot read another attempt';
SELECT 'CASE_RESULT|cutover.result.cross_user_deny|' || CASE WHEN
  (public.fn_get_student_attempt_result('e7000000-0000-4000-8000-000000000001')->>'error') = 'access_denied'
  THEN 'PASS' ELSE 'FAIL' END || '|unrelated caller cannot read another participant result';

RESET ROLE;
ROLLBACK;

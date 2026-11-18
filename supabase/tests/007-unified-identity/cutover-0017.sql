\set ON_ERROR_STOP on

-- T024 after-state contract for migration 0017. Run only after the atomic
-- database + Edge + service cutover has been deployed; all writes roll back.
BEGIN;
SET LOCAL ROLE authenticated;

-- Stable 007 fixture identities: owner A, owner B, participant A, unrelated.
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);

-- T063: the exam owner can select only the approved attempt columns, while
-- access_token and a PostgREST-style select=* are denied with SQLSTATE 42501.
SELECT 'CASE_RESULT|cutover.attempt.safe_columns.owner_allow|' || CASE WHEN EXISTS (
  SELECT id, exam_id, student_id, status, started_at, finished_at, session_id
  FROM public.exam_attempts
  WHERE id='e7000000-0000-4000-8000-000000000001'
) THEN 'PASS' ELSE 'FAIL' END || '|exam owner can read the approved attempt columns';
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000003',true);
SELECT 'CASE_RESULT|cutover.attempt.safe_columns.participant_allow|' || CASE WHEN (
  SELECT count(*) FROM (
    SELECT id, exam_id, student_id, status, started_at, finished_at, session_id
    FROM public.exam_attempts
    WHERE id='e7000000-0000-4000-8000-000000000001'
  ) AS own_attempt
) = 1 THEN 'PASS' ELSE 'FAIL' END || '|participant can read exactly one row for their own attempt using only safe columns';
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);
SELECT 'CASE_RESULT|cutover.attempt.safe_columns.unrelated_deny|' || CASE WHEN (
  SELECT count(*) FROM (
    SELECT id, exam_id, student_id, status, started_at, finished_at, session_id
    FROM public.exam_attempts
    WHERE id='e7000000-0000-4000-8000-000000000001'
  ) AS another_participant_attempt
) = 0 THEN 'PASS' ELSE 'FAIL' END || '|unrelated authenticated user cannot see another participant attempt through RLS';
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE
  v_access_token_denied boolean := false;
  v_select_star_denied boolean := false;
  v_attempt record;
BEGIN
  BEGIN
    EXECUTE 'SELECT access_token FROM public.exam_attempts WHERE id = ''e7000000-0000-4000-8000-000000000001'' LIMIT 1'
      INTO v_attempt;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_access_token_denied := true;
  END;
  BEGIN
    EXECUTE 'SELECT * FROM public.exam_attempts WHERE id = ''e7000000-0000-4000-8000-000000000001'' LIMIT 1'
      INTO v_attempt;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_select_star_denied := true;
  END;
  IF NOT v_access_token_denied OR NOT v_select_star_denied THEN
    RAISE EXCEPTION 'T063 authenticated owner expected SQLSTATE 42501 for access_token and select=* (42501)';
  END IF;
  RAISE NOTICE 'CASE_RESULT|cutover.attempt.access_token.authenticated_deny|PASS|authenticated owner receives SQLSTATE 42501 for access_token';
  RAISE NOTICE 'CASE_RESULT|cutover.attempt.select_star.authenticated_deny|PASS|authenticated owner receives SQLSTATE 42501 for select=*';
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$
DECLARE
  v_access_token_denied boolean := false;
  v_select_star_denied boolean := false;
  v_attempt record;
BEGIN
  BEGIN
    EXECUTE 'SELECT access_token FROM public.exam_attempts WHERE id = ''e7000000-0000-4000-8000-000000000001'' LIMIT 1'
      INTO v_attempt;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_access_token_denied := true;
  END;
  BEGIN
    EXECUTE 'SELECT * FROM public.exam_attempts WHERE id = ''e7000000-0000-4000-8000-000000000001'' LIMIT 1'
      INTO v_attempt;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_select_star_denied := true;
  END;
  IF NOT v_access_token_denied OR NOT v_select_star_denied THEN
    RAISE EXCEPTION 'T063 anon expected SQLSTATE 42501 for access_token and select=* (42501)';
  END IF;
  RAISE NOTICE 'CASE_RESULT|cutover.attempt.access_token.anon_deny|PASS|anon receives SQLSTATE 42501 for access_token';
  RAISE NOTICE 'CASE_RESULT|cutover.attempt.select_star.anon_deny|PASS|anon receives SQLSTATE 42501 for select=*';
END;
$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
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
END;
$$;

-- Invitation redemption is the sole client path that creates membership.
SELECT public.create_group_invitation('b7000000-0000-4000-8000-000000000001')->>'code' AS t024_code \gset
SELECT (public.redeem_group_invitation(:'t024_code')->>'success')::boolean IS FALSE AS t024_owner_denied \gset
\if :t024_owner_denied
\echo CASE_RESULT|cutover.invitation_redemption.owner_self_join_deny|PASS|group owner cannot redeem own invitation
\else
\echo CASE_RESULT|cutover.invitation_redemption.owner_self_join_deny|FAIL|T024 expected group owner invitation self-join denial
\quit 3
\endif
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);
SELECT public.redeem_group_invitation(:'t024_code') AS t024_result \gset
SELECT 'CASE_RESULT|cutover.invitation_redemption.membership_allow|' || CASE WHEN
  (:'t024_result'::jsonb->>'success')::boolean IS TRUE AND EXISTS (
    SELECT 1 FROM public.list_my_joined_groups()
    WHERE group_id='b7000000-0000-4000-8000-000000000001'
  ) THEN 'PASS' ELSE 'FAIL' END || '|invitation redemption creates membership visible through list_my_joined_groups';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.list_my_joined_groups()
    WHERE group_id='b7000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'T024 expected invitation redemption to create participant membership';
  END IF;
END;
$$;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.group_students
      WHERE group_id='b7000000-0000-4000-8000-000000000001'
        AND student_id='a7000000-0000-4000-8000-000000000004') <> 0 THEN
    RAISE EXCEPTION 'T024 expected member direct SELECT to return zero group_students rows';
  END IF;
  RAISE NOTICE 'CASE_RESULT|cutover.group_students.member_no_peer_visibility|PASS|member cannot directly read their membership row (FR-008)';
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.group_students
      WHERE group_id='b7000000-0000-4000-8000-000000000001'
        AND student_id='a7000000-0000-4000-8000-000000000004') <> 1 THEN
    RAISE EXCEPTION 'T024 expected exactly one participant membership row';
  END IF;
  RAISE NOTICE 'CASE_RESULT|cutover.invitation_redemption.membership_row_count_allow|PASS|exactly one participant membership row exists';
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);

-- Owner B owns another exam and must still be able to join owner A's group.
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exams
    WHERE id='c7000000-0000-4000-8000-000000000002'
      AND owner_id='a7000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'T067 fixture owner must own a different exam';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.exams
      WHERE id='c7000000-0000-4000-8000-000000000002') <> 0 THEN
    RAISE EXCEPTION 'T067 redeemer must not directly see another owner exam';
  END IF;
  RAISE NOTICE 'CASE_RESULT|cutover.exam.cross_owner_deny_for_redeemer|PASS|redeemer cannot directly select another owner exam through RLS';
END;
$$;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000002',true);
SELECT public.redeem_group_invitation(:'t024_code') AS t067_result \gset
SELECT 'CASE_RESULT|cutover.invitation_redemption.exam_owner_elsewhere_allow|' || CASE WHEN
  (:'t067_result'::jsonb->>'success')::boolean IS TRUE AND EXISTS (
    SELECT 1 FROM public.list_my_joined_groups()
    WHERE group_id='b7000000-0000-4000-8000-000000000001'
  ) THEN 'PASS' ELSE 'FAIL' END || '|user who owns another exam can redeem this group invitation';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.list_my_joined_groups()
    WHERE group_id='b7000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'T067 expected user who owns another exam to redeem this group invitation';
  END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.group_students
      WHERE group_id='b7000000-0000-4000-8000-000000000001'
        AND student_id='a7000000-0000-4000-8000-000000000002') <> 1 THEN
    RAISE EXCEPTION 'T067 expected exactly one group membership row';
  END IF;
  RAISE NOTICE 'CASE_RESULT|cutover.invitation_redemption.exam_owner_elsewhere_row_count_allow|PASS|exactly one owner B membership row exists';
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000002',true);

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
RESET ROLE;
ALTER TABLE public.profiles DISABLE TRIGGER trg_protect_profile_role;
UPDATE public.profiles SET role='admin'::public.user_role
WHERE id='a7000000-0000-4000-8000-000000000003';
ALTER TABLE public.profiles ENABLE TRIGGER trg_protect_profile_role;
SELECT 'CASE_RESULT|cutover.self_promotion.role_fixture|' || CASE WHEN EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id='a7000000-0000-4000-8000-000000000003' AND role='admin'::public.user_role
) THEN 'PASS' ELSE 'FAIL' END || '|self-promotion probe uses an account whose stored role is admin';

-- T066 explicit owner self-exam denial for the promoted account.
SELECT gen_random_uuid() AS promoted_owner_exam_id \gset
SELECT gen_random_uuid() AS promoted_owner_attempt_id \gset
INSERT INTO public.exams (id, title, start_time, duration_minutes, admin_id, owner_id, is_published)
VALUES (:'promoted_owner_exam_id', 'T066 promoted owner self-exam', now() - interval '1 minute', 30,
        'a7000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000003', true);
INSERT INTO public.exam_attempts (id, exam_id, student_id, access_token, status)
VALUES (:'promoted_owner_attempt_id', :'promoted_owner_exam_id',
        'a7000000-0000-4000-8000-000000000003', 't066-promoted-owner-self-exam', 'pending');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000003',true);
SELECT 'CASE_RESULT|cutover.self_promotion.owner_self_exam_deny|' || CASE WHEN
  (public.fn_start_attempt(:'promoted_owner_attempt_id'::uuid,gen_random_uuid())->>'denial_reason') = 'owner_mismatch'
  THEN 'PASS' ELSE 'FAIL' END || '|self-promoted account cannot start its own exam';

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
  BEGIN
    PERFORM public.rotate_group_invitation('b7000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'T066 expected non-owner invitation rotation denial';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'CASE_RESULT|cutover.self_promotion.invitation_rotate_deny|PASS|role promotion does not grant invitation rotation';
  END;
  BEGIN
    PERFORM public.revoke_group_invitation('b7000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'T066 expected non-owner invitation revocation denial';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'CASE_RESULT|cutover.self_promotion.invitation_revoke_deny|PASS|role promotion does not grant invitation revocation';
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

-- T065: ON CONFLICT DO NOTHING must work for the owner using INSERT alone.
RESET ROLE;
REVOKE UPDATE (exam_id, group_id) ON TABLE public.exam_permissions FROM authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
SELECT 'CASE_RESULT|cutover.exam_permissions.owner_no_update_privilege|' || CASE WHEN
  NOT has_column_privilege('authenticated','public.exam_permissions','exam_id','UPDATE') AND
  NOT has_column_privilege('authenticated','public.exam_permissions','group_id','UPDATE')
  THEN 'PASS' ELSE 'FAIL' END || '|authenticated owner has no UPDATE privilege for the insert-only conflict probe';
DO $$
DECLARE v_rows integer;
BEGIN
  INSERT INTO public.exam_permissions (exam_id, group_id)
  VALUES ('c7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001')
  ON CONFLICT (exam_id, group_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T065 expected duplicate permission insert to do nothing (0 inserted rows)';
  END IF;
  RAISE NOTICE 'CASE_RESULT|cutover.exam_permissions.insert_only_conflict_noop|PASS|owner INSERT ON CONFLICT DO NOTHING succeeds without UPDATE privilege';
END;
$$;

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

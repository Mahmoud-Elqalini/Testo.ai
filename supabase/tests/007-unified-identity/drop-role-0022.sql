\set ON_ERROR_STOP on

-- Final post-0022 proof: remove fixed role state without changing the
-- owner/membership relationships that authorize product actions.
BEGIN;

DO $$
DECLARE
  v_profile_role boolean;
  v_role_table boolean;
  v_role_enum boolean;
  v_legacy_helpers integer;
  v_role_dependent_policies integer;
  v_role_dependent_routines integer;
  v_role_dependent_triggers integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='role'
  ) INTO v_profile_role;
  RAISE NOTICE 'CASE_RESULT|drop_role.profiles_role_absent|%|profiles no longer stores a fixed role', CASE WHEN NOT v_profile_role THEN 'PASS' ELSE 'FAIL' END;

  SELECT to_regclass('public.private_user_roles') IS NOT NULL INTO v_role_table;
  RAISE NOTICE 'CASE_RESULT|drop_role.private_user_roles_absent|%|private role mirror table is removed', CASE WHEN NOT v_role_table THEN 'PASS' ELSE 'FAIL' END;

  SELECT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='user_role'
  ) INTO v_role_enum;
  RAISE NOTICE 'CASE_RESULT|drop_role.user_role_enum_absent|%|fixed user_role enum is removed', CASE WHEN NOT v_role_enum THEN 'PASS' ELSE 'FAIL' END;

  SELECT count(*) INTO v_legacy_helpers
  FROM (VALUES
    (to_regprocedure('public.get_my_role()')),
    (to_regprocedure('public.fn_sync_user_role()')),
    (to_regprocedure('public.fn_protect_profile_role()')),
    (to_regprocedure('private.is_admin()')),
    (to_regprocedure('private.is_student()'))
  ) AS old_helpers(signature)
  WHERE signature IS NOT NULL;
  RAISE NOTICE 'CASE_RESULT|drop_role.legacy_role_helpers_absent|%|role lookup, sync, protection, and fixed-role helpers are removed', CASE WHEN v_legacy_helpers=0 THEN 'PASS' ELSE 'FAIL' END;

  SELECT count(*) INTO v_role_dependent_policies
  FROM pg_policies
  WHERE coalesce(qual,'')||' '||coalesce(with_check,'') ~* '(profiles[.]role|private_user_roles|user_role|private[.]is_admin|private[.]is_student|get_my_role|fn_sync_user_role|fn_protect_profile_role)';
  RAISE NOTICE 'CASE_RESULT|drop_role.no_role_dependent_policies|%|active RLS policies do not depend on fixed roles', CASE WHEN v_role_dependent_policies=0 THEN 'PASS' ELSE 'FAIL' END;

  SELECT count(*) INTO v_role_dependent_routines
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p','w')
    AND pg_get_functiondef(p.oid) ~* '(profiles[.]role|private_user_roles|public[.]user_role|private[.]is_admin|private[.]is_student|get_my_role|fn_sync_user_role|fn_protect_profile_role)';
  RAISE NOTICE 'CASE_RESULT|drop_role.no_role_dependent_routines|%|active application routines do not depend on fixed roles', CASE WHEN v_role_dependent_routines=0 THEN 'PASS' ELSE 'FAIL' END;

  SELECT count(*) INTO v_role_dependent_triggers
  FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth')
    AND (pg_get_triggerdef(t.oid)||' '||pg_get_functiondef(t.tgfoid)) ~* '(profiles[.]role|private_user_roles|user_role|private[.]is_admin|private[.]is_student|get_my_role|fn_sync_user_role|fn_protect_profile_role)';
  RAISE NOTICE 'CASE_RESULT|drop_role.no_role_dependent_triggers|%|active triggers do not depend on fixed roles', CASE WHEN v_role_dependent_triggers=0 THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
SELECT 'CASE_RESULT|function:private.owns_group.allow|' || CASE WHEN private.owns_group('b7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|owner helper still recognizes the owner relationship';
SELECT 'CASE_RESULT|function:private.owns_group.deny|' || CASE WHEN NOT private.owns_group('b7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|owner helper denies another owner group';
SELECT 'CASE_RESULT|function:private.owns_exam.allow|' || CASE WHEN private.owns_exam('c7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|owner helper still recognizes the exam relationship';
SELECT 'CASE_RESULT|function:private.owns_exam.deny|' || CASE WHEN NOT private.owns_exam('c7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|owner helper denies another owner exam';
SELECT 'CASE_RESULT|function:private.owns_exam_attempt.allow|' || CASE WHEN private.owns_exam_attempt('e7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|owner helper still recognizes the exam attempt relationship';
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000002',true);
SELECT 'CASE_RESULT|function:private.owns_exam_attempt.deny|' || CASE WHEN NOT private.owns_exam_attempt('e7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|unrelated owner cannot claim another exam attempt';
DO $$
BEGIN
  RAISE NOTICE 'CASE_RESULT|drop_role.signup_function_execute_revoked|%|profile signup trigger function cannot be directly executed by API roles', CASE WHEN NOT has_function_privilege('anon','public.fn_create_profile_without_role()','EXECUTE') AND NOT has_function_privilege('authenticated','public.fn_create_profile_without_role()','EXECUTE') THEN 'PASS' ELSE 'FAIL' END;
END;
$$;INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin
) VALUES (
  'f7000000-0000-4000-8000-000000000221',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 't047-roleless-signup@example.test',
  crypt('LocalOnly-007-roleless-signup!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"T047 Roleless Signup","preferred_language":"ar","preferred_theme":"light"}'::jsonb,
  now(), now(), false
);
DO $$
BEGIN
  RAISE NOTICE 'CASE_RESULT|drop_role.signup_profile_created|%|signup still creates a roleless profile with submitted preferences', CASE WHEN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id='f7000000-0000-4000-8000-000000000221'
      AND full_name='T047 Roleless Signup'
      AND preferred_language='ar'
      AND preferred_theme='light'
  ) THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f7000000-0000-4000-8000-000000000221',true);
DO $$
DECLARE v_updated integer;
BEGIN
  UPDATE public.profiles
  SET full_name='T047 Updated Name', preferred_language='en', preferred_theme='dark'
  WHERE id='f7000000-0000-4000-8000-000000000221';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'CASE_RESULT|drop_role.safe_profile_update_allow|%|authenticated users can update only their safe profile fields', CASE WHEN v_updated=1 THEN 'PASS' ELSE 'FAIL' END;
  BEGIN
    UPDATE public.profiles SET id='f7000000-0000-4000-8000-000000000222'
    WHERE id='f7000000-0000-4000-8000-000000000221';
    RAISE NOTICE 'CASE_RESULT|drop_role.profile_identity_update_deny|FAIL|authenticated caller changed profile identity';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'CASE_RESULT|drop_role.profile_identity_update_deny|PASS|authenticated caller cannot change profile identity';
  END;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE
  v_group_count integer;
  v_exam_count integer;
BEGIN
  SELECT count(*) INTO v_group_count FROM public.groups WHERE id='b7000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_exam_count FROM public.exams WHERE id='c7000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'CASE_RESULT|drop_role.owner_a_owned_resources_allow|%|owner A retains access to the owned group and exam', CASE WHEN v_group_count=1 AND v_exam_count=1 THEN 'PASS' ELSE 'FAIL' END;

  SELECT count(*) INTO v_group_count FROM public.groups WHERE id='b7000000-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_exam_count FROM public.exams WHERE id='c7000000-0000-4000-8000-000000000002';
  RAISE NOTICE 'CASE_RESULT|drop_role.owner_a_cross_owner_deny|%|owner A remains unable to read owner B resources', CASE WHEN v_group_count=0 AND v_exam_count=0 THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000003',true);
DO $$
DECLARE
  v_group_count integer;
BEGIN
  SELECT count(*) INTO v_group_count
  FROM public.list_my_joined_groups()
  WHERE group_id='b7000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'CASE_RESULT|drop_role.participant_membership_allow|%|participant retains learning-group visibility through the scoped membership function', CASE WHEN v_group_count=1 THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);
DO $$
DECLARE v_group_count integer;
BEGIN
  SELECT count(*) INTO v_group_count FROM public.groups WHERE id='b7000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'CASE_RESULT|drop_role.unrelated_membership_deny|%|unrelated caller cannot read a group through membership', CASE WHEN v_group_count=0 THEN 'PASS' ELSE 'FAIL' END;
END;
$$;
ROLLBACK;

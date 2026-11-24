\set ON_ERROR_STOP on

-- Read-only assertions and transaction-scoped trigger probes for the current 0001-0013 schema.
-- The TypeScript harness consumes every CASE_RESULT line as a structured test case.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
SELECT 'CASE_RESULT|function:private.is_admin.allow|' || CASE WHEN private.is_admin() THEN 'PASS' ELSE 'FAIL' END || '|admin fixture is recognized as admin';
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000003', true);
SELECT 'CASE_RESULT|function:private.is_admin.deny|' || CASE WHEN NOT private.is_admin() THEN 'PASS' ELSE 'FAIL' END || '|student fixture is not recognized as admin';
SELECT 'CASE_RESULT|function:private.is_student.allow|' || CASE WHEN private.is_student() THEN 'PASS' ELSE 'FAIL' END || '|participant fixture is recognized as student';
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
SELECT 'CASE_RESULT|function:private.is_student.deny|' || CASE WHEN NOT private.is_student() THEN 'PASS' ELSE 'FAIL' END || '|admin fixture is not recognized as student';
SELECT 'CASE_RESULT|function:private.owns_group.allow|' || CASE WHEN private.owns_group('b7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|owner sees own group ownership';
SELECT 'CASE_RESULT|function:private.owns_group.deny|' || CASE WHEN NOT private.owns_group('b7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|owner cannot claim unrelated group';
SELECT 'CASE_RESULT|function:private.owns_exam.allow|' || CASE WHEN private.owns_exam('c7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|owner sees own exam ownership';
SELECT 'CASE_RESULT|function:private.owns_exam.deny|' || CASE WHEN NOT private.owns_exam('c7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|owner cannot claim unrelated exam';
SELECT 'CASE_RESULT|function:private.is_admin_scoped_student.allow|' || CASE WHEN private.is_admin_scoped_student('a7000000-0000-4000-8000-000000000003') THEN 'PASS' ELSE 'FAIL' END || '|owner sees associated participant profile';
SELECT 'CASE_RESULT|function:private.is_admin_scoped_student.deny|' || CASE WHEN NOT private.is_admin_scoped_student('a7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|owner cannot see another owner profile outside their groups and exams';
SELECT 'CASE_RESULT|function:private.owns_exam_attempt.allow|' || CASE WHEN private.owns_exam_attempt('e7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|exam owner owns associated attempt context';
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000002', true);
SELECT 'CASE_RESULT|function:private.owns_exam_attempt.deny|' || CASE WHEN NOT private.owns_exam_attempt('e7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|different exam owner cannot see the attempt context';
ROLLBACK;

-- Trigger probes use the stable logical fixture rows and roll back all mutations.
BEGIN;
UPDATE public.profiles SET full_name = full_name WHERE id = 'a7000000-0000-4000-8000-000000000003';
SELECT 'CASE_RESULT|function:public.fn_protect_profile_role.allow|' || CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id='a7000000-0000-4000-8000-000000000003') THEN 'PASS' ELSE 'FAIL' END || '|unchanged role permits ordinary profile update';
SELECT 'CASE_RESULT|trigger:trg_protect_profile_role.allow|' || CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id='a7000000-0000-4000-8000-000000000003') THEN 'PASS' ELSE 'FAIL' END || '|role-protection trigger permits non-role profile update';
UPDATE public.profiles SET role = 'admin'::public.user_role WHERE id = 'a7000000-0000-4000-8000-000000000003';
SELECT 'CASE_RESULT|function:public.fn_sync_user_role.allow|' || CASE WHEN EXISTS (SELECT 1 FROM public.private_user_roles WHERE user_id='a7000000-0000-4000-8000-000000000003' AND role='admin'::public.user_role) THEN 'PASS' ELSE 'FAIL' END || '|trusted role update is mirrored';
SELECT 'CASE_RESULT|trigger:trg_sync_user_role.allow|' || CASE WHEN EXISTS (SELECT 1 FROM public.private_user_roles WHERE user_id='a7000000-0000-4000-8000-000000000003' AND role='admin'::public.user_role) THEN 'PASS' ELSE 'FAIL' END || '|role mirror trigger synchronizes trusted update';
UPDATE public.profiles SET role = 'student'::public.user_role WHERE id = 'a7000000-0000-4000-8000-000000000003';
ROLLBACK;

-- Signup trigger ignores client-requested role and assigns the schema default.
BEGIN;
SELECT gen_random_uuid() AS signup_test_id \gset
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (:'signup_test_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'signup-' || :'signup_test_id' || '@example.test', crypt('LocalOnly-007-signup!', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Signup Probe","role":"admin"}', now(), now(), false, '', '', '', '');
SELECT 'CASE_RESULT|function:public.fn_create_profile_on_signup.allow|' || CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id=:'signup_test_id'::uuid) THEN 'PASS' ELSE 'FAIL' END || '|auth signup creates the linked profile';
SELECT 'CASE_RESULT|function:public.fn_create_profile_on_signup.deny|' || CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id=:'signup_test_id'::uuid AND role='student'::public.user_role) THEN 'PASS' ELSE 'FAIL' END || '|client metadata cannot create an admin role';
SELECT 'CASE_RESULT|trigger:trg_create_profile_on_signup.allow|' || CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id=:'signup_test_id'::uuid) THEN 'PASS' ELSE 'FAIL' END || '|signup trigger creates profile row';
SELECT 'CASE_RESULT|trigger:trg_create_profile_on_signup.deny|' || CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id=:'signup_test_id'::uuid AND role='student'::public.user_role) THEN 'PASS' ELSE 'FAIL' END || '|signup trigger rejects requested admin role';
ROLLBACK;

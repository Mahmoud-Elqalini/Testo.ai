\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000003', true);
SELECT 'CASE_RESULT|policy:exam_attempts_student_select.allow|' || CASE WHEN EXISTS (SELECT 1 FROM public.exam_attempts WHERE id='e7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|participant reads own attempt under RLS';
SELECT 'CASE_RESULT|policy:exam_attempts_student_select.deny|' || CASE WHEN NOT EXISTS (SELECT 1 FROM public.exam_attempts WHERE id='e7000000-0000-4000-8000-000000000003') THEN 'PASS' ELSE 'FAIL' END || '|participant cannot read another account attempt under RLS';
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000001', true);
SELECT 'CASE_RESULT|policy:exam_attempts_admin_select.allow|' || CASE WHEN EXISTS (SELECT 1 FROM public.exam_attempts WHERE id='e7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|exam owner reads attempt under RLS';
SELECT 'CASE_RESULT|policy:exam_attempts_admin_select.deny|' || CASE WHEN NOT EXISTS (SELECT 1 FROM public.exam_attempts WHERE id='e7000000-0000-4000-8000-000000000003') THEN 'PASS' ELSE 'FAIL' END || '|exam owner cannot read another owner attempt';
ROLLBACK;

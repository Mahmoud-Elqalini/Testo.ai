\set ON_ERROR_STOP on

-- T014 failing-first contract. These owner/membership helpers must be absent
-- on 0014 and are added unused by migration 0015.
DO $$
BEGIN
  IF to_regprocedure('private.owns_group_by_owner(uuid)') IS NULL
     OR to_regprocedure('private.owns_exam_by_owner(uuid)') IS NULL
     OR to_regprocedure('private.is_current_group_member(uuid)') IS NULL
     OR to_regprocedure('private.can_access_exam_via_group(uuid)') IS NULL THEN
    RAISE EXCEPTION 'T014 expected failing-first result: one or more unused 0015 helpers are absent';
  END IF;
END;
$$;

BEGIN;
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
SELECT 'CASE_RESULT|helper.owns_group.allow|' || CASE WHEN private.owns_group_by_owner('b7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|owner A recognizes their group';
SELECT 'CASE_RESULT|helper.owns_group.deny|' || CASE WHEN NOT private.owns_group_by_owner('b7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|owner A cannot claim owner B group';
SELECT 'CASE_RESULT|helper.owns_exam.allow|' || CASE WHEN private.owns_exam_by_owner('c7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|owner A recognizes their exam';
SELECT 'CASE_RESULT|helper.owns_exam.deny|' || CASE WHEN NOT private.owns_exam_by_owner('c7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|owner A cannot claim owner B exam';
SELECT 'CASE_RESULT|helper.member.owner_deny|' || CASE WHEN NOT private.is_current_group_member('b7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|group owner is not a member';
SELECT 'CASE_RESULT|helper.exam_access.owner_deny|' || CASE WHEN NOT private.can_access_exam_via_group('c7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|exam owner cannot participate in own exam';

SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000003',true);
SELECT 'CASE_RESULT|helper.member.allow|' || CASE WHEN private.is_current_group_member('b7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|participant A recognizes current group membership';
SELECT 'CASE_RESULT|helper.member.deny|' || CASE WHEN NOT private.is_current_group_member('b7000000-0000-4000-8000-000000000002') THEN 'PASS' ELSE 'FAIL' END || '|participant A is not a member of owner B group';
SELECT 'CASE_RESULT|helper.exam_access.allow|' || CASE WHEN private.can_access_exam_via_group('c7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|participant A accesses exam through linked group membership';
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000004',true);
SELECT 'CASE_RESULT|helper.exam_access.deny|' || CASE WHEN NOT private.can_access_exam_via_group('c7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|unrelated account cannot access exam through a group';
SELECT set_config('request.jwt.claim.sub','',true);
SELECT 'CASE_RESULT|helper.unauthenticated.deny|' || CASE WHEN auth.uid() IS NULL AND NOT private.owns_group_by_owner('b7000000-0000-4000-8000-000000000001') AND NOT private.owns_exam_by_owner('c7000000-0000-4000-8000-000000000001') AND NOT private.is_current_group_member('b7000000-0000-4000-8000-000000000001') AND NOT private.can_access_exam_via_group('c7000000-0000-4000-8000-000000000001') THEN 'PASS' ELSE 'FAIL' END || '|null auth.uid receives no helper capability';
RESET ROLE;
ROLLBACK;

SELECT 'CASE_RESULT|helper.grants.least_privilege|' || CASE WHEN
  has_function_privilege('authenticated','private.owns_group_by_owner(uuid)','EXECUTE') AND
  has_function_privilege('authenticated','private.owns_exam_by_owner(uuid)','EXECUTE') AND
  has_function_privilege('authenticated','private.is_current_group_member(uuid)','EXECUTE') AND
  has_function_privilege('authenticated','private.can_access_exam_via_group(uuid)','EXECUTE') AND
  NOT has_function_privilege('anon','private.owns_group_by_owner(uuid)','EXECUTE') AND
  NOT has_function_privilege('anon','private.owns_exam_by_owner(uuid)','EXECUTE') AND
  NOT has_function_privilege('anon','private.is_current_group_member(uuid)','EXECUTE') AND
  NOT has_function_privilege('anon','private.can_access_exam_via_group(uuid)','EXECUTE') AND
  NOT has_function_privilege('service_role','private.owns_group_by_owner(uuid)','EXECUTE') AND
  NOT has_function_privilege('service_role','private.owns_exam_by_owner(uuid)','EXECUTE') AND
  NOT has_function_privilege('service_role','private.is_current_group_member(uuid)','EXECUTE') AND
  NOT has_function_privilege('service_role','private.can_access_exam_via_group(uuid)','EXECUTE')
  THEN 'PASS' ELSE 'FAIL' END || '|only authenticated can execute the helpers';

SELECT 'CASE_RESULT|helper.fixed_search_path|' || CASE WHEN count(*)=4 AND bool_and(prosecdef AND 'search_path=""'=ANY(proconfig)) THEN 'PASS' ELSE 'FAIL' END || '|all helper functions are SECURITY DEFINER with empty fixed search_path'
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='private' AND p.proname IN ('owns_group_by_owner','owns_exam_by_owner','is_current_group_member','can_access_exam_via_group');

SELECT 'CASE_RESULT|helper.no_policy_rewire|' || CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END || '|no existing policy references the new unused helper functions'
FROM pg_policy pol
WHERE pg_get_expr(pol.polqual, pol.polrelid) ~ '(owns_group_by_owner|owns_exam_by_owner|is_current_group_member|can_access_exam_via_group)'
   OR pg_get_expr(pol.polwithcheck, pol.polrelid) ~ '(owns_group_by_owner|owns_exam_by_owner|is_current_group_member|can_access_exam_via_group)';

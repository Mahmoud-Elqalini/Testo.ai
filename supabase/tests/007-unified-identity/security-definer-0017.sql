\set ON_ERROR_STOP on

-- T025 after-state catalog contract. Run after migration 0017 is applied.
-- Every user-callable SECURITY DEFINER function must pin a safe path and
-- derive identity from auth.uid(); internal trigger/cron helpers stay private.
SELECT 'CASE_RESULT|catalog.sd_fixed_safe_search_path|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_proc p
  WHERE p.prosecdef
    AND NOT ('search_path=""'=ANY(COALESCE(p.proconfig,ARRAY[]::text[]))
             OR 'search_path=pg_catalog'=ANY(COALESCE(p.proconfig,ARRAY[]::text[])))
    AND p.pronamespace IN ('public'::regnamespace,'private'::regnamespace)
) THEN 'PASS' ELSE 'FAIL' END || '|no public/private SECURITY DEFINER function uses an unsafe or mutable search_path';

SELECT 'CASE_RESULT|catalog.no_callable_legacy_student_id_rpc|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('fn_start_attempt','fn_get_exam_questions','fn_save_attempt_answer','fn_submit_attempt')
    AND pg_get_function_identity_arguments(p.oid) LIKE '%p_student_id%'
    AND has_function_privilege('anon',p.oid,'EXECUTE')
      OR (n.nspname='public' AND p.proname IN ('fn_start_attempt','fn_get_exam_questions','fn_save_attempt_answer','fn_submit_attempt')
          AND pg_get_function_identity_arguments(p.oid) LIKE '%p_student_id%'
          AND has_function_privilege('authenticated',p.oid,'EXECUTE'))
) THEN 'PASS' ELSE 'FAIL' END || '|old p_student_id attempt RPC signatures are not callable by anon/authenticated';

SELECT 'CASE_RESULT|catalog.internal_helpers_not_client_callable|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef
    AND (p.prorettype='trigger'::regtype OR p.proname IN ('fn_create_pending_attempts_at_start','fn_sweep_expired_attempts'))
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
) THEN 'PASS' ELSE 'FAIL' END || '|trigger and scheduled maintenance helpers cannot be called by client roles';

SELECT 'CASE_RESULT|catalog.no_rls_client_identity_trust|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_policy pol
  WHERE COALESCE(pg_get_expr(pol.polqual,pol.polrelid),'') || ' ' || COALESCE(pg_get_expr(pol.polwithcheck,pol.polrelid),'')
    ~* '(request\.jwt\.claims|current_setting\([^)]*sub|student_id\s*=\s*\$[0-9])'
) THEN 'PASS' ELSE 'FAIL' END || '|RLS policies do not authorize from client-supplied identity claims';

-- For every executable SECURITY DEFINER RPC reachable by a client, require
-- authentication and a resource relationship check in its stored definition.
SELECT 'CASE_RESULT|catalog.user_rpc_auth_and_relationship_checks|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef AND n.nspname='public'
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
    AND (p.prosrc !~* 'auth\.uid\s*\(' OR p.prosrc !~* '(owner_id|admin_id|group_students|exam_permissions|exam_attempts|owns_|can_access_)')
) THEN 'PASS' ELSE 'FAIL' END || '|every client-callable SECURITY DEFINER RPC checks auth.uid and resource ownership or membership';

-- Ensure default PUBLIC execution has not leaked through to any internal
-- trigger/cron helper, even where an explicit service_role grant is present.
SELECT 'CASE_RESULT|catalog.internal_helpers_no_public_execute|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef
    AND (p.prorettype='trigger'::regtype OR p.proname IN ('fn_create_pending_attempts_at_start','fn_sweep_expired_attempts'))
    AND EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
      WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
    )
) THEN 'PASS' ELSE 'FAIL' END || '|internal helpers have PUBLIC execution revoked';

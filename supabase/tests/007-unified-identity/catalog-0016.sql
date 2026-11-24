-- Read-only single-statement catalog scan for migration 0016.
-- Captures the two projection functions, their grants/search_path/security mode,
-- references from active RLS policies, and a compact inventory of every
-- SECURITY DEFINER function currently installed.
WITH projection_functions AS (
  SELECT
    p.oid::regprocedure::text AS function_signature,
    p.prosecdef AS security_definer,
    p.proconfig AS function_settings,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
    pg_get_functiondef(p.oid) ILIKE '%auth.uid()%' AS definition_checks_auth_uid
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('list_associated_participants', 'lookup_associated_participant')
), security_definer_inventory AS (
  SELECT
    p.oid::regprocedure::text AS function_signature,
    n.nspname AS schema_name,
    p.proconfig AS function_settings,
    COALESCE(p.proconfig && ARRAY['search_path=""']::text[], false) AS empty_fixed_search_path,
    EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting WHERE setting LIKE 'search_path=%') AS has_fixed_search_path,
    pg_get_functiondef(p.oid) ILIKE '%auth.uid()%' AS definition_checks_auth_uid,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE p.prosecdef
), policy_references AS (
  SELECT schemaname, tablename, policyname
  FROM pg_policies
  WHERE coalesce(qual, '') || ' ' || coalesce(with_check, '')
    ILIKE ANY (ARRAY['%list_associated_participants%', '%lookup_associated_participant%'])
)
SELECT jsonb_build_object(
  'profile_projection_functions', COALESCE(
    (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.function_signature) FROM projection_functions AS f),
    '[]'::jsonb
  ),
  'security_definer_count', (SELECT count(*) FROM security_definer_inventory),
  'security_definer_functions_without_fixed_search_path', COALESCE(
    (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.function_signature) FROM security_definer_inventory AS f WHERE NOT f.has_fixed_search_path),
    '[]'::jsonb
  ),
  'security_definer_functions_without_auth_uid', COALESCE(
    (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.function_signature) FROM security_definer_inventory AS f WHERE NOT f.definition_checks_auth_uid),
    '[]'::jsonb
  ),
  'policy_references_to_new_functions', COALESCE(
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.schemaname, r.tablename, r.policyname) FROM policy_references AS r),
    '[]'::jsonb
  )
) AS catalog_scan;

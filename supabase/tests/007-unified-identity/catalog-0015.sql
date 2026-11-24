-- Read-only single-statement catalog scan for additive helpers in migration 0015.
-- Expected: four functions, SECURITY DEFINER, search_path="", execute granted
-- to authenticated only, and an empty policies_referencing_helpers array.
WITH helper_functions AS (
  SELECT
    p.oid::regprocedure::text AS function_signature,
    p.prosecdef AS security_definer,
    p.proconfig AS function_settings,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname IN (
      'owns_group_by_owner',
      'owns_exam_by_owner',
      'is_current_group_member',
      'can_access_exam_via_group'
    )
), referenced_policies AS (
  SELECT schemaname, tablename, policyname
  FROM pg_policies
  WHERE coalesce(qual, '') || ' ' || coalesce(with_check, '')
    ILIKE ANY (ARRAY[
      '%owns_group_by_owner%',
      '%owns_exam_by_owner%',
      '%is_current_group_member%',
      '%can_access_exam_via_group%'
    ])
)
SELECT jsonb_build_object(
  'functions', COALESCE(
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.function_signature) FROM helper_functions AS h),
    '[]'::jsonb
  ),
  'policies_referencing_helpers', COALESCE(
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.schemaname, r.tablename, r.policyname) FROM referenced_policies AS r),
    '[]'::jsonb
  )
) AS catalog_scan;

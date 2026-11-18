BEGIN;

-- Snapshot all executable definitions, policies and relation/schema/type ACLs.
-- Only this RPC definition is expected to differ after CREATE OR REPLACE.
CREATE TEMP TABLE _0019_function_snapshot ON COMMIT DROP AS
SELECT p.oid, n.nspname, p.proname, p.proargtypes::text AS proargtypes,
       pg_get_functiondef(p.oid) AS definition, p.proacl, p.prosecdef, p.proconfig
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE p.prokind <> 'a';

CREATE TEMP TABLE _0019_policy_snapshot ON COMMIT DROP AS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies;

CREATE TEMP TABLE _0019_acl_snapshot ON COMMIT DROP AS
SELECT 'relation'::text AS object_kind, c.oid::text AS object_id, c.relacl::text AS acl,
       NULL::smallint AS sub_id
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname::text !~ '^pg_(toast_)?temp_'
UNION ALL
SELECT 'column', c.oid::text, a.attacl::text, a.attnum
FROM pg_class AS c
JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname::text !~ '^pg_(toast_)?temp_'
UNION ALL
SELECT 'schema', n.oid::text, n.nspacl::text, NULL::smallint
FROM pg_namespace AS n
WHERE n.nspname::text !~ '^pg_(toast_)?temp_'
UNION ALL
SELECT 'type', t.oid::text, t.typacl::text, NULL::smallint
FROM pg_type AS t
JOIN pg_namespace AS n ON n.oid = t.typnamespace
WHERE n.nspname::text !~ '^pg_(toast_)?temp_';

CREATE OR REPLACE FUNCTION public.lookup_associated_participant(
  p_context_kind text,
  p_context_id uuid,
  p_email text
)
RETURNS TABLE(id uuid, display_name text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requester uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request_count integer;
  v_lookup_started timestamptz;
  v_elapsed_seconds double precision;
  v_candidate_id uuid;
  v_candidate_name text;
BEGIN
  IF v_requester IS NULL OR p_context_id IS NULL OR p_context_kind IS NULL
     OR p_context_kind NOT IN ('group', 'exam') THEN
    RETURN;
  END IF;

  IF p_context_kind = 'group' THEN
    IF NOT private.owns_group_by_owner(p_context_id) THEN
      RETURN;
    END IF;
  ELSIF NOT private.owns_exam_by_owner(p_context_id) THEN
    RETURN;
  END IF;

  INSERT INTO private.associated_profile_lookup_rate_limits AS limits (
    requester_id, context_kind, context_id, window_started_at, request_count
  ) VALUES (
    v_requester, p_context_kind, p_context_id, v_now, 1
  )
  ON CONFLICT (requester_id, context_kind, context_id) DO UPDATE
    SET window_started_at = CASE
          WHEN EXCLUDED.window_started_at - limits.window_started_at >= interval '1 minute'
            THEN EXCLUDED.window_started_at
          ELSE limits.window_started_at
        END,
        request_count = CASE
          WHEN EXCLUDED.window_started_at - limits.window_started_at >= interval '1 minute'
            THEN 1
          ELSE limits.request_count + 1
        END
  RETURNING request_count INTO v_request_count;

  IF v_request_count > 10 THEN
    RAISE SQLSTATE 'PT429' USING MESSAGE = 'Lookup rate limit exceeded';
  END IF;

  -- Restrict email comparison to identities already related to this owned
  -- context. Both an existing unrelated address and an unknown address take
  -- the same candidate-query and fixed-floor path.
  v_lookup_started := pg_catalog.clock_timestamp();
  WITH context_members AS (
    SELECT gs.student_id AS id
    FROM public.group_students AS gs
    WHERE p_context_kind = 'group'
      AND gs.group_id = p_context_id

    UNION

    SELECT gs.student_id AS id
    FROM public.exam_permissions AS ep
    JOIN public.groups AS g
      ON g.id = ep.group_id
     AND g.owner_id = v_requester
    JOIN public.group_students AS gs
      ON gs.group_id = g.id
    WHERE p_context_kind = 'exam'
      AND ep.exam_id = p_context_id
      AND ep.group_id IS NOT NULL
      AND ep.student_id IS NULL

    UNION

    SELECT ea.student_id AS id
    FROM public.exam_attempts AS ea
    WHERE p_context_kind = 'exam'
      AND ea.exam_id = p_context_id
  )
  SELECT u.id, p.full_name
    INTO v_candidate_id, v_candidate_name
  FROM context_members AS cm
  JOIN auth.users AS u ON u.id = cm.id
  JOIN public.profiles AS p ON p.id = u.id
  WHERE pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  ORDER BY u.id
  LIMIT 1;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (pg_catalog.clock_timestamp() - v_lookup_started));
  IF v_elapsed_seconds < 0.05 THEN
    PERFORM pg_catalog.pg_sleep(0.05 - v_elapsed_seconds);
  END IF;

  IF v_candidate_id IS NOT NULL AND v_candidate_id <> v_requester THEN
    RETURN QUERY SELECT v_candidate_id, v_candidate_name;
  END IF;
  RETURN;
END;
$$;

-- Keep migration 0016's execution grants unchanged.
REVOKE ALL ON FUNCTION public.lookup_associated_participant(text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_associated_participant(text, uuid, text)
  TO authenticated;

CREATE TEMP TABLE _0019_acl_current ON COMMIT DROP AS
SELECT 'relation'::text AS object_kind, c.oid::text AS object_id, c.relacl::text AS acl,
       NULL::smallint AS sub_id
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname::text !~ '^pg_(toast_)?temp_'
UNION ALL
SELECT 'column', c.oid::text, a.attacl::text, a.attnum
FROM pg_class AS c
JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname::text !~ '^pg_(toast_)?temp_'
UNION ALL
SELECT 'schema', n.oid::text, n.nspacl::text, NULL::smallint
FROM pg_namespace AS n
WHERE n.nspname::text !~ '^pg_(toast_)?temp_'
UNION ALL
SELECT 'type', t.oid::text, t.typacl::text, NULL::smallint
FROM pg_type AS t
JOIN pg_namespace AS n ON n.oid = t.typnamespace
WHERE n.nspname::text !~ '^pg_(toast_)?temp_';

DO $$
DECLARE
  v_function oid := to_regprocedure('public.lookup_associated_participant(text,uuid,text)');
  v_definition text;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION '0019 assertion failed: lookup_associated_participant is missing';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_function)
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc AS p, unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting
       WHERE p.oid = v_function AND setting = 'search_path=""'
     ) THEN
    RAISE EXCEPTION '0019 assertion failed: RPC must remain SECURITY DEFINER with empty search_path';
  END IF;

  IF NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
     OR has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('service_role', v_function, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS p
       CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS grant_row
       WHERE p.oid = v_function
         AND grant_row.privilege_type = 'EXECUTE'
         AND grant_row.grantee NOT IN (p.proowner, 'authenticated'::regrole::oid)
     ) THEN
    RAISE EXCEPTION '0019 assertion failed: execute must be granted only to authenticated callers';
  END IF;

  v_definition := pg_get_functiondef(v_function);
  IF position('FROM context_members AS cm' IN v_definition) = 0
     OR position('JOIN auth.users AS u ON u.id = cm.id' IN v_definition) = 0
     OR position('FROM auth.users AS u' IN v_definition) > 0 THEN
    RAISE EXCEPTION '0019 assertion failed: email candidate lookup is not bounded by context_members';
  END IF;

  IF EXISTS (
    SELECT 1 FROM _0019_function_snapshot AS old
    FULL JOIN (
      SELECT p.oid, n.nspname, p.proname, p.proargtypes::text AS proargtypes,
             pg_get_functiondef(p.oid) AS definition, p.proacl, p.prosecdef, p.proconfig
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE p.prokind <> 'a'
    ) AS current USING (oid)
    WHERE NOT (
      coalesce(old.nspname, current.nspname) = 'public'
      AND coalesce(old.proname, current.proname) = 'lookup_associated_participant'
      AND coalesce(old.proargtypes, current.proargtypes) = '25 2950 25'
    )
      AND (old.oid IS DISTINCT FROM current.oid
        OR (old.definition, old.proacl, old.prosecdef, old.proconfig)
           IS DISTINCT FROM (current.definition, current.proacl, current.prosecdef, current.proconfig))
  ) THEN
    RAISE EXCEPTION '0019 assertion failed: a function other than the target RPC changed';
  END IF;

  IF EXISTS (
    (SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM _0019_policy_snapshot
     EXCEPT ALL SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies)
    UNION ALL
    (SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies
     EXCEPT ALL SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM _0019_policy_snapshot)
  ) THEN
    RAISE EXCEPTION '0019 assertion failed: a policy changed';
  END IF;

  IF EXISTS (
    (SELECT object_kind, object_id, acl, sub_id FROM _0019_acl_snapshot
     EXCEPT ALL SELECT object_kind, object_id, acl, sub_id FROM _0019_acl_current)
    UNION ALL
    (SELECT object_kind, object_id, acl, sub_id FROM _0019_acl_current
     EXCEPT ALL SELECT object_kind, object_id, acl, sub_id FROM _0019_acl_snapshot)
  ) THEN
    RAISE EXCEPTION '0019 assertion failed: an object ACL changed';
  END IF;
END;
$$;

COMMIT;

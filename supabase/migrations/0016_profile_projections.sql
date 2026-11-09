-- Additive, not routed by the UI: owner-scoped profile projections and lookup throttling.
-- Existing role-based policies and legacy RPCs remain unchanged until 0017.

CREATE TABLE private.associated_profile_lookup_rate_limits (
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context_kind text NOT NULL CHECK (context_kind IN ('group', 'exam')),
  context_id uuid NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (requester_id, context_kind, context_id)
);

ALTER TABLE private.associated_profile_lookup_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.associated_profile_lookup_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_associated_participants(
  p_context_kind text,
  p_context_id uuid
)
RETURNS TABLE(id uuid, display_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requester uuid := auth.uid();
BEGIN
  IF v_requester IS NULL OR p_context_id IS NULL THEN
    RETURN;
  END IF;

  IF p_context_kind = 'group' THEN
    IF NOT private.owns_group_by_owner(p_context_id) THEN
      RETURN;
    END IF;

    RETURN QUERY
      SELECT p.id, p.full_name, u.email::text
      FROM public.group_students AS gs
      JOIN public.profiles AS p ON p.id = gs.student_id
      JOIN auth.users AS u ON u.id = p.id
      WHERE gs.group_id = p_context_id
        AND gs.student_id <> v_requester
      ORDER BY p.full_name, p.id;
    RETURN;
  ELSIF p_context_kind = 'exam' THEN
    IF NOT private.owns_exam_by_owner(p_context_id) THEN
      RETURN;
    END IF;

    RETURN QUERY
      WITH associated_accounts AS (
        SELECT gs.student_id AS account_id
        FROM public.exam_permissions AS ep
        JOIN public.groups AS g
          ON g.id = ep.group_id
         AND g.owner_id = v_requester
        JOIN public.group_students AS gs ON gs.group_id = g.id
        WHERE ep.exam_id = p_context_id
        UNION
        SELECT ea.student_id AS account_id
        FROM public.exam_attempts AS ea
        WHERE ea.exam_id = p_context_id
      )
      SELECT p.id, p.full_name, u.email::text
      FROM associated_accounts AS associated
      JOIN public.profiles AS p ON p.id = associated.account_id
      JOIN auth.users AS u ON u.id = p.id
      WHERE p.id <> v_requester
      ORDER BY p.full_name, p.id;
    RETURN;
  END IF;
  RETURN;
END;
$$;

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
  v_is_associated boolean := false;
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

  -- Both negative cases always perform the same candidate lookup and the same
  -- context association query before deciding whether to return a row.
  -- auth.users is managed by Supabase; this migration deliberately does not
  -- alter that schema. Question for a later design review: can a functional
  -- index on lower(auth.users.email) be supported without changing auth schema?
  -- Until then lower(email) uses the same scan for each input; cost follows
  -- table cardinality, not whether the account exists. The delay below is only
  -- a minimum-duration floor, never the mechanism for equalizing branches.
  v_lookup_started := pg_catalog.clock_timestamp();
  SELECT u.id, p.full_name
    INTO v_candidate_id, v_candidate_name
  FROM auth.users AS u
  JOIN public.profiles AS p ON p.id = u.id
  WHERE pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  ORDER BY u.id
  LIMIT 1;

  IF p_context_kind = 'group' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.group_students AS gs
      WHERE gs.group_id = p_context_id
        AND gs.student_id = v_candidate_id
    ) INTO v_is_associated;
  ELSE
    SELECT
      EXISTS (
        SELECT 1
        FROM public.exam_permissions AS ep
        JOIN public.groups AS g ON g.id = ep.group_id AND g.owner_id = v_requester
        JOIN public.group_students AS gs ON gs.group_id = g.id
        WHERE ep.exam_id = p_context_id
          AND gs.student_id = v_candidate_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.exam_attempts AS ea
        WHERE ea.exam_id = p_context_id
          AND ea.student_id = v_candidate_id
      )
      INTO v_is_associated;
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (pg_catalog.clock_timestamp() - v_lookup_started));
  IF v_elapsed_seconds < 0.05 THEN
    PERFORM pg_catalog.pg_sleep(0.05 - v_elapsed_seconds);
  END IF;

  IF v_candidate_id IS NOT NULL AND v_candidate_id <> v_requester AND v_is_associated THEN
    RETURN QUERY SELECT v_candidate_id, v_candidate_name;
  END IF;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.list_associated_participants(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_associated_participants(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.lookup_associated_participant(text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_associated_participant(text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.list_associated_participants(text, uuid) IS
  'Owner-scoped participant projection: id, display name and email for current group members or exam group members plus attempt holders.';
COMMENT ON FUNCTION public.lookup_associated_participant(text, uuid, text) IS
  'Exact associated-email lookup for an owned group/exam; returns only id and display name, with per-requester/context throttling and normalized timing.';

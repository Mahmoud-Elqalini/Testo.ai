BEGIN;

-- T030 / mapping §1, §3, §4: preflight. Abort before any DDL if the 0016
-- baseline, the approved permission-row cleanup, or required old objects differ.
DO $preflight$
DECLARE
  v_policy_count integer;
BEGIN
  SELECT pg_catalog.count(*) INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public';
  IF v_policy_count <> 29 THEN
    RAISE EXCEPTION '0017 preflight: expected 29 public policies, found %', v_policy_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.exam_permissions AS ep
    WHERE ep.student_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION '0017 preflight: exam_permissions must be group-only before cutover';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.exam_permissions AS ep
    WHERE ep.group_id IS NULL
  ) THEN
    RAISE EXCEPTION '0017 preflight: every exam permission must reference a group';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exam_permissions AS ep
    LEFT JOIN public.exams AS e ON e.id = ep.exam_id
    LEFT JOIN public.groups AS g ON g.id = ep.group_id
    WHERE e.id IS NULL OR g.id IS NULL
       OR g.owner_id IS DISTINCT FROM e.owner_id
  ) THEN
    RAISE EXCEPTION '0017 preflight: every permission group must be owned by the exam owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.group_students AS gs
    JOIN public.groups AS g ON g.id = gs.group_id
    WHERE gs.student_id = g.owner_id
  ) THEN
    RAISE EXCEPTION '0017 preflight: owner self-membership rows must be resolved before cutover';
  END IF;

  IF pg_catalog.to_regprocedure('public.fn_start_attempt(uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_get_exam_questions(uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_submit_attempt(uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.list_exam_permissions(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.list_group_students(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.search_student_by_email(text)') IS NULL
     OR pg_catalog.to_regprocedure('private.can_access_exam_permission(uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_require_student_group_member()') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_require_student_exam_permission()') IS NULL THEN
    RAISE EXCEPTION '0017 preflight: an expected old function signature is absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS t
    JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'group_students'
      AND t.tgname = 'trg_require_student_group_member' AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS t
    JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'exam_permissions'
      AND t.tgname = 'trg_require_student_exam_permission' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION '0017 preflight: expected legacy student trigger is absent';
  END IF;
END;
$preflight$;

-- T030 / mapping §2: owner_id-based private helpers. Each derives caller
-- identity from auth.uid() and checks the stored owner/membership relationship.
CREATE OR REPLACE FUNCTION private.owns_group(target_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.groups AS g
       WHERE g.id = target_group_id AND g.owner_id = auth.uid()
     );
$function$;

CREATE OR REPLACE FUNCTION private.owns_exam(target_exam_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.exams AS e
       WHERE e.id = target_exam_id AND e.owner_id = auth.uid()
     );
$function$;

CREATE OR REPLACE FUNCTION private.owns_exam_attempt(target_attempt_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.exam_attempts AS ea
       JOIN public.exams AS e ON e.id = ea.exam_id
       WHERE ea.id = target_attempt_id AND e.owner_id = auth.uid()
     );
$function$;

CREATE OR REPLACE FUNCTION private.can_access_exam(target_exam_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.exams AS e
       JOIN public.exam_permissions AS ep ON ep.exam_id = e.id
       JOIN public.groups AS g ON g.id = ep.group_id AND g.owner_id = e.owner_id
       JOIN public.group_students AS gs ON gs.group_id = g.id
       WHERE e.id = target_exam_id
         AND e.is_published IS TRUE
         AND ep.group_id IS NOT NULL
         AND ep.student_id IS NULL
         AND gs.student_id = auth.uid()
     );
$function$;

-- Keep the old identity arguments temporarily for dependent policy replacement,
-- but validate them against a stored permission row and current membership.
CREATE OR REPLACE FUNCTION private.can_access_exam_permission(
  target_exam_id uuid,
  target_student_id uuid,
  target_group_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND target_student_id IS NULL
     AND target_group_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.exam_permissions AS ep
       JOIN public.exams AS e ON e.id = ep.exam_id
       JOIN public.groups AS g ON g.id = ep.group_id AND g.owner_id = e.owner_id
       JOIN public.group_students AS gs ON gs.group_id = g.id
       WHERE ep.exam_id = target_exam_id
         AND ep.group_id = target_group_id
         AND ep.student_id IS NULL
         AND gs.student_id = auth.uid()
     );
$function$;

-- T030 / mapping §2: fixed-path cron and trigger helpers. These are internal
-- database entry points; they perform maintenance/trigger work rather than
-- authorize a caller and are revoked from every client/service role below.
CREATE OR REPLACE FUNCTION public.fn_create_pending_attempt_on_group_student()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.exam_attempts (exam_id, student_id, access_token, status)
  SELECT e.id, NEW.student_id, pg_catalog.gen_random_uuid()::text,
         'pending'::public.attempt_status
  FROM public.exams AS e
  JOIN public.exam_permissions AS ep ON ep.exam_id = e.id
  WHERE ep.group_id = NEW.group_id
    AND ep.student_id IS NULL
    AND e.is_published IS TRUE
    AND e.owner_id <> NEW.student_id
    AND pg_catalog.now() >= e.start_time
    AND pg_catalog.now() < e.start_time + (e.duration_minutes * interval '1 minute')
    AND NOT EXISTS (
      SELECT 1 FROM public.exam_attempts AS ea
      WHERE ea.exam_id = e.id AND ea.student_id = NEW.student_id
    );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_create_pending_attempt_on_permission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_exam_record record;
  v_student_ids uuid[];
BEGIN
  IF NEW.student_id IS NOT NULL OR NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.start_time, e.duration_minutes, e.is_published, e.owner_id
    INTO v_exam_record
    FROM public.exams AS e
   WHERE e.id = NEW.exam_id;

  IF v_exam_record.is_published IS TRUE
     AND pg_catalog.now() >= v_exam_record.start_time
     AND pg_catalog.now() < v_exam_record.start_time
       + (v_exam_record.duration_minutes * interval '1 minute') THEN
    SELECT pg_catalog.array_agg(gs.student_id)
      INTO v_student_ids
      FROM public.group_students AS gs
     WHERE gs.group_id = NEW.group_id
       AND gs.student_id <> v_exam_record.owner_id;

    IF v_student_ids IS NOT NULL THEN
      INSERT INTO public.exam_attempts (exam_id, student_id, access_token, status)
      SELECT NEW.exam_id, student_id, pg_catalog.gen_random_uuid()::text,
             'pending'::public.attempt_status
      FROM pg_catalog.unnest(v_student_ids) AS members(student_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.exam_attempts AS ea
        WHERE ea.exam_id = NEW.exam_id AND ea.student_id = members.student_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_create_pending_attempts_at_start()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.exam_attempts (exam_id, student_id, access_token, status)
  SELECT DISTINCT e.id, permitted.student_id, pg_catalog.gen_random_uuid()::text,
         'pending'::public.attempt_status
  FROM public.exams AS e
  CROSS JOIN LATERAL (
    SELECT gs.student_id
    FROM public.exam_permissions AS ep
    JOIN public.groups AS g ON g.id = ep.group_id
    JOIN public.group_students AS gs ON gs.group_id = g.id
    WHERE ep.exam_id = e.id
      AND ep.group_id IS NOT NULL
      AND gs.student_id <> e.owner_id
  ) AS permitted
  WHERE e.is_published IS TRUE
    AND e.start_time <= pg_catalog.now()
    AND e.start_time > pg_catalog.now() - interval '2 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM public.exam_attempts AS ea
      WHERE ea.exam_id = e.id AND ea.student_id = permitted.student_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sweep_expired_attempts()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.exam_attempts AS ea
     SET status = 'auto_submitted'::public.attempt_status,
         finished_at = pg_catalog.now()
    FROM public.exams AS e
   WHERE ea.exam_id = e.id
     AND ea.status = 'in_progress'::public.attempt_status
     AND pg_catalog.now() >= e.start_time + (e.duration_minutes * interval '1 minute');

  UPDATE public.exam_attempts AS ea
     SET status = 'abandoned'::public.attempt_status
    FROM public.exams AS e
   WHERE ea.exam_id = e.id
     AND ea.status = 'pending'::public.attempt_status
     AND pg_catalog.now() >= e.start_time + (e.duration_minutes * interval '1 minute');
END;
$function$;

-- T030 / mapping §2, §5: signup and role-protection trigger bodies stay intact;
-- only pin their previously mutable paths. Their trigger invocations remain.
ALTER FUNCTION public.fn_create_profile_on_signup() SET search_path = '';
ALTER FUNCTION public.fn_protect_profile_role() SET search_path = '';

-- T030 / mapping §2, §5: JWT-based attempt RPCs. The caller identity is never
-- accepted as an argument; each verifies the stored attempt and current group
-- permission/membership before reading or changing attempt data.
CREATE FUNCTION public.fn_start_attempt(p_attempt_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_start timestamptz;
  v_duration integer;
  v_published boolean;
  v_exam_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;

  SELECT ea.* INTO v_attempt
    FROM public.exam_attempts AS ea
   WHERE ea.id = p_attempt_id AND ea.student_id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;

  SELECT e.start_time, e.duration_minutes, e.is_published, e.owner_id
    INTO v_start, v_duration, v_published, v_exam_owner
    FROM public.exams AS e
   WHERE e.id = v_attempt.exam_id;
  IF v_exam_owner = auth.uid() OR NOT private.can_access_exam_via_group(v_attempt.exam_id) THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;
  IF v_attempt.status NOT IN ('pending'::public.attempt_status, 'in_progress'::public.attempt_status) THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'status_not_startable');
  END IF;
  IF v_published IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'exam_not_published');
  END IF;
  IF pg_catalog.now() < v_start
     OR pg_catalog.now() >= v_start + (v_duration * interval '1 minute') THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'outside_exam_window');
  END IF;

  UPDATE public.exam_attempts AS ea
     SET session_id = p_session_id,
         status = 'in_progress'::public.attempt_status,
         started_at = COALESCE(ea.started_at, pg_catalog.now())
   WHERE ea.id = p_attempt_id;

  RETURN pg_catalog.jsonb_build_object(
    'attempt_id', p_attempt_id,
    'session_id', p_session_id,
    'was_takeover', v_attempt.session_id IS NOT NULL,
    'remaining_seconds', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM
      (v_start + (v_duration * interval '1 minute') - pg_catalog.now())))::integer),
    'exam_ends_at', v_start + (v_duration * interval '1 minute')
  );
END;
$function$;

CREATE FUNCTION public.fn_get_exam_questions(p_attempt_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_start timestamptz;
  v_duration integer;
  v_questions jsonb;
  v_answers jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;
  SELECT ea.* INTO v_attempt
    FROM public.exam_attempts AS ea
   WHERE ea.id = p_attempt_id AND ea.student_id = auth.uid()
   FOR SHARE;
  IF NOT FOUND OR NOT private.can_access_exam_via_group(v_attempt.exam_id) THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;

  SELECT e.start_time, e.duration_minutes
    INTO v_start, v_duration
    FROM public.exams AS e WHERE e.id = v_attempt.exam_id;
  IF v_attempt.session_id IS DISTINCT FROM p_session_id THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'session_mismatch');
  END IF;
  IF v_attempt.status <> 'in_progress'::public.attempt_status THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'attempt_not_in_progress');
  END IF;
  IF pg_catalog.now() >= v_start + (v_duration * interval '1 minute') THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'outside_exam_window');
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', q.id, 'type', q.type, 'text', q.text, 'points', q.points, 'order', q."order",
        'mcq_choices', CASE WHEN q.mcq_choices IS NULL THEN NULL ELSE COALESCE(
          (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', choice.value->>'id', 'text', choice.value->>'text'))
             FROM pg_catalog.jsonb_array_elements(q.mcq_choices) AS choice(value)),
          '[]'::jsonb
        ) END
      ) ORDER BY q."order"
    ), '[]'::jsonb
  ) INTO v_questions
  FROM public.questions AS q
  WHERE q.exam_id = v_attempt.exam_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'question_id', a.question_id, 'mcq_answer', a.mcq_answer, 'essay_answer', a.essay_answer
    )), '[]'::jsonb
  ) INTO v_answers
  FROM public.answers AS a
  WHERE a.attempt_id = p_attempt_id;

  RETURN pg_catalog.jsonb_build_object(
    'attempt_id', p_attempt_id,
    'remaining_seconds', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM
      (v_start + (v_duration * interval '1 minute') - pg_catalog.now())))::integer),
    'questions', v_questions,
    'answers', v_answers
  );
END;
$function$;

CREATE FUNCTION public.fn_save_attempt_answer(
  p_attempt_id uuid,
  p_session_id uuid,
  p_question_id uuid,
  p_mcq_answer text,
  p_essay_answer text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_start timestamptz;
  v_duration integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;
  SELECT ea.* INTO v_attempt
    FROM public.exam_attempts AS ea
   WHERE ea.id = p_attempt_id AND ea.student_id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND OR NOT private.can_access_exam_via_group(v_attempt.exam_id) THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;

  SELECT e.start_time, e.duration_minutes
    INTO v_start, v_duration FROM public.exams AS e WHERE e.id = v_attempt.exam_id;
  IF v_attempt.session_id IS DISTINCT FROM p_session_id THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'session_mismatch');
  END IF;
  IF v_attempt.status <> 'in_progress'::public.attempt_status THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'attempt_not_in_progress');
  END IF;
  IF pg_catalog.now() >= v_start + (v_duration * interval '1 minute') THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'outside_exam_window');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.questions AS q
    WHERE q.id = p_question_id AND q.exam_id = v_attempt.exam_id AND (
      (q.type = 'mcq'::public.question_type AND p_essay_answer IS NULL AND
        (p_mcq_answer IS NULL OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements(q.mcq_choices) AS choice(value)
          WHERE choice.value->>'id' = p_mcq_answer
        )))
      OR (q.type = 'essay'::public.question_type AND p_mcq_answer IS NULL)
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('validation_error', 'The answer does not match this exam question.');
  END IF;

  INSERT INTO public.answers (attempt_id, question_id, mcq_answer, essay_answer)
  VALUES (p_attempt_id, p_question_id, p_mcq_answer, p_essay_answer)
  ON CONFLICT (attempt_id, question_id) DO UPDATE
    SET mcq_answer = EXCLUDED.mcq_answer,
        essay_answer = EXCLUDED.essay_answer;

  RETURN pg_catalog.jsonb_build_object(
    'saved', true, 'question_id', p_question_id, 'saved_at', pg_catalog.now()
  );
END;
$function$;

CREATE FUNCTION public.fn_submit_attempt(p_attempt_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;
  SELECT ea.* INTO v_attempt
    FROM public.exam_attempts AS ea
   WHERE ea.id = p_attempt_id AND ea.student_id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND OR NOT private.can_access_exam_via_group(v_attempt.exam_id) THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'owner_mismatch');
  END IF;
  IF v_attempt.session_id IS DISTINCT FROM p_session_id THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'session_mismatch');
  END IF;
  IF v_attempt.status = 'submitted'::public.attempt_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'attempt_id', p_attempt_id, 'status', 'submitted',
      'finished_at', v_attempt.finished_at, 'already_submitted', true
    );
  END IF;
  IF v_attempt.status <> 'in_progress'::public.attempt_status THEN
    RETURN pg_catalog.jsonb_build_object('denial_reason', 'attempt_not_in_progress');
  END IF;

  UPDATE public.exam_attempts AS ea
     SET status = 'submitted'::public.attempt_status,
         finished_at = pg_catalog.now()
   WHERE ea.id = p_attempt_id
  RETURNING ea.* INTO v_attempt;

  RETURN pg_catalog.jsonb_build_object(
    'attempt_id', p_attempt_id, 'status', 'submitted',
    'finished_at', v_attempt.finished_at, 'already_submitted', false
  );
END;
$function$;

-- T030 / mapping §2: invitation RPCs retain their response shapes but authorize
-- the stored group owner, not profiles.role. Redemption is the sole join path.
CREATE OR REPLACE FUNCTION public.create_group_invitation(target_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_code text; v_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT private.owns_group_by_owner(target_group_id) THEN
    RAISE EXCEPTION 'Invitation management is not available for this group' USING ERRCODE = '42501';
  END IF;
  v_code := private.group_invitation_new_code();
  INSERT INTO private.group_invitations AS existing
    (group_id, code_hash, created_by, created_at, expires_at, revoked_at)
  VALUES (target_group_id, private.group_invitation_code_hash(v_code), auth.uid(),
          pg_catalog.now(), pg_catalog.now() + interval '30 days', NULL)
  ON CONFLICT (group_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash, created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at, revoked_at = NULL
  RETURNING existing.expires_at INTO v_expires_at;
  RETURN pg_catalog.jsonb_build_object('code', v_code, 'expires_at', v_expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rotate_group_invitation(target_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_code text; v_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT private.owns_group_by_owner(target_group_id) THEN
    RAISE EXCEPTION 'Invitation management is not available for this group' USING ERRCODE = '42501';
  END IF;
  v_code := private.group_invitation_new_code();
  INSERT INTO private.group_invitations AS existing
    (group_id, code_hash, created_by, created_at, expires_at, revoked_at)
  VALUES (target_group_id, private.group_invitation_code_hash(v_code), auth.uid(),
          pg_catalog.now(), pg_catalog.now() + interval '30 days', NULL)
  ON CONFLICT (group_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash, created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at, revoked_at = NULL
  RETURNING existing.expires_at INTO v_expires_at;
  RETURN pg_catalog.jsonb_build_object('code', v_code, 'expires_at', v_expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_group_invitation(target_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_found boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.owns_group_by_owner(target_group_id) THEN
    RAISE EXCEPTION 'Invitation management is not available for this group' USING ERRCODE = '42501';
  END IF;
  UPDATE private.group_invitations AS invitation
     SET revoked_at = COALESCE(invitation.revoked_at, pg_catalog.now())
   WHERE invitation.group_id = target_group_id;
  v_found := FOUND;
  RETURN pg_catalog.jsonb_build_object('revoked', v_found);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_invitation_status(target_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_invitation private.group_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.owns_group_by_owner(target_group_id) THEN
    RAISE EXCEPTION 'Invitation management is not available for this group' USING ERRCODE = '42501';
  END IF;
  SELECT invitation.* INTO v_invitation
    FROM private.group_invitations AS invitation
   WHERE invitation.group_id = target_group_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'exists', false, 'created_at', NULL, 'expires_at', NULL, 'revoked_at', NULL
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'exists', true, 'created_at', v_invitation.created_at,
    'expires_at', v_invitation.expires_at, 'revoked_at', v_invitation.revoked_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_group_invitation(invitation_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_limit private.group_invitation_redemption_limits%ROWTYPE;
  v_invitation private.group_invitations%ROWTYPE;
  v_code text;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  INSERT INTO private.group_invitation_redemption_limits (student_id)
  VALUES (v_student_id) ON CONFLICT (student_id) DO NOTHING;
  SELECT limits.* INTO v_limit
    FROM private.group_invitation_redemption_limits AS limits
   WHERE limits.student_id = v_student_id FOR UPDATE;

  IF v_limit.window_started_at <= pg_catalog.now() - interval '15 minutes' THEN
    UPDATE private.group_invitation_redemption_limits AS limits
       SET window_started_at = pg_catalog.now(), failed_attempts = 0, blocked_until = NULL
     WHERE limits.student_id = v_student_id
    RETURNING limits.* INTO v_limit;
  END IF;
  IF v_limit.blocked_until IS NOT NULL AND v_limit.blocked_until > pg_catalog.now() THEN
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  v_code := pg_catalog.lower(pg_catalog.btrim(COALESCE(invitation_code, '')));
  IF v_code !~ '^[a-f0-9]{32}$' THEN
    UPDATE private.group_invitation_redemption_limits AS limits
       SET failed_attempts = failed_attempts + 1,
           blocked_until = CASE WHEN failed_attempts + 1 >= 5
             THEN window_started_at + interval '15 minutes' ELSE NULL END
     WHERE limits.student_id = v_student_id;
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  SELECT invitation.* INTO v_invitation
    FROM private.group_invitations AS invitation
   WHERE invitation.code_hash = private.group_invitation_code_hash(v_code)
   FOR UPDATE;
  IF NOT FOUND OR v_invitation.revoked_at IS NOT NULL
     OR v_invitation.expires_at <= pg_catalog.now() THEN
    UPDATE private.group_invitation_redemption_limits AS limits
       SET failed_attempts = failed_attempts + 1,
           blocked_until = CASE WHEN failed_attempts + 1 >= 5
             THEN window_started_at + interval '15 minutes' ELSE NULL END
     WHERE limits.student_id = v_student_id;
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  IF private.owns_group_by_owner(v_invitation.group_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false);
  END IF;

  INSERT INTO public.group_students (group_id, student_id)
  VALUES (v_invitation.group_id, v_student_id)
  ON CONFLICT (group_id, student_id) DO NOTHING;

  UPDATE private.group_invitation_redemption_limits AS limits
     SET window_started_at = pg_catalog.now(), failed_attempts = 0, blocked_until = NULL
   WHERE limits.student_id = v_student_id;
  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$function$;

-- T030 / mapping §2: fixed-path result RPC. User relationship or exam ownership
-- is checked against stored rows; role membership is no longer authorization.
CREATE OR REPLACE FUNCTION public.fn_get_student_attempt_result(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_attempt_id uuid;
  v_exam_id uuid;
  v_student_id uuid;
  v_attempt_status public.attempt_status;
  v_finished_at timestamptz;
  v_exam_title text;
  v_question_count bigint;
  v_scored_question_count bigint;
  v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('error', 'access_denied');
  END IF;
  SELECT ea.id, ea.exam_id, ea.student_id, ea.status, ea.finished_at
    INTO v_attempt_id, v_exam_id, v_student_id, v_attempt_status, v_finished_at
    FROM public.exam_attempts AS ea
   WHERE ea.id = p_attempt_id;
  IF NOT FOUND OR (v_student_id <> auth.uid() AND NOT private.owns_exam_by_owner(v_exam_id)) THEN
    RETURN pg_catalog.jsonb_build_object('error', 'access_denied');
  END IF;
  IF v_attempt_status NOT IN ('submitted'::public.attempt_status, 'auto_submitted'::public.attempt_status) THEN
    RETURN pg_catalog.jsonb_build_object('error', 'access_denied');
  END IF;

  SELECT e.title INTO v_exam_title FROM public.exams AS e WHERE e.id = v_exam_id;
  SELECT pg_catalog.count(*), pg_catalog.count(*) FILTER (WHERE a.score IS NOT NULL)
    INTO v_question_count, v_scored_question_count
    FROM public.questions AS q
    LEFT JOIN public.answers AS a ON a.question_id = q.id AND a.attempt_id = v_attempt_id
   WHERE q.exam_id = v_exam_id;

  IF v_question_count = 0 OR v_scored_question_count <> v_question_count THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'pending', 'attempt_id', v_attempt_id, 'attempt_status', v_attempt_status,
      'exam_title', v_exam_title, 'finished_at', v_finished_at
    );
  END IF;

  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', q.id, 'type', q.type, 'text', q.text, 'order', q."order", 'points', q.points,
    'normalized_score', a.score, 'selected_choice', a.mcq_answer,
    'correct_choice', CASE WHEN q.type = 'mcq'::public.question_type THEN q.correct_choice ELSE NULL END,
    'choices', CASE WHEN q.type = 'mcq'::public.question_type THEN
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', choice.value->>'id', 'text', choice.value->>'text'
        ) ORDER BY choice.ordinality)
        FROM pg_catalog.jsonb_array_elements(COALESCE(q.mcq_choices, '[]'::jsonb))
          WITH ORDINALITY AS choice(value, ordinality)
      ), '[]'::jsonb) ELSE '[]'::jsonb END
  ) ORDER BY q."order") INTO v_questions
  FROM public.questions AS q
  JOIN public.answers AS a ON a.question_id = q.id AND a.attempt_id = v_attempt_id
  WHERE q.exam_id = v_exam_id AND a.score IS NOT NULL;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'graded', 'attempt_id', v_attempt_id, 'attempt_status', v_attempt_status,
    'exam_title', v_exam_title, 'finished_at', v_finished_at,
    'questions', COALESCE(v_questions, '[]'::jsonb)
  );
END;
$function$;

-- T030 / mapping §2: owner-scoped group-only permissions projection.
CREATE FUNCTION public.list_owned_exam_permissions(target_exam_id uuid)
RETURNS TABLE(id uuid, exam_id uuid, group_id uuid, group_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.owns_exam_by_owner(target_exam_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT ep.id, ep.exam_id, ep.group_id, g.name
      FROM public.exam_permissions AS ep
      JOIN public.groups AS g ON g.id = ep.group_id
     WHERE ep.exam_id = target_exam_id
       AND ep.student_id IS NULL
       AND ep.group_id IS NOT NULL
     ORDER BY g.name, ep.id;
END;
$function$;

-- T030 / mapping §2: role-free relationship triggers. They are invoker-only
-- validators (not RPCs); each checks auth.uid when present plus stored ownership.
CREATE FUNCTION public.fn_reject_group_owner_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_group_owner uuid;
  v_actor uuid := auth.uid();
BEGIN
  SELECT g.owner_id INTO v_group_owner
    FROM public.groups AS g WHERE g.id = NEW.group_id;
  IF NOT FOUND OR NEW.student_id IS NULL THEN
    RAISE EXCEPTION 'A valid group and member are required.' USING ERRCODE = '23514';
  END IF;
  IF NEW.student_id = v_group_owner OR (v_actor IS NOT NULL AND v_actor = v_group_owner
                                        AND NEW.student_id = v_actor) THEN
    RAISE EXCEPTION 'A group owner cannot be a member of their own group.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.fn_enforce_group_only_exam_permission()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_exam_owner uuid;
  v_group_owner uuid;
BEGIN
  IF NEW.student_id IS NOT NULL OR NEW.group_id IS NULL THEN
    RAISE EXCEPTION 'Exam permissions must target a group only.' USING ERRCODE = '23514';
  END IF;
  SELECT e.owner_id, g.owner_id INTO v_exam_owner, v_group_owner
    FROM public.exams AS e
    JOIN public.groups AS g ON g.id = NEW.group_id
   WHERE e.id = NEW.exam_id;
  IF NOT FOUND OR v_exam_owner IS DISTINCT FROM v_group_owner THEN
    RAISE EXCEPTION 'Exam permissions require a group owned by the exam owner.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_reject_group_owner_membership
BEFORE INSERT OR UPDATE ON public.group_students
FOR EACH ROW EXECUTE FUNCTION public.fn_reject_group_owner_membership();

CREATE TRIGGER trg_enforce_group_only_exam_permission
BEFORE INSERT OR UPDATE ON public.exam_permissions
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_group_only_exam_permission();

-- T030 / mapping §1: install the relationship equivalents. These predicates
-- use row owners/memberships. Mapping §1 rows 1-2: answers owner/participant.
CREATE POLICY answers_exam_owner_select ON public.answers
FOR SELECT TO authenticated
USING (private.owns_exam_attempt(attempt_id));

CREATE POLICY answers_attempt_participant_select ON public.answers
FOR SELECT TO authenticated
USING (private.owns_attempt(attempt_id));

-- Mapping §1 rows 3-4: safe-column attempt owner/participant reads.
CREATE POLICY exam_attempts_exam_owner_select ON public.exam_attempts
FOR SELECT TO authenticated
USING (private.owns_exam(exam_id));

CREATE POLICY exam_attempts_participant_select ON public.exam_attempts
FOR SELECT TO authenticated
USING (student_id = auth.uid());

-- Mapping §1 rows 5-9: owner CRUD remains; student visibility now requires a
-- stored group permission plus current membership (direct student rows end).
CREATE POLICY exam_permissions_owner_delete ON public.exam_permissions
FOR DELETE TO authenticated
USING (private.owns_exam(exam_id));

CREATE POLICY exam_permissions_owner_insert ON public.exam_permissions
FOR INSERT TO authenticated
WITH CHECK (
  private.owns_exam(exam_id)
  AND group_id IS NOT NULL
  AND student_id IS NULL
);

CREATE POLICY exam_permissions_owner_select ON public.exam_permissions
FOR SELECT TO authenticated
USING (private.owns_exam(exam_id));

CREATE POLICY exam_permissions_owner_update ON public.exam_permissions
FOR UPDATE TO authenticated
USING (private.owns_exam(exam_id))
WITH CHECK (
  private.owns_exam(exam_id)
  AND group_id IS NOT NULL
  AND student_id IS NULL
);

CREATE POLICY exam_permissions_group_member_select ON public.exam_permissions
FOR SELECT TO authenticated
USING (private.can_access_exam_permission(exam_id, student_id, group_id));

-- Mapping §1 rows 10-14: owner CRUD and published group-member exam access.
CREATE POLICY exams_owner_delete ON public.exams
FOR DELETE TO authenticated
USING (private.owns_exam(id));

CREATE POLICY exams_owner_insert ON public.exams
FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY exams_owner_select ON public.exams
FOR SELECT TO authenticated
USING (private.owns_exam(id));

CREATE POLICY exams_owner_update ON public.exams
FOR UPDATE TO authenticated
USING (private.owns_exam(id))
WITH CHECK (owner_id = auth.uid());

CREATE POLICY exams_group_member_select ON public.exams
FOR SELECT TO authenticated
USING (private.can_access_exam(id));

-- Mapping §1 rows 15-18: owner read/delete remain; direct client INSERT/UPDATE end.
CREATE POLICY group_students_owner_delete ON public.group_students
FOR DELETE TO authenticated
USING (private.owns_group(group_id));

CREATE POLICY group_students_owner_select ON public.group_students
FOR SELECT TO authenticated
USING (private.owns_group(group_id));

-- Mapping §1 rows 19-22: owner relationship replaces role/admin_id predicates.
CREATE POLICY groups_owner_delete ON public.groups
FOR DELETE TO authenticated
USING (private.owns_group(id));

CREATE POLICY groups_owner_insert ON public.groups
FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY groups_owner_select ON public.groups
FOR SELECT TO authenticated
USING (private.owns_group(id));

CREATE POLICY groups_owner_update ON public.groups
FOR UPDATE TO authenticated
USING (private.owns_group(id))
WITH CHECK (owner_id = auth.uid());

-- Mapping §1 rows 26-29: question CRUD remains exam-owner scoped.
CREATE POLICY questions_exam_owner_delete ON public.questions
FOR DELETE TO authenticated
USING (private.owns_exam(exam_id));

CREATE POLICY questions_exam_owner_insert ON public.questions
FOR INSERT TO authenticated
WITH CHECK (private.owns_exam(exam_id));

CREATE POLICY questions_exam_owner_select ON public.questions
FOR SELECT TO authenticated
USING (private.owns_exam(exam_id));

CREATE POLICY questions_exam_owner_update ON public.questions
FOR UPDATE TO authenticated
USING (private.owns_exam(exam_id))
WITH CHECK (private.owns_exam(exam_id));

-- T030 / mapping §2, §3: remove default/public/client access before dropping
-- legacy paths. Cron executes as postgres; its functions need no service_role.
REVOKE ALL ON FUNCTION private.owns_group(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.owns_exam(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.owns_exam_attempt(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.can_access_exam(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.can_access_exam_permission(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.can_access_exam_via_group(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.owns_group_by_owner(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.owns_exam_by_owner(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.owns_attempt(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_current_group_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_admin_scoped_student(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_student() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.group_invitation_code_hash(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.group_invitation_new_code() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.owns_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_exam_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_exam_permission(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_exam_via_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_group_by_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_exam_by_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_current_group_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_create_pending_attempt_on_group_student() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_create_pending_attempt_on_permission() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_create_pending_attempts_at_start() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_create_profile_on_signup() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_protect_profile_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_preserve_in_progress_exam_permission() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_preserve_in_progress_group_access() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_sync_user_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_sweep_expired_attempts() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_reject_group_owner_membership() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_enforce_group_only_exam_permission() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_start_attempt(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_get_exam_questions(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_save_attempt_answer(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_submit_attempt(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_get_student_attempt_result(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_group_invitation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rotate_group_invitation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_group_invitation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_group_invitation_status(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.redeem_group_invitation(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_owned_exam_permissions(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_joined_groups() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_associated_participants(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lookup_associated_participant(text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fn_start_attempt(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_exam_questions(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_save_attempt_answer(uuid,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_attempt(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_student_attempt_result(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_group_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_group_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_invitation_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_group_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_owned_exam_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_joined_groups() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_associated_participants(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_associated_participant(text,uuid,text) TO authenticated;

-- The legacy attempt signatures are revoked here, then dropped after old
-- policies are removed (mapping §2, §4).
REVOKE ALL ON FUNCTION public.fn_start_attempt(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_get_exam_questions(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_submit_attempt(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

-- T030 / mapping §3: revoke every current table and column privilege from
-- client roles, then grant only the cutover contract and fixture minimum.
REVOKE ALL PRIVILEGES ON TABLE public.exam_attempts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (id, exam_id, student_id, access_token, status, started_at, finished_at, session_id)
  ON TABLE public.exam_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (id, exam_id, student_id, status, started_at, finished_at, session_id)
  ON TABLE public.exam_attempts TO authenticated;
GRANT SELECT (id, exam_id, student_id, status, started_at, finished_at, session_id)
  ON TABLE public.exam_attempts TO service_role;
GRANT INSERT (id, exam_id, student_id, access_token, status, started_at, finished_at, session_id)
  ON TABLE public.exam_attempts TO service_role;
GRANT UPDATE (status) ON TABLE public.exam_attempts TO service_role;
GRANT DELETE ON TABLE public.exam_attempts TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.group_students FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (group_id, student_id) ON TABLE public.group_students
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, DELETE ON TABLE public.group_students TO authenticated;
GRANT SELECT, DELETE ON TABLE public.group_students TO service_role;
GRANT INSERT (group_id, student_id) ON TABLE public.group_students TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.exam_permissions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES (id, exam_id, group_id, student_id) ON TABLE public.exam_permissions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, DELETE ON TABLE public.exam_permissions TO authenticated;
GRANT INSERT (exam_id, group_id), UPDATE (exam_id, group_id)
  ON TABLE public.exam_permissions TO authenticated;
GRANT SELECT, DELETE ON TABLE public.exam_permissions TO service_role;
GRANT INSERT (exam_id, group_id) ON TABLE public.exam_permissions TO service_role;

-- T030 / mapping §1: remove the legacy policies after replacement rules exist.
DROP POLICY answers_admin_select ON public.answers;
DROP POLICY answers_student_select ON public.answers;
DROP POLICY exam_attempts_admin_select ON public.exam_attempts;
DROP POLICY exam_attempts_student_select ON public.exam_attempts;
DROP POLICY exam_permissions_admin_delete ON public.exam_permissions;
DROP POLICY exam_permissions_admin_insert ON public.exam_permissions;
DROP POLICY exam_permissions_admin_select ON public.exam_permissions;
DROP POLICY exam_permissions_admin_update ON public.exam_permissions;
DROP POLICY exam_permissions_student_select ON public.exam_permissions;
DROP POLICY exams_admin_delete ON public.exams;
DROP POLICY exams_admin_insert ON public.exams;
DROP POLICY exams_admin_select ON public.exams;
DROP POLICY exams_admin_update ON public.exams;
DROP POLICY exams_student_select ON public.exams;
DROP POLICY group_students_admin_delete ON public.group_students;
DROP POLICY group_students_admin_insert ON public.group_students;
DROP POLICY group_students_admin_select ON public.group_students;
DROP POLICY group_students_admin_update ON public.group_students;
DROP POLICY groups_admin_delete ON public.groups;
DROP POLICY groups_admin_insert ON public.groups;
DROP POLICY groups_admin_select ON public.groups;
DROP POLICY groups_admin_update ON public.groups;
DROP POLICY profiles_admin_read_scoped_students ON public.profiles;
DROP POLICY questions_admin_delete ON public.questions;
DROP POLICY questions_admin_insert ON public.questions;
DROP POLICY questions_admin_select ON public.questions;
DROP POLICY questions_admin_update ON public.questions;

-- Mapping §2 row `private.is_admin_scoped_student(uuid)`: after its only
-- policy consumer is removed, retire this obsolete profile-role projection helper.
DROP FUNCTION private.is_admin_scoped_student(uuid);

-- T030 / mapping §2: explicit REVOKE-then-DROP old public RPCs and old
-- p_student_id overloads only after authenticated replacements exist.
DROP FUNCTION public.fn_start_attempt(uuid,uuid,uuid);
DROP FUNCTION public.fn_get_exam_questions(uuid,uuid,uuid);
DROP FUNCTION public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text);
DROP FUNCTION public.fn_submit_attempt(uuid,uuid,uuid);
DROP FUNCTION public.list_exam_permissions(uuid);
DROP FUNCTION public.list_group_students(uuid);
DROP FUNCTION public.search_student_by_email(text);

-- T030 / mapping §2: remove the two role-gated student triggers and functions;
-- the role-free relationship triggers above now enforce the data invariants.
DROP TRIGGER trg_require_student_group_member ON public.group_students;
DROP TRIGGER trg_require_student_exam_permission ON public.exam_permissions;
DROP FUNCTION public.fn_require_student_group_member();
DROP FUNCTION public.fn_require_student_exam_permission();

-- T030 / mapping §2, §3: group-only CHECK is installed only after preflight
-- established compliance. NOT VALID is immediately validated in this transaction.
ALTER TABLE public.exam_permissions
  ADD CONSTRAINT exam_permissions_group_only_check
  CHECK (group_id IS NOT NULL AND student_id IS NULL) NOT VALID;
ALTER TABLE public.exam_permissions
  VALIDATE CONSTRAINT exam_permissions_group_only_check;

-- T030 / mapping §1, §2, §3, §4: final-state assertions before commit.
DO $final_assertions$
DECLARE
  v_policy_names text[];
BEGIN
  SELECT pg_catalog.array_agg(p.policyname ORDER BY p.policyname)
    INTO v_policy_names
    FROM pg_catalog.pg_policies AS p
   WHERE p.schemaname = 'public';

  IF v_policy_names IS DISTINCT FROM ARRAY[
    'answers_attempt_participant_select', 'answers_exam_owner_select',
    'exam_attempts_exam_owner_select', 'exam_attempts_participant_select',
    'exam_permissions_group_member_select', 'exam_permissions_owner_delete',
    'exam_permissions_owner_insert', 'exam_permissions_owner_select', 'exam_permissions_owner_update',
    'exams_group_member_select', 'exams_owner_delete', 'exams_owner_insert', 'exams_owner_select', 'exams_owner_update',
    'group_students_owner_delete', 'group_students_owner_select',
    'groups_owner_delete', 'groups_owner_insert', 'groups_owner_select', 'groups_owner_update',
    'profiles_self_select', 'profiles_self_update',
    'questions_exam_owner_delete', 'questions_exam_owner_insert', 'questions_exam_owner_select', 'questions_exam_owner_update'
  ]::text[] THEN
    RAISE EXCEPTION '0017 final assertion: public policy names differ from the 26 retained/replacement policies';
  END IF;

  IF pg_catalog.to_regprocedure('public.fn_start_attempt(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_get_exam_questions(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_save_attempt_answer(uuid,uuid,uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_submit_attempt(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.fn_get_student_attempt_result(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.list_owned_exam_permissions(uuid)') IS NULL THEN
    RAISE EXCEPTION '0017 final assertion: required replacement signatures are absent';
  END IF;

  IF pg_catalog.to_regprocedure('public.fn_start_attempt(uuid,uuid,uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_get_exam_questions(uuid,uuid,uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_submit_attempt(uuid,uuid,uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.list_exam_permissions(uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.list_group_students(uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.search_student_by_email(text)') IS NOT NULL THEN
    RAISE EXCEPTION '0017 final assertion: an obsolete public RPC signature remains';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
      AND NOT ('search_path=""' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))
               OR 'search_path=pg_catalog' = ANY(COALESCE(p.proconfig, ARRAY[]::text[])))
  ) THEN
    RAISE EXCEPTION '0017 final assertion: application SECURITY DEFINER function has an unsafe search_path';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE p.prokind = 'f'
      AND NOT p.prosecdef
      AND n.nspname IN ('public', 'private')
      AND p.prosrc ~* 'private\.(is_admin|is_student)\s*\('
  ) THEN
    RAISE EXCEPTION '0017 final assertion: SECURITY INVOKER function still references a role helper';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS pol
    WHERE pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~* 'private\.(is_admin|is_student)\s*\('
       OR pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~* 'private\.(is_admin|is_student)\s*\('
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid <> 0
      AND con.conbin IS NOT NULL
      AND pg_catalog.pg_get_expr(con.conbin, con.conrelid) ~* 'private\.(is_admin|is_student)\s*\('
  ) THEN
    RAISE EXCEPTION '0017 final assertion: a policy or constraint still references a role helper';
  END IF;

  IF pg_catalog.has_function_privilege('anon', 'public.fn_start_attempt(uuid,uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', 'public.fn_start_attempt(uuid,uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.fn_start_attempt(uuid,uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.fn_create_pending_attempts_at_start()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.fn_create_pending_attempts_at_start()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', 'public.fn_create_pending_attempts_at_start()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.fn_sweep_expired_attempts()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.fn_sweep_expired_attempts()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', 'public.fn_sweep_expired_attempts()', 'EXECUTE') THEN
    RAISE EXCEPTION '0017 final assertion: function grants do not match the mapping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'fn_start_attempt', 'fn_get_exam_questions', 'fn_save_attempt_answer',
        'fn_submit_attempt', 'fn_get_student_attempt_result', 'create_group_invitation',
        'rotate_group_invitation', 'revoke_group_invitation', 'get_group_invitation_status',
        'redeem_group_invitation', 'list_owned_exam_permissions', 'list_my_joined_groups',
        'list_associated_participants', 'lookup_associated_participant'
      )
      AND (
        NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        OR pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION '0017 final assertion: user RPC grants are not authenticated-only';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND (p.prorettype = 'trigger'::pg_catalog.regtype
           OR p.proname IN ('fn_create_pending_attempts_at_start', 'fn_sweep_expired_attempts'))
      AND (
        pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        )
      )
  ) THEN
    RAISE EXCEPTION '0017 final assertion: an internal trigger/cron helper is client/service callable';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.exam_attempts', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_attempts', 'INSERT')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_attempts', 'UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_attempts', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.exam_attempts', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.exam_attempts', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.exam_attempts', 'DELETE')
     OR pg_catalog.has_any_column_privilege('anon', 'public.exam_attempts', 'SELECT')
     OR pg_catalog.has_any_column_privilege('anon', 'public.exam_attempts', 'INSERT')
     OR pg_catalog.has_any_column_privilege('anon', 'public.exam_attempts', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.exam_attempts', 'access_token', 'SELECT')
     OR pg_catalog.has_any_column_privilege('authenticated', 'public.exam_attempts', 'INSERT')
     OR pg_catalog.has_any_column_privilege('authenticated', 'public.exam_attempts', 'UPDATE') THEN
    RAISE EXCEPTION '0017 final assertion: exam_attempts privileges exceed the safe-column read contract';
  END IF;

  IF pg_catalog.has_any_column_privilege('service_role', 'public.exam_attempts', 'REFERENCES')
     OR pg_catalog.has_table_privilege('service_role', 'public.exam_attempts', 'REFERENCES')
     OR pg_catalog.has_table_privilege('service_role', 'public.exam_attempts', 'TRIGGER')
     OR pg_catalog.has_table_privilege('service_role', 'public.exam_attempts', 'TRUNCATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.exam_attempts', 'UPDATE')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'id', 'UPDATE')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'exam_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'student_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'access_token', 'UPDATE')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'started_at', 'UPDATE')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'finished_at', 'UPDATE')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'session_id', 'UPDATE')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'access_token', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('service_role', 'public.exam_attempts', 'status', 'UPDATE') THEN
    RAISE EXCEPTION '0017 final assertion: exam_attempts service_role privileges exceed fixture requirements';
  END IF;

  IF NOT (
       pg_catalog.has_column_privilege('authenticated', 'public.exam_attempts', 'id', 'SELECT')
   AND pg_catalog.has_column_privilege('authenticated', 'public.exam_attempts', 'exam_id', 'SELECT')
   AND pg_catalog.has_column_privilege('authenticated', 'public.exam_attempts', 'student_id', 'SELECT')
   AND pg_catalog.has_column_privilege('authenticated', 'public.exam_attempts', 'status', 'SELECT')
   AND pg_catalog.has_column_privilege('authenticated', 'public.exam_attempts', 'started_at', 'SELECT')
   AND pg_catalog.has_column_privilege('authenticated', 'public.exam_attempts', 'finished_at', 'SELECT')
   AND pg_catalog.has_column_privilege('authenticated', 'public.exam_attempts', 'session_id', 'SELECT')
  ) THEN
    RAISE EXCEPTION '0017 final assertion: authenticated safe attempt columns are not all selectable';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.group_students', 'INSERT')
     OR pg_catalog.has_table_privilege('anon', 'public.group_students', 'UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.group_students', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.group_students', 'DELETE')
     OR pg_catalog.has_table_privilege('anon', 'public.group_students', 'REFERENCES')
     OR pg_catalog.has_table_privilege('anon', 'public.group_students', 'TRIGGER')
     OR pg_catalog.has_table_privilege('anon', 'public.group_students', 'TRUNCATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.group_students', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.group_students', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.group_students', 'REFERENCES')
     OR pg_catalog.has_table_privilege('authenticated', 'public.group_students', 'TRIGGER')
     OR pg_catalog.has_table_privilege('authenticated', 'public.group_students', 'TRUNCATE')
     OR pg_catalog.has_any_column_privilege('anon', 'public.group_students', 'INSERT')
     OR pg_catalog.has_any_column_privilege('anon', 'public.group_students', 'UPDATE')
     OR pg_catalog.has_any_column_privilege('anon', 'public.group_students', 'SELECT')
     OR pg_catalog.has_any_column_privilege('authenticated', 'public.group_students', 'INSERT')
     OR pg_catalog.has_any_column_privilege('authenticated', 'public.group_students', 'UPDATE')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.group_students', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.group_students', 'DELETE') THEN
    RAISE EXCEPTION '0017 final assertion: anon/authenticated can directly write group_students';
  END IF;
  IF pg_catalog.has_any_column_privilege('service_role', 'public.group_students', 'UPDATE')
     OR pg_catalog.has_any_column_privilege('service_role', 'public.group_students', 'REFERENCES')
     OR pg_catalog.has_table_privilege('service_role', 'public.group_students', 'TRIGGER')
     OR pg_catalog.has_table_privilege('service_role', 'public.group_students', 'TRUNCATE') THEN
    RAISE EXCEPTION '0017 final assertion: group_students service_role privileges exceed fixture requirements';
  END IF;
  IF pg_catalog.has_table_privilege('service_role', 'public.group_students', 'INSERT')
     OR NOT pg_catalog.has_column_privilege('service_role', 'public.group_students', 'group_id', 'INSERT')
     OR NOT pg_catalog.has_column_privilege('service_role', 'public.group_students', 'student_id', 'INSERT') THEN
    RAISE EXCEPTION '0017 final assertion: group_students fixture minimum grants are absent or too broad';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.exam_permissions', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_permissions', 'INSERT')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_permissions', 'UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_permissions', 'DELETE')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_permissions', 'REFERENCES')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_permissions', 'TRIGGER')
     OR pg_catalog.has_table_privilege('anon', 'public.exam_permissions', 'TRUNCATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.exam_permissions', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.exam_permissions', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.exam_permissions', 'REFERENCES')
     OR pg_catalog.has_table_privilege('authenticated', 'public.exam_permissions', 'TRIGGER')
     OR pg_catalog.has_table_privilege('authenticated', 'public.exam_permissions', 'TRUNCATE')
     OR pg_catalog.has_any_column_privilege('anon', 'public.exam_permissions', 'SELECT')
     OR pg_catalog.has_any_column_privilege('anon', 'public.exam_permissions', 'INSERT')
     OR pg_catalog.has_any_column_privilege('anon', 'public.exam_permissions', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.exam_permissions', 'student_id', 'INSERT')
     OR pg_catalog.has_column_privilege('authenticated', 'public.exam_permissions', 'student_id', 'UPDATE')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.exam_permissions', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.exam_permissions', 'DELETE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.exam_permissions', 'exam_id', 'INSERT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.exam_permissions', 'group_id', 'INSERT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.exam_permissions', 'exam_id', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.exam_permissions', 'group_id', 'UPDATE') THEN
    RAISE EXCEPTION '0017 final assertion: exam_permissions grants violate group-only owner CRUD';
  END IF;
  IF pg_catalog.has_any_column_privilege('service_role', 'public.exam_permissions', 'UPDATE')
     OR pg_catalog.has_any_column_privilege('service_role', 'public.exam_permissions', 'REFERENCES')
     OR pg_catalog.has_table_privilege('service_role', 'public.exam_permissions', 'TRIGGER')
     OR pg_catalog.has_table_privilege('service_role', 'public.exam_permissions', 'TRUNCATE') THEN
    RAISE EXCEPTION '0017 final assertion: exam_permissions service_role privileges exceed fixture requirements';
  END IF;
  IF pg_catalog.has_table_privilege('service_role', 'public.exam_permissions', 'INSERT')
     OR NOT pg_catalog.has_column_privilege('service_role', 'public.exam_permissions', 'exam_id', 'INSERT')
     OR NOT pg_catalog.has_column_privilege('service_role', 'public.exam_permissions', 'group_id', 'INSERT')
     OR pg_catalog.has_column_privilege('service_role', 'public.exam_permissions', 'student_id', 'INSERT') THEN
    RAISE EXCEPTION '0017 final assertion: exam_permissions fixture minimum grants are absent or too broad';
  END IF;

  IF EXISTS (SELECT 1 FROM public.exam_permissions AS ep WHERE ep.student_id IS NOT NULL)
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint AS c
       WHERE c.conrelid = 'public.exam_permissions'::pg_catalog.regclass
         AND c.conname = 'exam_permissions_group_only_check'
         AND c.convalidated
         AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%group_id IS NOT NULL%student_id IS NULL%'
     ) THEN
    RAISE EXCEPTION '0017 final assertion: group-only permission constraint is absent or unvalidated';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM cron.job
      WHERE username = 'postgres'
        AND command IN ('SELECT fn_create_pending_attempts_at_start();', 'SELECT fn_sweep_expired_attempts();')) <> 2 THEN
    RAISE EXCEPTION '0017 final assertion: trusted postgres cron jobs changed or are absent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS t
    JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND t.tgname IN (
      'trg_require_student_group_member', 'trg_require_student_exam_permission'
    ) AND NOT t.tgisinternal
  ) OR pg_catalog.to_regprocedure('public.fn_require_student_group_member()') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.fn_require_student_exam_permission()') IS NOT NULL THEN
    RAISE EXCEPTION '0017 final assertion: legacy role-gated relationship trigger remains';
  END IF;
END;
$final_assertions$;

COMMIT;

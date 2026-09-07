-- =============================================================================
-- 001-foundation: Functions, Triggers, and pg_cron Jobs
-- Implements: data-model.md State Transitions & Validation
-- =============================================================================

-- =============================================================================
-- 1. PROFILES: Role-change protection (Principle I & III)
--    data-model.md: "Profiles Role Lockdown"
-- =============================================================================

-- Reject any change to profiles.role unless the caller is service_role.
-- In Supabase, the service_role bypasses RLS entirely and connects as
-- the `postgres` user (or a service-role-specific user). The `authenticated`
-- role is used by client-SDK connections.
CREATE OR REPLACE FUNCTION fn_protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF current_user NOT IN ('postgres', 'service_role')
       AND current_setting('role', true) NOT IN ('postgres', 'service_role') THEN
      RAISE EXCEPTION 'Changing profiles.role is forbidden outside service-role context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION fn_protect_profile_role();

-- =============================================================================
-- 2. PROFILES: Auto-create on auth.users insert
--    data-model.md §2: "NO INSERT policy... handled by a database trigger"
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, preferred_language, preferred_theme)
  VALUES (
    NEW.id,
    'student',  -- default role; admin promotion is a service-role operation
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'en'),
    COALESCE(NEW.raw_user_meta_data->>'preferred_theme', 'light')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_create_profile_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_profile_on_signup();

-- =============================================================================
-- 3. FR-004a: Exam/Question immutability once attempts begin
--    data-model.md: "Immutability (FR-004a)"
-- =============================================================================

-- Block updates to exams if any non-pending attempt exists
CREATE OR REPLACE FUNCTION fn_enforce_exam_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow is_published to change (publishing/unpublishing is separate from content)
  -- Block changes to content/timing fields if any attempt has started
  IF (
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.description IS DISTINCT FROM NEW.description OR
    OLD.start_time IS DISTINCT FROM NEW.start_time OR
    OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
  ) THEN
    IF EXISTS (
      SELECT 1 FROM exam_attempts
      WHERE exam_id = OLD.id AND status != 'pending'
    ) THEN
      RAISE EXCEPTION 'Cannot modify exam content/timing after any attempt has started (FR-004a)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_exam_immutability
  BEFORE UPDATE ON exams
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_exam_immutability();

-- Block updates to questions if any non-pending attempt exists for the parent exam
CREATE OR REPLACE FUNCTION fn_enforce_question_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_exam_id uuid;
BEGIN
  -- For UPDATE, check the existing exam_id; for DELETE, use OLD
  v_exam_id := COALESCE(NEW.exam_id, OLD.exam_id);

  IF EXISTS (
    SELECT 1 FROM exam_attempts
    WHERE exam_id = v_exam_id AND status != 'pending'
  ) THEN
    RAISE EXCEPTION 'Cannot modify questions after any attempt has started (FR-004a)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_question_immutability_update
  BEFORE UPDATE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_question_immutability();

CREATE TRIGGER trg_enforce_question_immutability_delete
  BEFORE DELETE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_question_immutability();

-- Also block INSERT of new questions to an exam with started attempts
CREATE TRIGGER trg_enforce_question_immutability_insert
  BEFORE INSERT ON questions
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_question_immutability();

-- =============================================================================
-- 4. FR-005a: Group-ownership cross-check on exam_permissions
--    data-model.md: "Constraint (FR-005a)"
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_enforce_group_ownership_on_permission()
RETURNS TRIGGER AS $$
DECLARE
  v_exam_admin_id uuid;
  v_group_admin_id uuid;
BEGIN
  -- Only applies when group_id is set
  IF NEW.group_id IS NOT NULL THEN
    SELECT admin_id INTO v_exam_admin_id FROM exams WHERE id = NEW.exam_id;
    SELECT admin_id INTO v_group_admin_id FROM groups WHERE id = NEW.group_id;

    IF v_exam_admin_id IS DISTINCT FROM v_group_admin_id THEN
      RAISE EXCEPTION 'Group does not belong to the same admin as the exam (FR-005a)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_group_ownership_on_permission
  BEFORE INSERT OR UPDATE ON exam_permissions
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_group_ownership_on_permission();

-- =============================================================================
-- 5. FR-020a / FR-004b: Pending-attempt creation
-- =============================================================================

-- 5a. AFTER INSERT trigger on exam_permissions: create pending attempt for
--     late additions if the exam has already started (FR-004b).
CREATE OR REPLACE FUNCTION fn_create_pending_attempt_on_permission()
RETURNS TRIGGER AS $$
DECLARE
  v_exam_record RECORD;
  v_student_ids uuid[];
BEGIN
  SELECT start_time, duration_minutes, is_published
    INTO v_exam_record
    FROM public.exams WHERE id = NEW.exam_id;

  -- Only act if exam is published and has already started but hasn't ended
  IF v_exam_record.is_published = true
     AND now() >= v_exam_record.start_time
     AND now() < v_exam_record.start_time + (v_exam_record.duration_minutes * interval '1 minute')
  THEN
    -- Resolve which students are affected
    IF NEW.student_id IS NOT NULL THEN
      v_student_ids := ARRAY[NEW.student_id];
    ELSIF NEW.group_id IS NOT NULL THEN
      SELECT array_agg(gs.student_id) INTO v_student_ids
        FROM public.group_students gs WHERE gs.group_id = NEW.group_id;
    END IF;

    -- Create pending attempts for students who don't already have one
    IF v_student_ids IS NOT NULL THEN
      INSERT INTO public.exam_attempts (exam_id, student_id, access_token, status)
      SELECT NEW.exam_id, s_id, gen_random_uuid()::text, 'pending'::attempt_status
        FROM unnest(v_student_ids) AS s_id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.exam_attempts ea
          WHERE ea.exam_id = NEW.exam_id AND ea.student_id = s_id
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_create_pending_attempt_on_permission
  AFTER INSERT ON exam_permissions
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_pending_attempt_on_permission();

-- 5b. AFTER INSERT trigger on group_students: create pending attempt for
--     late additions to a group if the exam has already started (FR-004b).
CREATE OR REPLACE FUNCTION fn_create_pending_attempt_on_group_student()
RETURNS TRIGGER AS $$
BEGIN
  -- Find all published, started, not-yet-ended exams permitted for this group
  INSERT INTO public.exam_attempts (exam_id, student_id, access_token, status)
  SELECT e.id, NEW.student_id, gen_random_uuid()::text, 'pending'::attempt_status
  FROM public.exams e
  JOIN public.exam_permissions ep ON ep.exam_id = e.id
  WHERE ep.group_id = NEW.group_id
    AND e.is_published = true
    AND now() >= e.start_time
    AND now() < e.start_time + (e.duration_minutes * interval '1 minute')
    AND NOT EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.exam_id = e.id AND ea.student_id = NEW.student_id
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_create_pending_attempt_on_group_student
  AFTER INSERT ON group_students
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_pending_attempt_on_group_student();

-- 5c. pg_cron job: bulk-create pending attempts at exam start_time.
--     Runs every minute. For each published exam whose start_time is now
--     (within the last minute), creates a pending attempt for every
--     permitted student who doesn't already have one.

CREATE OR REPLACE FUNCTION fn_create_pending_attempts_at_start()
RETURNS void AS $$
BEGIN
  INSERT INTO public.exam_attempts (exam_id, student_id, access_token, status)
  SELECT DISTINCT e.id, permitted.student_id, gen_random_uuid()::text, 'pending'::attempt_status
  FROM public.exams e
  CROSS JOIN LATERAL (
    -- All students permitted for this exam (direct + group membership)
    SELECT ep.student_id
      FROM public.exam_permissions ep
      WHERE ep.exam_id = e.id AND ep.student_id IS NOT NULL
    UNION
    SELECT gs.student_id
      FROM public.exam_permissions ep
      JOIN public.group_students gs ON gs.group_id = ep.group_id
      WHERE ep.exam_id = e.id AND ep.group_id IS NOT NULL
  ) AS permitted
  WHERE e.is_published = true
    -- Exam started within the last 2 minutes (covers cron jitter)
    AND e.start_time <= now()
    AND e.start_time > now() - interval '2 minutes'
    -- Student doesn't already have an attempt
    AND NOT EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.exam_id = e.id AND ea.student_id = permitted.student_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Schedule: every minute
SELECT cron.schedule(
  'create-pending-attempts',
  '* * * * *',
  $$SELECT fn_create_pending_attempts_at_start();$$
);

-- =============================================================================
-- 6. FR-018 & FR-020b: Expired-attempt sweep
--    data-model.md: "Expired-Attempt Sweep"
--    Single job, two clauses in one pass.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_sweep_expired_attempts()
RETURNS void AS $$
BEGIN
  -- Clause 1: in_progress → auto_submitted (FR-018)
  UPDATE public.exam_attempts ea
  SET status      = 'auto_submitted'::attempt_status,
      finished_at = now()
  FROM public.exams e
  WHERE ea.exam_id = e.id
    AND ea.status = 'in_progress'
    AND now() >= e.start_time + (e.duration_minutes * interval '1 minute');

  -- Clause 2: pending → abandoned (FR-020b)
  UPDATE public.exam_attempts ea
  SET status = 'abandoned'::attempt_status
  FROM public.exams e
  WHERE ea.exam_id = e.id
    AND ea.status = 'pending'
    AND now() >= e.start_time + (e.duration_minutes * interval '1 minute');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Schedule: every minute
SELECT cron.schedule(
  'sweep-expired-attempts',
  '* * * * *',
  $$SELECT fn_sweep_expired_attempts();$$
);

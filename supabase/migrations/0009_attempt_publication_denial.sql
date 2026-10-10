CREATE OR REPLACE FUNCTION public.fn_start_attempt(p_attempt_id uuid, p_student_id uuid, p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_attempt public.exam_attempts%ROWTYPE; v_start timestamptz; v_duration integer; v_published boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_student_id AND role='student'::user_role) THEN
    RETURN jsonb_build_object('denial_reason','owner_mismatch');
  END IF;
  SELECT * INTO v_attempt FROM public.exam_attempts ea
    WHERE ea.id = p_attempt_id AND ea.student_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('denial_reason','owner_mismatch'); END IF;
  SELECT e.start_time,e.duration_minutes,e.is_published INTO v_start,v_duration,v_published
    FROM public.exams e WHERE e.id=v_attempt.exam_id;
  IF v_attempt.status NOT IN ('pending'::attempt_status, 'in_progress'::attempt_status) THEN
    RETURN jsonb_build_object('denial_reason','status_not_startable');
  END IF;
  IF NOT v_published THEN RETURN jsonb_build_object('denial_reason','exam_not_published'); END IF;
  IF now() < v_start OR now() >= v_start + v_duration * interval '1 minute' THEN
    RETURN jsonb_build_object('denial_reason','outside_exam_window');
  END IF;
  UPDATE public.exam_attempts SET session_id = p_session_id, status = 'in_progress'::attempt_status,
    started_at = COALESCE(started_at, now()) WHERE id = p_attempt_id;
  RETURN jsonb_build_object('attempt_id',p_attempt_id,'session_id',p_session_id,
    'was_takeover',v_attempt.session_id IS NOT NULL,
    'remaining_seconds',GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (v_start + v_duration * interval '1 minute' - now())))::integer),
    'exam_ends_at',v_start + v_duration * interval '1 minute');
END; $$;

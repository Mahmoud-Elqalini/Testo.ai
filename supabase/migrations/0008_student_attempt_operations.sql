-- Atomic, service-role-only operations used by the student exam Edge Functions.
-- Keeping validation and updates in one database transaction prevents a stale
-- session from saving answers after another device has taken over.

CREATE OR REPLACE FUNCTION public.fn_start_attempt(p_attempt_id uuid, p_student_id uuid, p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
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
  IF NOT v_published OR now() < v_start OR now() >= v_start + v_duration * interval '1 minute' THEN
    RETURN jsonb_build_object('denial_reason','outside_exam_window');
  END IF;
  UPDATE public.exam_attempts SET session_id = p_session_id, status = 'in_progress'::attempt_status,
    started_at = COALESCE(started_at, now()) WHERE id = p_attempt_id;
  RETURN jsonb_build_object('attempt_id',p_attempt_id,'session_id',p_session_id,
    'was_takeover',v_attempt.session_id IS NOT NULL,
    'remaining_seconds',GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (v_start + v_duration * interval '1 minute' - now())))::integer),
    'exam_ends_at',v_start + v_duration * interval '1 minute');
END; $$;

CREATE OR REPLACE FUNCTION public.fn_get_exam_questions(p_attempt_id uuid, p_student_id uuid, p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_attempt public.exam_attempts%ROWTYPE; v_start timestamptz; v_duration integer; v_questions jsonb; v_answers jsonb;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts ea WHERE ea.id = p_attempt_id FOR SHARE;
  IF NOT FOUND OR v_attempt.student_id <> p_student_id THEN RETURN jsonb_build_object('denial_reason','owner_mismatch'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_student_id AND role='student'::user_role) THEN RETURN jsonb_build_object('denial_reason','owner_mismatch'); END IF;
  SELECT e.start_time,e.duration_minutes INTO v_start,v_duration FROM public.exams e WHERE e.id=v_attempt.exam_id;
  IF v_attempt.session_id IS DISTINCT FROM p_session_id THEN RETURN jsonb_build_object('denial_reason','session_mismatch'); END IF;
  IF v_attempt.status <> 'in_progress'::attempt_status THEN RETURN jsonb_build_object('denial_reason','attempt_not_in_progress'); END IF;
  IF now() >= v_start + v_duration * interval '1 minute' THEN RETURN jsonb_build_object('denial_reason','outside_exam_window'); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'type',q.type,'text',q.text,'points',q.points,'order',q."order",
    'mcq_choices',CASE WHEN q.mcq_choices IS NULL THEN NULL ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c->>'id','text',c->>'text')) FROM jsonb_array_elements(q.mcq_choices) c),'[]'::jsonb) END)
    ORDER BY q."order"),'[]'::jsonb) INTO v_questions FROM public.questions q WHERE q.exam_id = v_attempt.exam_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('question_id',a.question_id,'mcq_answer',a.mcq_answer,'essay_answer',a.essay_answer)),'[]'::jsonb)
    INTO v_answers FROM public.answers a WHERE a.attempt_id=p_attempt_id;
  RETURN jsonb_build_object('attempt_id',p_attempt_id,'remaining_seconds',GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (v_start + v_duration * interval '1 minute' - now())))::integer),'questions',v_questions,'answers',v_answers);
END; $$;

CREATE OR REPLACE FUNCTION public.fn_save_attempt_answer(p_attempt_id uuid,p_student_id uuid,p_session_id uuid,p_question_id uuid,p_mcq_answer text,p_essay_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_attempt public.exam_attempts%ROWTYPE; v_start timestamptz; v_duration integer;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts ea WHERE ea.id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.student_id <> p_student_id THEN RETURN jsonb_build_object('denial_reason','owner_mismatch'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_student_id AND role='student'::user_role) THEN RETURN jsonb_build_object('denial_reason','owner_mismatch'); END IF;
  SELECT e.start_time,e.duration_minutes INTO v_start,v_duration FROM public.exams e WHERE e.id=v_attempt.exam_id;
  IF v_attempt.session_id IS DISTINCT FROM p_session_id THEN RETURN jsonb_build_object('denial_reason','session_mismatch'); END IF;
  IF v_attempt.status <> 'in_progress'::attempt_status THEN RETURN jsonb_build_object('denial_reason','attempt_not_in_progress'); END IF;
  IF now() >= v_start + v_duration * interval '1 minute' THEN RETURN jsonb_build_object('denial_reason','outside_exam_window'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.questions q WHERE q.id=p_question_id AND q.exam_id=v_attempt.exam_id AND (
      (q.type='mcq'::question_type AND p_essay_answer IS NULL AND (p_mcq_answer IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(q.mcq_choices) c WHERE c->>'id'=p_mcq_answer))) OR
      (q.type='essay'::question_type AND p_mcq_answer IS NULL)
    )
  ) THEN RETURN jsonb_build_object('validation_error','The answer does not match this exam question.'); END IF;
  INSERT INTO public.answers(attempt_id,question_id,mcq_answer,essay_answer) VALUES(p_attempt_id,p_question_id,p_mcq_answer,p_essay_answer)
    ON CONFLICT(attempt_id,question_id) DO UPDATE SET mcq_answer=EXCLUDED.mcq_answer,essay_answer=EXCLUDED.essay_answer;
  RETURN jsonb_build_object('saved',true,'question_id',p_question_id,'saved_at',now());
END; $$;

CREATE OR REPLACE FUNCTION public.fn_submit_attempt(p_attempt_id uuid,p_student_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_attempt public.exam_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id=p_attempt_id AND student_id=p_student_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('denial_reason','owner_mismatch'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_student_id AND role='student'::user_role) THEN RETURN jsonb_build_object('denial_reason','owner_mismatch'); END IF;
  IF v_attempt.session_id IS DISTINCT FROM p_session_id THEN RETURN jsonb_build_object('denial_reason','session_mismatch'); END IF;
  IF v_attempt.status='submitted'::attempt_status THEN RETURN jsonb_build_object('attempt_id',p_attempt_id,'status','submitted','finished_at',v_attempt.finished_at,'already_submitted',true); END IF;
  IF v_attempt.status <> 'in_progress'::attempt_status THEN RETURN jsonb_build_object('denial_reason','attempt_not_in_progress'); END IF;
  UPDATE public.exam_attempts SET status='submitted'::attempt_status,finished_at=now() WHERE id=p_attempt_id RETURNING * INTO v_attempt;
  RETURN jsonb_build_object('attempt_id',p_attempt_id,'status','submitted','finished_at',v_attempt.finished_at,'already_submitted',false);
END; $$;

REVOKE ALL ON FUNCTION public.fn_start_attempt(uuid,uuid,uuid), public.fn_get_exam_questions(uuid,uuid,uuid), public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text), public.fn_submit_attempt(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_start_attempt(uuid,uuid,uuid), public.fn_get_exam_questions(uuid,uuid,uuid), public.fn_save_attempt_answer(uuid,uuid,uuid,uuid,text,text), public.fn_submit_attempt(uuid,uuid,uuid) TO service_role;

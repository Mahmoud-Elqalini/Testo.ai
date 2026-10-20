-- Student results reveal grading criteria only after a closed attempt is fully graded.
CREATE OR REPLACE FUNCTION public.fn_get_student_attempt_result(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam_title text;
  v_question_count bigint;
  v_scored_question_count bigint;
  v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'student'::public.user_role
  ) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  SELECT ea
  INTO v_attempt
  FROM public.exam_attempts ea
  WHERE ea.id = p_attempt_id AND ea.student_id = auth.uid();

  IF NOT FOUND OR v_attempt.status NOT IN ('submitted'::public.attempt_status, 'auto_submitted'::public.attempt_status) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  SELECT e.title INTO v_exam_title FROM public.exams e WHERE e.id = v_attempt.exam_id;

  SELECT count(*), count(*) FILTER (WHERE a.score IS NOT NULL)
  INTO v_question_count, v_scored_question_count
  FROM public.questions q
  LEFT JOIN public.answers a ON a.question_id = q.id AND a.attempt_id = v_attempt.id
  WHERE q.exam_id = v_attempt.exam_id;

  IF v_question_count = 0 OR v_scored_question_count <> v_question_count THEN
    RETURN jsonb_build_object(
      'status', 'pending',
      'attempt_id', v_attempt.id,
      'attempt_status', v_attempt.status,
      'exam_title', v_exam_title,
      'finished_at', v_attempt.finished_at
    );
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', q.id,
    'type', q.type,
    'text', q.text,
    'order', q."order",
    'points', q.points,
    'normalized_score', a.score,
    'selected_choice', a.mcq_answer,
    'correct_choice', CASE WHEN q.type = 'mcq'::public.question_type THEN q.correct_choice ELSE NULL END,
    'choices', CASE WHEN q.type = 'mcq'::public.question_type THEN
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', choice.c->>'id', 'text', choice.c->>'text') ORDER BY choice.ordinality)
        FROM jsonb_array_elements(COALESCE(q.mcq_choices, '[]'::jsonb)) WITH ORDINALITY AS choice(c, ordinality)), '[]'::jsonb)
      ELSE '[]'::jsonb END
  ) ORDER BY q."order")
  INTO v_questions
  FROM public.questions q
  JOIN public.answers a ON a.question_id = q.id AND a.attempt_id = v_attempt.id
  WHERE q.exam_id = v_attempt.exam_id AND a.score IS NOT NULL;

  RETURN jsonb_build_object(
    'status', 'graded',
    'attempt_id', v_attempt.id,
    'attempt_status', v_attempt.status,
    'exam_title', v_exam_title,
    'finished_at', v_attempt.finished_at,
    'questions', COALESCE(v_questions, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_student_attempt_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_student_attempt_result(uuid) TO authenticated;

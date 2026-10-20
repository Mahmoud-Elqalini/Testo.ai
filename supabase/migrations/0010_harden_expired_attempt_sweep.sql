-- Keep the expiry transition callable by trusted server code and pg_cron only.
-- The job created in 0003 already calls this public function; avoid direct writes
-- to cron.job, which Supabase intentionally protects with permissions and RLS.
CREATE OR REPLACE FUNCTION public.fn_sweep_expired_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.exam_attempts AS ea
  SET status = 'auto_submitted'::public.attempt_status,
      finished_at = now()
  FROM public.exams AS e
  WHERE ea.exam_id = e.id
    AND ea.status = 'in_progress'::public.attempt_status
    AND now() >= e.start_time + (e.duration_minutes * interval '1 minute');

  UPDATE public.exam_attempts AS ea
  SET status = 'abandoned'::public.attempt_status
  FROM public.exams AS e
  WHERE ea.exam_id = e.id
    AND ea.status = 'pending'::public.attempt_status
    AND now() >= e.start_time + (e.duration_minutes * interval '1 minute');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sweep_expired_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sweep_expired_attempts() TO service_role;

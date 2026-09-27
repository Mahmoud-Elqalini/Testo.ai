-- Allow an authenticated Admin to resolve one student by exact email without
-- granting broad SELECT access to profiles or auth.users.
CREATE OR REPLACE FUNCTION public.search_student_by_email(search_email text)
RETURNS TABLE (id uuid, email text, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, u.email::text, p.full_name
  FROM auth.users AS u
  JOIN public.profiles AS p ON p.id = u.id
  WHERE (SELECT private.is_admin())
    AND p.role = 'student'::public.user_role
    AND lower(u.email) = lower(btrim(search_email))
    AND char_length(btrim(search_email)) BETWEEN 6 AND 254
    AND btrim(search_email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;

REVOKE ALL ON FUNCTION public.search_student_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_student_by_email(text) TO authenticated;

COMMENT ON FUNCTION public.search_student_by_email(text) IS
  'Returns at most one student matching an exact email for authenticated Admins; does not expose profile or auth tables for general search.';

CREATE OR REPLACE FUNCTION public.list_group_students(target_group_id uuid)
RETURNS TABLE (id uuid, email text, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, u.email::text, p.full_name
  FROM public.group_students AS gs
  JOIN public.profiles AS p ON p.id = gs.student_id
  JOIN auth.users AS u ON u.id = p.id
  WHERE gs.group_id = target_group_id
    AND (SELECT private.is_admin())
    AND (SELECT private.owns_group(target_group_id))
    AND p.role = 'student'::public.user_role
  ORDER BY lower(p.full_name), lower(u.email);
$$;

REVOKE ALL ON FUNCTION public.list_group_students(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_group_students(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_exam_permissions(target_exam_id uuid)
RETURNS TABLE (
  id uuid, exam_id uuid, group_id uuid, student_id uuid,
  student_email text, student_name text, group_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ep.id, ep.exam_id, ep.group_id, ep.student_id,
         u.email::text, p.full_name, g.name
  FROM public.exam_permissions AS ep
  LEFT JOIN auth.users AS u ON u.id = ep.student_id
  LEFT JOIN public.profiles AS p ON p.id = ep.student_id
  LEFT JOIN public.groups AS g ON g.id = ep.group_id
  WHERE ep.exam_id = target_exam_id
    AND (SELECT private.is_admin())
    AND (SELECT private.owns_exam(target_exam_id))
  ORDER BY COALESCE(g.name, p.full_name, u.email);
$$;

REVOKE ALL ON FUNCTION public.list_exam_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_exam_permissions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_require_student_group_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = NEW.student_id AND p.role = 'student'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Only student accounts can be added to groups.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_require_student_exam_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = NEW.student_id AND p.role = 'student'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Exam access can only be granted to student accounts.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_student_group_member ON public.group_students;
CREATE TRIGGER trg_require_student_group_member
  BEFORE INSERT OR UPDATE ON public.group_students
  FOR EACH ROW EXECUTE FUNCTION public.fn_require_student_group_member();

DROP TRIGGER IF EXISTS trg_require_student_exam_permission ON public.exam_permissions;
CREATE TRIGGER trg_require_student_exam_permission
  BEFORE INSERT OR UPDATE ON public.exam_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_require_student_exam_permission();

-- Keep FR-004b true even for direct PostgREST mutations: removing a permission
-- or group membership must not interrupt an attempt already in progress.
CREATE OR REPLACE FUNCTION public.fn_preserve_in_progress_group_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.group_id IS NOT DISTINCT FROM NEW.group_id
    AND OLD.student_id IS NOT DISTINCT FROM NEW.student_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exam_permissions AS ep
    JOIN public.exam_attempts AS ea ON ea.exam_id = ep.exam_id
    WHERE ep.group_id = OLD.group_id
      AND ea.student_id = OLD.student_id
      AND ea.status = 'in_progress'::public.attempt_status
  ) THEN
    RAISE EXCEPTION 'Cannot remove a student from a group while their exam attempt is in progress.'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_preserve_in_progress_exam_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.exam_id IS NOT DISTINCT FROM NEW.exam_id
    AND OLD.group_id IS NOT DISTINCT FROM NEW.group_id
    AND OLD.student_id IS NOT DISTINCT FROM NEW.student_id THEN
    RETURN NEW;
  END IF;

  IF OLD.student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.exam_attempts AS ea
    WHERE ea.exam_id = OLD.exam_id
      AND ea.student_id = OLD.student_id
      AND ea.status = 'in_progress'::public.attempt_status
  ) THEN
    RAISE EXCEPTION 'Cannot remove access while the student exam attempt is in progress.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.group_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.group_students AS gs
    JOIN public.exam_attempts AS ea ON ea.student_id = gs.student_id
    WHERE gs.group_id = OLD.group_id
      AND ea.exam_id = OLD.exam_id
      AND ea.status = 'in_progress'::public.attempt_status
  ) THEN
    RAISE EXCEPTION 'Cannot remove group access while a member exam attempt is in progress.'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_in_progress_group_access ON public.group_students;
CREATE TRIGGER trg_preserve_in_progress_group_access
  BEFORE DELETE OR UPDATE ON public.group_students
  FOR EACH ROW EXECUTE FUNCTION public.fn_preserve_in_progress_group_access();

DROP TRIGGER IF EXISTS trg_preserve_in_progress_exam_permission ON public.exam_permissions;
CREATE TRIGGER trg_preserve_in_progress_exam_permission
  BEFORE DELETE OR UPDATE ON public.exam_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_preserve_in_progress_exam_permission();

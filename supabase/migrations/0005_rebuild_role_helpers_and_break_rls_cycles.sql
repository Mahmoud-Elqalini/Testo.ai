-- Reproducible role mirror and non-recursive RLS authorization helpers.
--
-- The role mirror is intentionally not readable by API roles. RLS remains
-- disabled because all reads are performed only by SECURITY DEFINER helpers.

-- 1. Recreate the currently live role mirror from committed schema.
CREATE TABLE IF NOT EXISTS public.private_user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'student'::public.user_role
);

ALTER TABLE public.private_user_roles DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_sync_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.private_user_roles (user_id, role)
  VALUES (NEW.id, NEW.role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_role ON public.profiles;
CREATE TRIGGER trg_sync_user_role
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_user_role();

-- Backfill existing profiles when adopting a database that previously drifted.
INSERT INTO public.private_user_roles (user_id, role)
SELECT id, role
FROM public.profiles
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- 2. Explicit remediation for the live authenticated SELECT grant.
-- The mirror must only be read through the narrowly scoped helpers below.
REVOKE ALL PRIVILEGES ON TABLE public.private_user_roles FROM PUBLIC, anon, authenticated;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.private_user_roles AS pur
    WHERE pur.user_id = (SELECT auth.uid())
      AND pur.role = 'admin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION private.is_student()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.private_user_roles AS pur
    WHERE pur.user_id = (SELECT auth.uid())
      AND pur.role = 'student'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION private.owns_group(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups AS g
    WHERE g.id = target_group_id
      AND g.admin_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.owns_exam(target_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams AS e
    WHERE e.id = target_exam_id
      AND e.admin_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.is_admin_scoped_student(target_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_students AS gs
    JOIN public.groups AS g ON g.id = gs.group_id
    WHERE gs.student_id = target_student_id
      AND g.admin_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.exam_attempts AS ea
    JOIN public.exams AS e ON e.id = ea.exam_id
    WHERE ea.student_id = target_student_id
      AND e.admin_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_exam(target_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams AS e
    JOIN public.exam_permissions AS ep ON ep.exam_id = e.id
    WHERE e.id = target_exam_id
      AND e.is_published = true
      AND (
        ep.student_id = (SELECT auth.uid())
        OR ep.group_id IN (
          SELECT gs.group_id
          FROM public.group_students AS gs
          WHERE gs.student_id = (SELECT auth.uid())
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_exam_permission(
  target_exam_id uuid,
  target_student_id uuid,
  target_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams AS e
    WHERE e.id = target_exam_id
      AND e.is_published = true
      AND (
        target_student_id = (SELECT auth.uid())
        OR target_group_id IN (
          SELECT gs.group_id
          FROM public.group_students AS gs
          WHERE gs.student_id = (SELECT auth.uid())
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.owns_attempt(target_attempt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_attempts AS ea
    WHERE ea.id = target_attempt_id
      AND ea.student_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.owns_exam_attempt(target_attempt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_attempts AS ea
    JOIN public.exams AS e ON e.id = ea.exam_id
    WHERE ea.id = target_attempt_id
      AND e.admin_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_student() TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_scoped_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_exam_permission(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_exam_attempt(uuid) TO authenticated;

-- 3. Replace every policy that can traverse the RLS graph with helpers that
-- execute as the function owner and therefore do not re-enter those policies.
DROP POLICY IF EXISTS profiles_admin_read_scoped_students ON public.profiles;
CREATE POLICY profiles_admin_read_scoped_students ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT private.is_admin())
    AND (SELECT private.is_admin_scoped_student(id))
  );

DROP POLICY IF EXISTS groups_admin_select ON public.groups;
DROP POLICY IF EXISTS groups_admin_insert ON public.groups;
DROP POLICY IF EXISTS groups_admin_update ON public.groups;
DROP POLICY IF EXISTS groups_admin_delete ON public.groups;
CREATE POLICY groups_admin_select ON public.groups
  FOR SELECT TO authenticated
  USING (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));
CREATE POLICY groups_admin_insert ON public.groups
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));
CREATE POLICY groups_admin_update ON public.groups
  FOR UPDATE TO authenticated
  USING (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()))
  WITH CHECK (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));
CREATE POLICY groups_admin_delete ON public.groups
  FOR DELETE TO authenticated
  USING (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));

DROP POLICY IF EXISTS group_students_admin_select ON public.group_students;
DROP POLICY IF EXISTS group_students_admin_insert ON public.group_students;
DROP POLICY IF EXISTS group_students_admin_update ON public.group_students;
DROP POLICY IF EXISTS group_students_admin_delete ON public.group_students;
CREATE POLICY group_students_admin_select ON public.group_students
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_group(group_id)));
CREATE POLICY group_students_admin_insert ON public.group_students
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()) AND (SELECT private.owns_group(group_id)));
CREATE POLICY group_students_admin_update ON public.group_students
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_group(group_id)))
  WITH CHECK ((SELECT private.is_admin()) AND (SELECT private.owns_group(group_id)));
CREATE POLICY group_students_admin_delete ON public.group_students
  FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_group(group_id)));

DROP POLICY IF EXISTS exams_admin_select ON public.exams;
DROP POLICY IF EXISTS exams_admin_insert ON public.exams;
DROP POLICY IF EXISTS exams_admin_update ON public.exams;
DROP POLICY IF EXISTS exams_admin_delete ON public.exams;
DROP POLICY IF EXISTS exams_student_select ON public.exams;
CREATE POLICY exams_admin_select ON public.exams
  FOR SELECT TO authenticated
  USING (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));
CREATE POLICY exams_admin_insert ON public.exams
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));
CREATE POLICY exams_admin_update ON public.exams
  FOR UPDATE TO authenticated
  USING (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()))
  WITH CHECK (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));
CREATE POLICY exams_admin_delete ON public.exams
  FOR DELETE TO authenticated
  USING (admin_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));
CREATE POLICY exams_student_select ON public.exams
  FOR SELECT TO authenticated
  USING ((SELECT private.is_student()) AND (SELECT private.can_access_exam(id)));

DROP POLICY IF EXISTS exam_permissions_admin_select ON public.exam_permissions;
DROP POLICY IF EXISTS exam_permissions_admin_insert ON public.exam_permissions;
DROP POLICY IF EXISTS exam_permissions_admin_update ON public.exam_permissions;
DROP POLICY IF EXISTS exam_permissions_admin_delete ON public.exam_permissions;
DROP POLICY IF EXISTS exam_permissions_student_select ON public.exam_permissions;
CREATE POLICY exam_permissions_admin_select ON public.exam_permissions
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));
CREATE POLICY exam_permissions_admin_insert ON public.exam_permissions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));
CREATE POLICY exam_permissions_admin_update ON public.exam_permissions
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)))
  WITH CHECK ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));
CREATE POLICY exam_permissions_admin_delete ON public.exam_permissions
  FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));
CREATE POLICY exam_permissions_student_select ON public.exam_permissions
  FOR SELECT TO authenticated
  USING (
    (SELECT private.is_student())
    AND (SELECT private.can_access_exam_permission(exam_id, student_id, group_id))
  );

DROP POLICY IF EXISTS questions_admin_select ON public.questions;
DROP POLICY IF EXISTS questions_admin_insert ON public.questions;
DROP POLICY IF EXISTS questions_admin_update ON public.questions;
DROP POLICY IF EXISTS questions_admin_delete ON public.questions;
CREATE POLICY questions_admin_select ON public.questions
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));
CREATE POLICY questions_admin_insert ON public.questions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));
CREATE POLICY questions_admin_update ON public.questions
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)))
  WITH CHECK ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));
CREATE POLICY questions_admin_delete ON public.questions
  FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));

DROP POLICY IF EXISTS exam_attempts_student_select ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_admin_select ON public.exam_attempts;
CREATE POLICY exam_attempts_student_select ON public.exam_attempts
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) AND (SELECT private.is_student()));
CREATE POLICY exam_attempts_admin_select ON public.exam_attempts
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_exam(exam_id)));

DROP POLICY IF EXISTS answers_student_select ON public.answers;
DROP POLICY IF EXISTS answers_admin_select ON public.answers;
CREATE POLICY answers_student_select ON public.answers
  FOR SELECT TO authenticated
  USING ((SELECT private.is_student()) AND (SELECT private.owns_attempt(attempt_id)));
CREATE POLICY answers_admin_select ON public.answers
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()) AND (SELECT private.owns_exam_attempt(attempt_id)));

-- 4. This helper is not used by application code and all policy references
-- have been replaced above.
DROP FUNCTION IF EXISTS public.get_my_role();

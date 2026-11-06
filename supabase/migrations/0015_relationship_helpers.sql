-- Additive authorization helpers for the unified-identity cutover.
-- These helpers are intentionally not wired into policies or RPCs in this migration.

CREATE OR REPLACE FUNCTION private.owns_group_by_owner(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.groups AS g
       WHERE g.id = p_group_id
         AND g.owner_id = auth.uid()
     );
$$;

CREATE OR REPLACE FUNCTION private.owns_exam_by_owner(p_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.exams AS e
       WHERE e.id = p_exam_id
         AND e.owner_id = auth.uid()
     );
$$;

CREATE OR REPLACE FUNCTION private.is_current_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.group_students AS gs
       WHERE gs.group_id = p_group_id
         AND gs.student_id = auth.uid()
     );
$$;

CREATE OR REPLACE FUNCTION private.can_access_exam_via_group(p_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.exam_permissions AS ep
       JOIN public.groups AS g
         ON g.id = ep.group_id
       JOIN public.group_students AS gs
         ON gs.group_id = g.id
       JOIN public.exams AS e
         ON e.id = ep.exam_id
        AND e.owner_id = g.owner_id
       WHERE ep.exam_id = p_exam_id
         AND gs.student_id = auth.uid()
     );
$$;

REVOKE ALL ON FUNCTION private.owns_group_by_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.owns_group_by_owner(uuid) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_group_by_owner(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.owns_exam_by_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.owns_exam_by_owner(uuid) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_exam_by_owner(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.is_current_group_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_current_group_member(uuid) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_current_group_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.can_access_exam_via_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_exam_via_group(uuid) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_exam_via_group(uuid) TO authenticated;

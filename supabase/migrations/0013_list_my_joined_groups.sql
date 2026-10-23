-- Return only the current authenticated user's group memberships.
-- Group names are not selectable by students under the existing groups RLS policy,
-- so this narrowly scoped RPC exposes only rows linked to auth.uid().
CREATE OR REPLACE FUNCTION public.list_my_joined_groups()
RETURNS TABLE (group_id uuid, group_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id, g.name
  FROM public.group_students AS gs
  JOIN public.groups AS g ON g.id = gs.group_id
  WHERE gs.student_id = (SELECT auth.uid())
  ORDER BY g.name;
$$;

REVOKE ALL ON FUNCTION public.list_my_joined_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_joined_groups() TO authenticated;

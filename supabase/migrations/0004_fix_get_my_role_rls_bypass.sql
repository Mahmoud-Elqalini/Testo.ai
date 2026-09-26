-- Fix infinite recursion in profiles RLS policy.
-- get_my_role() is called inside the profiles_admin_read_scoped_students policy
-- on the profiles table itself. Without an explicit role override, Supabase still
-- evaluates RLS on the SELECT inside the function, causing infinite recursion
-- (error 42P17). Adding SET role = 'supabase_admin' lets the function bypass RLS
-- for its single-row lookup while auth.uid() still scopes the result securely.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET role = 'postgres'
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

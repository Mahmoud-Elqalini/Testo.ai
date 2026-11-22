-- Restrict profile updates and preserve role protection under SECURITY DEFINER.
REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, role, full_name, preferred_language, preferred_theme)
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

GRANT UPDATE (full_name, preferred_language, preferred_theme)
  ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     AND pg_catalog.current_setting('role', true) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Changing profiles.role is forbidden for API callers'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DO $assert_profile_update_privileges$
DECLARE
  v_column text;
BEGIN
  FOREACH v_column IN ARRAY ARRAY['id', 'role'] LOOP
    IF pg_catalog.has_column_privilege('authenticated', 'public.profiles', v_column, 'UPDATE')
       OR pg_catalog.has_column_privilege('anon', 'public.profiles', v_column, 'UPDATE') THEN
      RAISE EXCEPTION 'Profile column % remains updatable by an API role', v_column;
    END IF;
  END LOOP;

  FOREACH v_column IN ARRAY ARRAY['full_name', 'preferred_language', 'preferred_theme'] LOOP
    IF NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles', v_column, 'UPDATE')
       OR pg_catalog.has_column_privilege('anon', 'public.profiles', v_column, 'UPDATE') THEN
      RAISE EXCEPTION 'Profile safe-column UPDATE grants are incorrect for %', v_column;
    END IF;
  END LOOP;
END;
$assert_profile_update_privileges$;

-- Remove fixed application roles after the 0021 owner_id security matrix passes.
-- Keep the existing signup behavior with a roleless profile provisioning trigger.
BEGIN;

-- Retire all consumers of role data before removing the type and columns.
DROP TRIGGER IF EXISTS trg_sync_user_role ON public.profiles;
DROP FUNCTION IF EXISTS public.fn_sync_user_role();

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
DROP FUNCTION IF EXISTS public.fn_protect_profile_role();

-- Replace the role-bearing signup function while preserving automatic profile
-- creation and the language/theme metadata captured by the registration flow.
DROP TRIGGER IF EXISTS trg_create_profile_on_signup ON auth.users;
DROP FUNCTION IF EXISTS public.fn_create_profile_on_signup();

CREATE FUNCTION public.fn_create_profile_without_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, preferred_language, preferred_theme)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'en'),
    COALESCE(NEW.raw_user_meta_data->>'preferred_theme', 'light')
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_create_profile_without_role() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_create_profile_without_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_create_profile_without_role();

DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS private.is_admin_scoped_student(uuid);
DROP FUNCTION IF EXISTS private.is_admin();
DROP FUNCTION IF EXISTS private.is_student();

DROP TABLE IF EXISTS public.private_user_roles;
ALTER TABLE public.profiles DROP COLUMN role;
DROP TYPE public.user_role;

-- Keep 0020's safe profile-update contract after role-column removal.
REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, full_name, preferred_language, preferred_theme)
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name, preferred_language, preferred_theme)
  ON TABLE public.profiles TO authenticated;

DO $assert_roles_removed_and_profile_updates_preserved$
DECLARE
  v_column text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='role'
  ) OR to_regclass('public.private_user_roles') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='user_role'
  ) THEN
    RAISE EXCEPTION 'Fixed application role state remains after 0022';
  END IF;

  IF to_regprocedure('public.get_my_role()') IS NOT NULL
     OR to_regprocedure('public.fn_sync_user_role()') IS NOT NULL
     OR to_regprocedure('public.fn_protect_profile_role()') IS NOT NULL
     OR to_regprocedure('public.fn_create_profile_on_signup()') IS NOT NULL
     OR to_regprocedure('private.is_admin()') IS NOT NULL
     OR to_regprocedure('private.is_student()') IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy fixed-role helper remains callable after 0022';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal
      AND tgname='trg_create_profile_without_role'
  ) THEN
    RAISE EXCEPTION 'Roleless profile signup trigger is missing';
  END IF;

  FOREACH v_column IN ARRAY ARRAY['full_name','preferred_language','preferred_theme'] LOOP
    IF NOT has_column_privilege('authenticated','public.profiles',v_column,'UPDATE')
       OR has_column_privilege('anon','public.profiles',v_column,'UPDATE') THEN
      RAISE EXCEPTION 'Profile safe-column UPDATE grants are incorrect for %', v_column;
    END IF;
  END LOOP;

  IF has_column_privilege('authenticated','public.profiles','id','UPDATE')
     OR has_column_privilege('anon','public.profiles','id','UPDATE') THEN
    RAISE EXCEPTION 'Profile identity remains updatable by an API role';
  END IF;
END;
$assert_roles_removed_and_profile_updates_preserved$;

COMMIT;
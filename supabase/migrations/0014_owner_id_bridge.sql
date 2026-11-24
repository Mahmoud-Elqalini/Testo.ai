-- Add a role-neutral owner field while preserving the current authorization
-- model. The legacy admin_id remains the field read by 0001-0013 RLS until
-- the atomic authorization cutover in 0017.

ALTER TABLE public.groups
  ADD COLUMN owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.groups
SET owner_id = admin_id;

ALTER TABLE public.groups
  ALTER COLUMN owner_id SET NOT NULL,
  ADD CONSTRAINT groups_owner_admin_match_check CHECK (owner_id = admin_id);

CREATE INDEX groups_owner_id_idx ON public.groups(owner_id);

ALTER TABLE public.exams
  ADD COLUMN owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.exams
SET owner_id = admin_id;

ALTER TABLE public.exams
  ALTER COLUMN owner_id SET NOT NULL,
  ADD CONSTRAINT exams_owner_admin_match_check CHECK (owner_id = admin_id);

CREATE INDEX exams_owner_id_idx ON public.exams(owner_id);

CREATE OR REPLACE FUNCTION public.fn_sync_owner_mirror_0014()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.admin_id IS NULL AND NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'An owner is required.' USING ERRCODE = '23514';
    ELSIF NEW.admin_id IS NULL THEN
      NEW.admin_id := NEW.owner_id;
    ELSIF NEW.owner_id IS NULL THEN
      NEW.owner_id := NEW.admin_id;
    ELSIF NEW.admin_id IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'admin_id and owner_id must identify the same owner.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.admin_id IS DISTINCT FROM OLD.admin_id
       AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      IF NEW.admin_id IS DISTINCT FROM NEW.owner_id THEN
        RAISE EXCEPTION 'admin_id and owner_id must identify the same owner.' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.admin_id IS DISTINCT FROM OLD.admin_id THEN
      NEW.owner_id := NEW.admin_id;
    ELSIF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      NEW.admin_id := NEW.owner_id;
    ELSIF NEW.admin_id IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'admin_id and owner_id must identify the same owner.' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sync_owner_mirror_0014() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_groups_sync_owner_mirror_0014
  BEFORE INSERT OR UPDATE OF admin_id, owner_id ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_owner_mirror_0014();

CREATE TRIGGER trg_exams_sync_owner_mirror_0014
  BEFORE INSERT OR UPDATE OF admin_id, owner_id ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_owner_mirror_0014();

COMMENT ON COLUMN public.groups.owner_id IS
  'Canonical future owner field; kept equal to admin_id until migration 0018.';
COMMENT ON COLUMN public.exams.owner_id IS
  'Canonical future owner field; kept equal to admin_id until migration 0018.';

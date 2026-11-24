-- Drop the legacy owner mirror only after all active authorization paths use
-- owner_id. Local rollback is reset/replay through the migrations before 0021.
BEGIN;

-- 0017 replaced this legacy permission guard with the owner_id-based
-- fn_enforce_group_only_exam_permission trigger. Remove the stale admin_id
-- trigger/function so no active or callable source depends on the old column.
DROP TRIGGER IF EXISTS trg_enforce_group_ownership_on_permission ON public.exam_permissions;
DROP FUNCTION IF EXISTS public.fn_enforce_group_ownership_on_permission();

DROP TRIGGER IF EXISTS trg_groups_sync_owner_mirror_0014 ON public.groups;
DROP TRIGGER IF EXISTS trg_exams_sync_owner_mirror_0014 ON public.exams;
DROP FUNCTION IF EXISTS public.fn_sync_owner_mirror_0014();

ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_owner_admin_match_check,
  DROP COLUMN admin_id;

ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_owner_admin_match_check,
  DROP COLUMN admin_id;

COMMENT ON COLUMN public.groups.owner_id IS 'Canonical owner identity for this group.';
COMMENT ON COLUMN public.exams.owner_id IS 'Canonical owner identity for this exam.';

DO $assert_owner_id_only_model$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('groups', 'exams')
      AND column_name = 'admin_id'
  ) THEN
    RAISE EXCEPTION 'Legacy admin_id columns remain after 0021';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groups'
      AND column_name = 'owner_id' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams'
      AND column_name = 'owner_id' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Required owner_id columns are missing or nullable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE NOT tgisinternal
      AND tgrelid IN ('public.groups'::regclass, 'public.exams'::regclass)
      AND tgname IN ('trg_groups_sync_owner_mirror_0014', 'trg_exams_sync_owner_mirror_0014')
  ) THEN
    RAISE EXCEPTION 'Legacy owner mirror triggers remain after 0021';
  END IF;
END;
$assert_owner_id_only_model$;

COMMIT;

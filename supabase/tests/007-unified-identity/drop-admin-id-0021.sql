\set ON_ERROR_STOP on

-- Verify owner_id remains the complete authorization and write path before
-- and after dropping the legacy admin_id mirror. All fixture writes roll back.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);

DO $$
DECLARE
  v_group_id uuid := '121a0000-0000-4000-8000-000000000001';
  v_exam_id uuid := '122a0000-0000-4000-8000-000000000001';
  v_group_visible integer;
  v_exam_visible integer;
  v_legacy_group_owner uuid;
  v_legacy_exam_owner uuid;
  v_has_group_admin boolean;
  v_has_exam_admin boolean;
  v_trigger_count integer;
  v_pass boolean;
BEGIN
  INSERT INTO public.groups (id, name, owner_id)
  VALUES (v_group_id, '0021 owner_id-only group probe', auth.uid())
  RETURNING id INTO STRICT v_group_id;
  v_pass := v_group_id = '121a0000-0000-4000-8000-000000000001';
  RAISE NOTICE 'CASE_RESULT|drop_admin_id.groups.owner_id_insert_returning|%|owner can create a group using owner_id only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;

  INSERT INTO public.exams (id, title, description, start_time, duration_minutes, is_published, owner_id)
  VALUES (v_exam_id, '0021 owner_id-only exam probe', 'migration probe', now() + interval '1 hour', 30, false, auth.uid())
  RETURNING id INTO STRICT v_exam_id;
  v_pass := v_exam_id = '122a0000-0000-4000-8000-000000000001';
  RAISE NOTICE 'CASE_RESULT|drop_admin_id.exams.owner_id_insert_returning|%|owner can create an exam using owner_id only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'admin_id') INTO v_has_group_admin;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'admin_id') INTO v_has_exam_admin;
  IF v_has_group_admin AND v_has_exam_admin THEN
    EXECUTE 'SELECT admin_id FROM public.groups WHERE id = $1' INTO v_legacy_group_owner USING v_group_id;
    EXECUTE 'SELECT admin_id FROM public.exams WHERE id = $1' INTO v_legacy_exam_owner USING v_exam_id;
    v_pass := v_legacy_group_owner = auth.uid() AND v_legacy_exam_owner = auth.uid();
    RAISE NOTICE 'CASE_RESULT|drop_admin_id.owner_mirror_consistent|%|while the bridge exists owner_id-only writes preserve equal admin_id values', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;
  ELSIF NOT v_has_group_admin AND NOT v_has_exam_admin THEN
    SELECT count(*) INTO v_trigger_count FROM pg_catalog.pg_trigger
    WHERE tgrelid IN ('public.groups'::regclass, 'public.exams'::regclass)
      AND NOT tgisinternal AND tgname IN ('trg_groups_sync_owner_mirror_0014', 'trg_exams_sync_owner_mirror_0014');
    v_pass := v_trigger_count = 0;
    RAISE NOTICE 'CASE_RESULT|drop_admin_id.owner_mirror_removed|%|both admin_id columns and mirror triggers are absent after 0021', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;
  ELSE
    RAISE NOTICE 'CASE_RESULT|drop_admin_id.owner_column_state|FAIL|groups and exams must transition together';
  END IF;

  SELECT count(*) INTO v_group_visible FROM public.groups WHERE id = v_group_id;
  SELECT count(*) INTO v_exam_visible FROM public.exams WHERE id = v_exam_id;
  v_pass := v_group_visible = 1 AND v_exam_visible = 1;
  RAISE NOTICE 'CASE_RESULT|drop_admin_id.owner_select_allow|%|owner can read newly created group and exam via owner_id policies', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;

  SELECT count(*) INTO v_group_visible FROM public.groups WHERE id = 'b7000000-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_exam_visible FROM public.exams WHERE id = 'c7000000-0000-4000-8000-000000000002';
  v_pass := v_group_visible = 0 AND v_exam_visible = 0;
  RAISE NOTICE 'CASE_RESULT|drop_admin_id.cross_owner_select_deny|%|owner A cannot read owner B group or exam', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$
DECLARE
  v_group_visible integer;
  v_exam_visible integer;
BEGIN
  SELECT count(*) INTO v_group_visible FROM public.groups WHERE id = 'b7000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_exam_visible FROM public.exams WHERE id = 'c7000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'CASE_RESULT|drop_admin_id.anon_select_deny|%|anonymous callers cannot read owner group or exam rows', CASE WHEN v_group_visible = 0 AND v_exam_visible = 0 THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

ROLLBACK;

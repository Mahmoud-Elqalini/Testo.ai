\set ON_ERROR_STOP on

-- T009 failing-first owner mirror contract for 0014. Before the migration this
-- must fail because groups/exams do not yet contain owner_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='groups' AND column_name='owner_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='exams' AND column_name='owner_id'
  ) THEN
    RAISE EXCEPTION 'T009 expected failing-first result: migration 0014 owner_id columns are absent';
  END IF;
END;
$$;

BEGIN;
CREATE TEMP TABLE t009_owner_mirror_results (
  case_id text NOT NULL,
  status text NOT NULL,
  details text NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  owner_a uuid := 'a7000000-0000-4000-8000-000000000001';
  owner_b uuid := 'a7000000-0000-4000-8000-000000000002';
  unrelated uuid := 'a7000000-0000-4000-8000-000000000004';
  g_fill uuid := gen_random_uuid();
  g_fill_reverse uuid := gen_random_uuid();
  g_owner_update uuid := gen_random_uuid();
  g_admin_update uuid := gen_random_uuid();
  g_diverge uuid := gen_random_uuid();
  g_diverge_insert uuid := gen_random_uuid();
  e_fill uuid := gen_random_uuid();
  e_fill_reverse uuid := gen_random_uuid();
  e_owner_update uuid := gen_random_uuid();
  e_admin_update uuid := gen_random_uuid();
  e_diverge uuid := gen_random_uuid();
  e_diverge_insert uuid := gen_random_uuid();
BEGIN
  -- INSERT: either legacy or new owner field may supply the same owner.
  INSERT INTO public.groups(id,name,admin_id) VALUES(g_fill,'T009 group fill from admin',owner_a);
  IF (SELECT admin_id=owner_a AND owner_id=owner_a FROM public.groups WHERE id=g_fill) THEN
    INSERT INTO t009_owner_mirror_results VALUES('groups.insert_fill_from_admin','PASS','owner_id copied from admin_id');
  ELSE
    INSERT INTO t009_owner_mirror_results VALUES('groups.insert_fill_from_admin','FAIL','owner_id was not copied from admin_id');
  END IF;
  INSERT INTO public.groups(id,name,owner_id) VALUES(g_fill_reverse,'T009 group fill admin from owner',owner_a);
  IF (SELECT admin_id=owner_a AND owner_id=owner_a FROM public.groups WHERE id=g_fill_reverse) THEN
    INSERT INTO t009_owner_mirror_results VALUES('groups.insert_fill_admin_from_owner','PASS','admin_id copied from owner_id');
  ELSE
    INSERT INTO t009_owner_mirror_results VALUES('groups.insert_fill_admin_from_owner','FAIL','admin_id was not copied from owner_id');
  END IF;

  INSERT INTO public.exams(id,title,description,start_time,duration_minutes,admin_id)
    VALUES(e_fill,'T009 exam fill from admin','',now(),30,owner_a);
  IF (SELECT admin_id=owner_a AND owner_id=owner_a FROM public.exams WHERE id=e_fill) THEN
    INSERT INTO t009_owner_mirror_results VALUES('exams.insert_fill_from_admin','PASS','owner_id copied from admin_id');
  ELSE
    INSERT INTO t009_owner_mirror_results VALUES('exams.insert_fill_from_admin','FAIL','owner_id was not copied from admin_id');
  END IF;
  INSERT INTO public.exams(id,title,description,start_time,duration_minutes,owner_id)
    VALUES(e_fill_reverse,'T009 exam fill admin from owner','',now(),30,owner_a);
  IF (SELECT admin_id=owner_a AND owner_id=owner_a FROM public.exams WHERE id=e_fill_reverse) THEN
    INSERT INTO t009_owner_mirror_results VALUES('exams.insert_fill_admin_from_owner','PASS','admin_id copied from owner_id');
  ELSE
    INSERT INTO t009_owner_mirror_results VALUES('exams.insert_fill_admin_from_owner','FAIL','admin_id was not copied from owner_id');
  END IF;

  -- UPDATE: changing exactly one side mirrors it to the other side.
  INSERT INTO public.groups(id,name,admin_id,owner_id) VALUES(g_owner_update,'T009 group owner update',owner_a,owner_a);
  UPDATE public.groups SET owner_id=owner_b WHERE id=g_owner_update;
  IF (SELECT admin_id=owner_b AND owner_id=owner_b FROM public.groups WHERE id=g_owner_update) THEN
    INSERT INTO t009_owner_mirror_results VALUES('groups.update_owner_mirrors_admin','PASS','owner_id change mirrored to admin_id');
  ELSE
    INSERT INTO t009_owner_mirror_results VALUES('groups.update_owner_mirrors_admin','FAIL','owner_id change did not mirror');
  END IF;

  INSERT INTO public.groups(id,name,admin_id,owner_id) VALUES(g_admin_update,'T009 group admin update',owner_a,owner_a);
  UPDATE public.groups SET admin_id=owner_b WHERE id=g_admin_update;
  IF (SELECT admin_id=owner_b AND owner_id=owner_b FROM public.groups WHERE id=g_admin_update) THEN
    INSERT INTO t009_owner_mirror_results VALUES('groups.update_admin_mirrors_owner','PASS','admin_id change mirrored to owner_id');
  ELSE
    INSERT INTO t009_owner_mirror_results VALUES('groups.update_admin_mirrors_owner','FAIL','admin_id change did not mirror');
  END IF;

  INSERT INTO public.exams(id,title,description,start_time,duration_minutes,admin_id,owner_id)
    VALUES(e_owner_update,'T009 exam owner update','',now(),30,owner_a,owner_a);
  UPDATE public.exams SET owner_id=owner_b WHERE id=e_owner_update;
  IF (SELECT admin_id=owner_b AND owner_id=owner_b FROM public.exams WHERE id=e_owner_update) THEN
    INSERT INTO t009_owner_mirror_results VALUES('exams.update_owner_mirrors_admin','PASS','owner_id change mirrored to admin_id');
  ELSE
    INSERT INTO t009_owner_mirror_results VALUES('exams.update_owner_mirrors_admin','FAIL','owner_id change did not mirror');
  END IF;

  INSERT INTO public.exams(id,title,description,start_time,duration_minutes,admin_id,owner_id)
    VALUES(e_admin_update,'T009 exam admin update','',now(),30,owner_a,owner_a);
  UPDATE public.exams SET admin_id=owner_b WHERE id=e_admin_update;
  IF (SELECT admin_id=owner_b AND owner_id=owner_b FROM public.exams WHERE id=e_admin_update) THEN
    INSERT INTO t009_owner_mirror_results VALUES('exams.update_admin_mirrors_owner','PASS','admin_id change mirrored to owner_id');
  ELSE
    INSERT INTO t009_owner_mirror_results VALUES('exams.update_admin_mirrors_owner','FAIL','admin_id change did not mirror');
  END IF;

  -- When both fields are changed to different accounts, reject and roll back.
  INSERT INTO public.groups(id,name,admin_id,owner_id) VALUES(g_diverge,'T009 group divergence',owner_a,owner_a);
  BEGIN
    UPDATE public.groups SET admin_id=owner_b,owner_id=unrelated WHERE id=g_diverge;
    INSERT INTO t009_owner_mirror_results VALUES('groups.reject_divergent_update','FAIL','divergent dual update was accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t009_owner_mirror_results VALUES('groups.reject_divergent_update','PASS','divergent dual update rejected');
  END;

  INSERT INTO public.exams(id,title,description,start_time,duration_minutes,admin_id,owner_id)
    VALUES(e_diverge,'T009 exam divergence','',now(),30,owner_a,owner_a);
  BEGIN
    UPDATE public.exams SET admin_id=owner_b,owner_id=unrelated WHERE id=e_diverge;
    INSERT INTO t009_owner_mirror_results VALUES('exams.reject_divergent_update','FAIL','divergent dual update was accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t009_owner_mirror_results VALUES('exams.reject_divergent_update','PASS','divergent dual update rejected');
  END;

  BEGIN
    INSERT INTO public.groups(id,name,admin_id,owner_id) VALUES(g_diverge_insert,'T009 group divergent insert',owner_b,unrelated);
    INSERT INTO t009_owner_mirror_results VALUES('groups.reject_divergent_insert','FAIL','divergent insert was accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t009_owner_mirror_results VALUES('groups.reject_divergent_insert','PASS','divergent insert rejected');
  END;

  BEGIN
    INSERT INTO public.exams(id,title,description,start_time,duration_minutes,admin_id,owner_id)
      VALUES(e_diverge_insert,'T009 exam divergent insert','',now(),30,owner_b,unrelated);
    INSERT INTO t009_owner_mirror_results VALUES('exams.reject_divergent_insert','FAIL','divergent insert was accepted');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO t009_owner_mirror_results VALUES('exams.reject_divergent_insert','PASS','divergent insert rejected');
  END;
END;
$$;

SELECT 'CASE_RESULT|'||case_id||'|'||status||'|'||details
FROM t009_owner_mirror_results ORDER BY case_id;
ROLLBACK;

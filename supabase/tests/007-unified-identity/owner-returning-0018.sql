\set ON_ERROR_STOP on

-- Owner INSERT ... RETURNING regression coverage for migration 0018.
-- All writes in this probe are rolled back at the end of this transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);

DO $$
DECLARE
  v_returned_id uuid;
  v_pass boolean;
BEGIN
  BEGIN
    INSERT INTO public.groups (id, name, admin_id)
    VALUES ('117a0000-0000-4000-8000-000000000001', 'owner-returning-admin-only', 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO v_returned_id;
    v_pass := v_returned_id = '117a0000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN v_pass := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.groups.admin_id_only|%|groups owner INSERT RETURNING works with legacy admin_id only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;

  BEGIN
    INSERT INTO public.groups (id, name, owner_id)
    VALUES ('117a0000-0000-4000-8000-000000000002', 'owner-returning-owner-only', 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO v_returned_id;
    v_pass := v_returned_id = '117a0000-0000-4000-8000-000000000002';
  EXCEPTION WHEN OTHERS THEN v_pass := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.groups.owner_id_only|%|groups owner INSERT RETURNING works with owner_id only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;

  BEGIN
    INSERT INTO public.groups (id, name, admin_id, owner_id)
    VALUES ('117a0000-0000-4000-8000-000000000003', 'owner-returning-equal-owners', 'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO v_returned_id;
    v_pass := v_returned_id = '117a0000-0000-4000-8000-000000000003';
  EXCEPTION WHEN OTHERS THEN v_pass := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.groups.equal_owner_fields|%|groups owner INSERT RETURNING works with equal owner fields', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;

  BEGIN
    INSERT INTO public.exams (id, title, description, start_time, duration_minutes, is_published, admin_id)
    VALUES ('118a0000-0000-4000-8000-000000000001', 'owner-returning-admin-only', 'probe', now() + interval '1 hour', 60, false, 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO v_returned_id;
    v_pass := v_returned_id = '118a0000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN v_pass := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.exams.admin_id_only|%|exams owner INSERT RETURNING works with legacy admin_id only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;

  BEGIN
    INSERT INTO public.exams (id, title, description, start_time, duration_minutes, is_published, owner_id)
    VALUES ('118a0000-0000-4000-8000-000000000002', 'owner-returning-owner-only', 'probe', now() + interval '1 hour', 60, false, 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO v_returned_id;
    v_pass := v_returned_id = '118a0000-0000-4000-8000-000000000002';
  EXCEPTION WHEN OTHERS THEN v_pass := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.exams.owner_id_only|%|exams owner INSERT RETURNING works with owner_id only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;

  BEGIN
    INSERT INTO public.exams (id, title, description, start_time, duration_minutes, is_published, admin_id, owner_id)
    VALUES ('118a0000-0000-4000-8000-000000000003', 'owner-returning-equal-owners', 'probe', now() + interval '1 hour', 60, false, 'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO v_returned_id;
    v_pass := v_returned_id = '118a0000-0000-4000-8000-000000000003';
  EXCEPTION WHEN OTHERS THEN v_pass := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.exams.equal_owner_fields|%|exams owner INSERT RETURNING works with equal owner fields', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

SELECT set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000002',true);
SELECT 'CASE_RESULT|owner_returning.groups.non_owner_read_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.groups WHERE id IN ('117a0000-0000-4000-8000-000000000001','117a0000-0000-4000-8000-000000000002','117a0000-0000-4000-8000-000000000003')
) THEN 'PASS' ELSE 'FAIL' END || '|other owner cannot read rows returned to owner A';
SELECT 'CASE_RESULT|owner_returning.exams.non_owner_read_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.exams WHERE id IN ('118a0000-0000-4000-8000-000000000001','118a0000-0000-4000-8000-000000000002','118a0000-0000-4000-8000-000000000003')
) THEN 'PASS' ELSE 'FAIL' END || '|other owner cannot read rows returned to owner A';
SELECT 'CASE_RESULT|owner_returning.groups.cross_owner_fixture_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.groups WHERE id='b7000000-0000-4000-8000-000000000001'
) THEN 'PASS' ELSE 'FAIL' END || '|owner B still cannot read owner A stable group';
SELECT 'CASE_RESULT|owner_returning.exams.cross_owner_fixture_deny|' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.exams WHERE id='c7000000-0000-4000-8000-000000000001'
) THEN 'PASS' ELSE 'FAIL' END || '|owner B still cannot read owner A stable exam';

DO $$
DECLARE
  v_denied boolean := false;
  v_returned_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.groups (id, name, owner_id)
    VALUES ('117a0000-0000-4000-8000-000000000004', 'owner-returning-cross-owner-deny', 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO STRICT v_returned_id;
    v_denied := false;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  WHEN OTHERS THEN v_denied := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.groups.cross_owner_insert_deny|%|owner B cannot insert a row owned by owner A', CASE WHEN v_denied THEN 'PASS' ELSE 'FAIL' END;

  v_denied := false;
  BEGIN
    INSERT INTO public.exams (id, title, description, start_time, duration_minutes, is_published, owner_id)
    VALUES ('118a0000-0000-4000-8000-000000000004', 'owner-returning-cross-owner-deny', 'probe', now() + interval '1 hour', 60, false, 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO STRICT v_returned_id;
    v_denied := false;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  WHEN OTHERS THEN v_denied := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.exams.cross_owner_insert_deny|%|owner B cannot insert a row owned by owner A', CASE WHEN v_denied THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$
DECLARE
  v_denied boolean;
  v_returned_id uuid;
BEGIN
  BEGIN
    PERFORM 1 FROM public.groups WHERE id IN ('117a0000-0000-4000-8000-000000000001','117a0000-0000-4000-8000-000000000002','117a0000-0000-4000-8000-000000000003');
    v_denied := NOT FOUND;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.groups.anon_read_deny|%|anon cannot read owner-created groups', CASE WHEN v_denied THEN 'PASS' ELSE 'FAIL' END;

  BEGIN
    PERFORM 1 FROM public.exams WHERE id IN ('118a0000-0000-4000-8000-000000000001','118a0000-0000-4000-8000-000000000002','118a0000-0000-4000-8000-000000000003');
    v_denied := NOT FOUND;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.exams.anon_read_deny|%|anon cannot read owner-created exams', CASE WHEN v_denied THEN 'PASS' ELSE 'FAIL' END;

  v_denied := false;
  BEGIN
    INSERT INTO public.groups (id, name, owner_id)
    VALUES ('117a0000-0000-4000-8000-000000000005', 'owner-returning-anon-deny', 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO STRICT v_returned_id;
    v_denied := false;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  WHEN OTHERS THEN v_denied := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.groups.anon_insert_deny|%|anon cannot insert a group for owner A', CASE WHEN v_denied THEN 'PASS' ELSE 'FAIL' END;

  v_denied := false;
  BEGIN
    INSERT INTO public.exams (id, title, description, start_time, duration_minutes, is_published, owner_id)
    VALUES ('118a0000-0000-4000-8000-000000000005', 'owner-returning-anon-deny', 'probe', now() + interval '1 hour', 60, false, 'a7000000-0000-4000-8000-000000000001')
    RETURNING id INTO STRICT v_returned_id;
    v_denied := false;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  WHEN OTHERS THEN v_denied := false;
  END;
  RAISE NOTICE 'CASE_RESULT|owner_returning.exams.anon_insert_deny|%|anon cannot insert an exam for owner A', CASE WHEN v_denied THEN 'PASS' ELSE 'FAIL' END;
END;
$$;

ROLLBACK;

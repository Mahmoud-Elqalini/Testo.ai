BEGIN;

-- Snapshot authorization policy definitions and ACLs so this migration can
-- assert that only the two intended owner SELECT policies changed.
CREATE TEMP TABLE _0018_policy_snapshot ON COMMIT DROP AS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('groups', 'exams', 'questions', 'exam_permissions');

CREATE TEMP TABLE _0018_acl_snapshot ON COMMIT DROP AS
SELECT c.oid AS relation_oid, c.relacl, a.attnum, a.attacl
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public'
  AND c.relname IN ('groups', 'exams');

-- The direct row predicate makes INSERT ... RETURNING visible to its owner
-- without evaluating a self-query through owns_group/owns_exam. Retain each
-- existing ownership helper as an additional equivalent owner condition.
ALTER POLICY groups_owner_select ON public.groups
USING (owner_id = auth.uid() OR private.owns_group(id));

ALTER POLICY exams_owner_select ON public.exams
USING (owner_id = auth.uid() OR private.owns_exam(id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'groups'
      AND policyname = 'groups_owner_select' AND cmd = 'SELECT'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['authenticated']::name[]
      AND with_check IS NULL
      AND regexp_replace(qual, '[[:space:]()]', '', 'g') = 'owner_id=auth.uidORprivate.owns_groupid'
  ) THEN
    RAISE EXCEPTION '0018 assertion failed: groups_owner_select does not retain both owner predicates';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exams'
      AND policyname = 'exams_owner_select' AND cmd = 'SELECT'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['authenticated']::name[]
      AND with_check IS NULL
      AND regexp_replace(qual, '[[:space:]()]', '', 'g') = 'owner_id=auth.uidORprivate.owns_examid'
  ) THEN
    RAISE EXCEPTION '0018 assertion failed: exams_owner_select does not retain both owner predicates';
  END IF;

  IF EXISTS (
    (SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM _0018_policy_snapshot
     WHERE NOT (tablename = 'groups' AND policyname = 'groups_owner_select')
       AND NOT (tablename = 'exams' AND policyname = 'exams_owner_select')
     EXCEPT ALL
     SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('groups', 'exams', 'questions', 'exam_permissions')
       AND NOT (tablename = 'groups' AND policyname = 'groups_owner_select')
       AND NOT (tablename = 'exams' AND policyname = 'exams_owner_select'))
  ) OR EXISTS (
    (SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('groups', 'exams', 'questions', 'exam_permissions')
       AND NOT (tablename = 'groups' AND policyname = 'groups_owner_select')
       AND NOT (tablename = 'exams' AND policyname = 'exams_owner_select')
     EXCEPT ALL
     SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM _0018_policy_snapshot
     WHERE NOT (tablename = 'groups' AND policyname = 'groups_owner_select')
       AND NOT (tablename = 'exams' AND policyname = 'exams_owner_select'))
  ) THEN
    RAISE EXCEPTION '0018 assertion failed: a policy outside the two owner SELECT policies changed';
  END IF;

  IF EXISTS (
    SELECT relation_oid, relacl, attnum, attacl FROM _0018_acl_snapshot
    EXCEPT ALL
    SELECT c.oid, c.relacl, a.attnum, a.attacl
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relname IN ('groups', 'exams')
  ) OR EXISTS (
    SELECT c.oid, c.relacl, a.attnum, a.attacl
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relname IN ('groups', 'exams')
    EXCEPT ALL
    SELECT relation_oid, relacl, attnum, attacl FROM _0018_acl_snapshot
  ) THEN
    RAISE EXCEPTION '0018 assertion failed: relation or column grants changed';
  END IF;
END;
$$;

COMMIT;

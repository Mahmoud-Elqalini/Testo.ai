-- =============================================================================
-- 001-foundation: Row-Level Security Policies
-- Implements: data-model.md RLS sections for all 9 tables
-- =============================================================================
-- CONVENTION:
--   Policy names: {table}_{role}_{operation}
--   All tables have RLS enabled.
--   Service-role connections bypass RLS by design (Supabase default).
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- §2: profiles
-- =============================================================================

-- All authenticated: SELECT own profile only
CREATE POLICY profiles_self_select ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- All authenticated: UPDATE own profile only (role protection via trigger, not policy)
-- The BEFORE UPDATE trigger (003_functions_triggers_cron.sql) blocks role changes.
CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin: additional SELECT for students in their scope (groups + exam_attempts)
CREATE POLICY profiles_admin_read_scoped_students ON profiles
  FOR SELECT
  TO authenticated
  USING (
    -- Only admins benefit from this policy; students already have self-select above
    EXISTS (
      SELECT 1 FROM profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
    AND (
      -- Student is in one of admin's groups
      id IN (
        SELECT gs.student_id FROM group_students gs
        WHERE gs.group_id IN (SELECT g.id FROM groups g WHERE g.admin_id = auth.uid())
      )
      OR
      -- Student has an attempt in one of admin's exams
      id IN (
        SELECT ea.student_id FROM exam_attempts ea
        WHERE ea.exam_id IN (SELECT e.id FROM exams e WHERE e.admin_id = auth.uid())
      )
    )
  );

-- NO INSERT or DELETE policies for any role on profiles.
-- Profile creation is handled by a trigger on auth.users insert (see 003).

-- =============================================================================
-- §3: groups
-- =============================================================================

-- Admin: full CRUD on own groups only
CREATE POLICY groups_admin_select ON groups
  FOR SELECT TO authenticated
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY groups_admin_insert ON groups
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY groups_admin_update ON groups
  FOR UPDATE TO authenticated
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY groups_admin_delete ON groups
  FOR DELETE TO authenticated
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================================================
-- §4: group_students
-- =============================================================================

-- Admin: full CRUD scoped to parent group ownership
CREATE POLICY group_students_admin_select ON group_students
  FOR SELECT TO authenticated
  USING (group_id IN (SELECT id FROM groups WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY group_students_admin_insert ON group_students
  FOR INSERT TO authenticated
  WITH CHECK (group_id IN (SELECT id FROM groups WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY group_students_admin_update ON group_students
  FOR UPDATE TO authenticated
  USING (group_id IN (SELECT id FROM groups WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (group_id IN (SELECT id FROM groups WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY group_students_admin_delete ON group_students
  FOR DELETE TO authenticated
  USING (group_id IN (SELECT id FROM groups WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================================================
-- §5: exams
-- =============================================================================

-- Admin: full CRUD on own exams only
CREATE POLICY exams_admin_select ON exams
  FOR SELECT TO authenticated
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY exams_admin_insert ON exams
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY exams_admin_update ON exams
  FOR UPDATE TO authenticated
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY exams_admin_delete ON exams
  FOR DELETE TO authenticated
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Student: SELECT only published exams they are permitted to take (FR-008)
CREATE POLICY exams_student_select ON exams
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student'
    )
    AND id IN (
      SELECT ep.exam_id FROM exam_permissions ep
      WHERE ep.student_id = auth.uid()
         OR ep.group_id IN (
              SELECT gs.group_id FROM group_students gs WHERE gs.student_id = auth.uid()
            )
    )
  );

-- =============================================================================
-- §6: exam_permissions
-- =============================================================================

-- Admin: full CRUD scoped to parent exam ownership
CREATE POLICY exam_permissions_admin_select ON exam_permissions
  FOR SELECT TO authenticated
  USING (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY exam_permissions_admin_insert ON exam_permissions
  FOR INSERT TO authenticated
  WITH CHECK (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY exam_permissions_admin_update ON exam_permissions
  FOR UPDATE TO authenticated
  USING (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY exam_permissions_admin_delete ON exam_permissions
  FOR DELETE TO authenticated
  USING (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Student: SELECT only for published exams where they are targeted
CREATE POLICY exam_permissions_student_select ON exam_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student'
    )
    AND exam_id IN (SELECT id FROM exams WHERE is_published = true)
    AND (
      student_id = auth.uid()
      OR group_id IN (
        SELECT gs.group_id FROM group_students gs WHERE gs.student_id = auth.uid()
      )
    )
  );

-- =============================================================================
-- §7: questions
-- =============================================================================

-- Admin: full CRUD scoped to parent exam ownership
CREATE POLICY questions_admin_select ON questions
  FOR SELECT TO authenticated
  USING (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY questions_admin_insert ON questions
  FOR INSERT TO authenticated
  WITH CHECK (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY questions_admin_update ON questions
  FOR UPDATE TO authenticated
  USING (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY questions_admin_delete ON questions
  FOR DELETE TO authenticated
  USING (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- NO student SELECT policy on questions.
-- Student access is exclusively via the get-exam-questions Edge Function (service-role).

-- =============================================================================
-- §8: exam_attempts
-- =============================================================================

-- Student: SELECT own attempts only
-- Note: access_token column exclusion is enforced via column-level GRANTs below.
CREATE POLICY exam_attempts_student_select ON exam_attempts
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
  );

-- NO INSERT, UPDATE, or DELETE policies for students.
-- All writes are via Edge Functions with service-role.

-- Admin: SELECT attempts for their own exams (for 004-admin-insights)
CREATE POLICY exam_attempts_admin_select ON exam_attempts
  FOR SELECT TO authenticated
  USING (exam_id IN (SELECT id FROM exams WHERE admin_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================================================
-- Column-Level Privileges (access_token exclusion)
-- =============================================================================
-- RLS operates on rows, not columns. To ensure `access_token` is never
-- returned to any authenticated client (student or admin) even via `select=*`,
-- we explicitly revoke general SELECT and grant SELECT only on safe columns.
REVOKE SELECT ON exam_attempts FROM authenticated;
GRANT SELECT (id, exam_id, student_id, status, started_at, finished_at, session_id)
  ON exam_attempts TO authenticated;

-- =============================================================================
-- §9: answers
-- =============================================================================

-- Student: SELECT own answers only (via parent attempt ownership)
CREATE POLICY answers_student_select ON answers
  FOR SELECT TO authenticated
  USING (
    attempt_id IN (SELECT id FROM exam_attempts WHERE student_id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
  );

-- NO INSERT, UPDATE, or DELETE policies for students.
-- All writes are via the save-answer Edge Function with service-role.

-- Admin: SELECT answers for their own exams' attempts (for 004-admin-insights)
CREATE POLICY answers_admin_select ON answers
  FOR SELECT TO authenticated
  USING (
    attempt_id IN (
      SELECT ea.id FROM exam_attempts ea
      WHERE ea.exam_id IN (SELECT e.id FROM exams e WHERE e.admin_id = auth.uid())
    )
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

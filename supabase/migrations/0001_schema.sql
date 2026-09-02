-- =============================================================================
-- 001-foundation: Schema, Types, Tables, Constraints, Indexes
-- Implements: data-model.md §§1–9 (all entities)
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid() for access_token
CREATE EXTENSION IF NOT EXISTS "pg_cron";     -- scheduled sweep + pending-attempt creation

-- =============================================================================
-- Custom ENUM types
-- =============================================================================

CREATE TYPE user_role AS ENUM ('student', 'admin');
CREATE TYPE question_type AS ENUM ('mcq', 'essay');
CREATE TYPE attempt_status AS ENUM (
  'pending',
  'in_progress',
  'submitted',
  'auto_submitted',
  'abandoned',
  'voided'
);

-- =============================================================================
-- Tables
-- =============================================================================

-- §2: profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role               user_role NOT NULL DEFAULT 'student',
  full_name          text NOT NULL DEFAULT '',
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'ar')),
  preferred_theme    text NOT NULL DEFAULT 'light' CHECK (preferred_theme IN ('light', 'dark'))
);

-- §3: groups
CREATE TABLE groups (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name     text NOT NULL,
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
);

-- §4: group_students
CREATE TABLE group_students (
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, student_id)
);

-- §5: exams
CREATE TABLE exams (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  start_time       timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  admin_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_published     boolean NOT NULL DEFAULT false
);

-- §6: exam_permissions
CREATE TABLE exam_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id    uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  group_id   uuid REFERENCES groups(id) ON DELETE CASCADE,
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  -- Either group_id or student_id must be set, but not both (XOR)
  CONSTRAINT exam_permissions_target_check CHECK (
    (group_id IS NOT NULL AND student_id IS NULL) OR
    (group_id IS NULL AND student_id IS NOT NULL)
  ),
  -- Prevent exact duplicate permission rows
  CONSTRAINT exam_permissions_unique_group UNIQUE (exam_id, group_id),
  CONSTRAINT exam_permissions_unique_student UNIQUE (exam_id, student_id)
);

-- §7: questions
CREATE TABLE questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id           uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  type              question_type NOT NULL,
  text              text NOT NULL,
  points            numeric NOT NULL DEFAULT 1.0 CHECK (points > 0),
  "order"           integer NOT NULL,
  mcq_choices       jsonb,           -- [{id: "a", text: "..."}, ...]
  correct_choice    text,            -- stable id of the correct choice (HIDDEN from students)
  reference_answers jsonb            -- [{id: "ref1", text: "..."}, ...] (HIDDEN from students)
);

-- §8: exam_attempts
CREATE TABLE exam_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id      uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  status       attempt_status NOT NULL DEFAULT 'pending'::attempt_status,
  started_at   timestamptz,
  finished_at  timestamptz,
  session_id   uuid,
  -- FR-009: access_token must be unique and cryptographically random
  CONSTRAINT exam_attempts_access_token_unique UNIQUE (access_token),
  -- One attempt per student per exam
  CONSTRAINT exam_attempts_student_exam_unique UNIQUE (exam_id, student_id)
);

-- §9: answers
CREATE TABLE answers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  mcq_answer    text,
  essay_answer  text,
  score         numeric CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  -- Idempotent upsert key for save-answer Edge Function
  CONSTRAINT answers_attempt_question_unique UNIQUE (attempt_id, question_id)
);

-- =============================================================================
-- Performance Indexes
-- =============================================================================

-- Sweep job: finds expired attempts by status + exam join
CREATE INDEX idx_exam_attempts_status_exam ON exam_attempts(status, exam_id);

-- Sweep job: join target — find exam timing data quickly
CREATE INDEX idx_exams_start_time ON exams(start_time);

-- Pending-attempt creation: find permitted students per exam
CREATE INDEX idx_exam_permissions_exam ON exam_permissions(exam_id);

-- Student exam visibility: find permissions by student
CREATE INDEX idx_exam_permissions_student ON exam_permissions(student_id);

-- Group membership lookup (used in many RLS subqueries)
CREATE INDEX idx_group_students_student ON group_students(student_id);

-- Admin ownership lookups
CREATE INDEX idx_groups_admin ON groups(admin_id);
CREATE INDEX idx_exams_admin ON exams(admin_id);

-- Question ordering within an exam
CREATE INDEX idx_questions_exam_order ON questions(exam_id, "order");

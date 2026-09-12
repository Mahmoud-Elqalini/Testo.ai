export type UserRole = 'student' | 'admin';

export type QuestionType = 'mcq' | 'essay';

export type AttemptStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'auto_submitted'
  | 'abandoned'
  | 'voided';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  preferred_language: 'en' | 'ar';
  preferred_theme: 'light' | 'dark';
}

export interface Group {
  id: string;
  name: string;
  admin_id: string;
}

export interface GroupStudent {
  group_id: string;
  student_id: string;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  start_time: string;
  duration_minutes: number;
  admin_id: string;
  is_published: boolean;
}

export interface ExamPermission {
  id: string;
  exam_id: string;
  group_id: string | null;
  student_id: string | null;
}

export interface McqChoice {
  id: string;
  text: string;
}

export interface ReferenceAnswer {
  id: string;
  text: string;
}

/**
 * Student-facing question entity (safe columns only).
 * COMPILE-TIME GUARANTEE: `correct_choice` and `reference_answers` are absent
 * from this type so student-facing code cannot reference them per Principle II.
 */
export interface ExamQuestion {
  id: string;
  type: QuestionType;
  text: string;
  points: number;
  order: number;
  mcq_choices: McqChoice[] | null;
}

/**
 * Full question row — Admin and server context only.
 * Contains correct choices and reference answers.
 * NEVER import into student-facing code or components.
 */
export interface AdminQuestion extends ExamQuestion {
  exam_id: string;
  correct_choice: string | null;
  reference_answers: ReferenceAnswer[] | null;
}


export interface GetExamQuestionsResponse {
  attempt_id: string;
  remaining_seconds: number;
  questions: ExamQuestion[];
}

/**
 * Student-facing attempt entity.
 * NOTE: `access_token` is intentionally omitted from this interface because
 * student-facing queries can never receive this column per the column-level
 * GRANT and RLS policies established for 001-foundation (data-model.md §8).
 */
export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  status: AttemptStatus;
  started_at: string | null;
  finished_at: string | null;
  session_id: string | null;
}

/**
 * Full attempt row including access_token — server-only / Edge Function context.
 * Never import into student-facing code or components.
 */
export interface ExamAttemptInternal extends ExamAttempt {
  access_token: string;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  mcq_answer: string | null;
  essay_answer: string | null;
  score: number | null;
}

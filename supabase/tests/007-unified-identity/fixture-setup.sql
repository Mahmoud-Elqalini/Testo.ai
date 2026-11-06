-- Local-only deterministic fixture seed. It is additive and never updates existing users.
DO $$
DECLARE
  collision_count integer;
BEGIN
  SELECT count(*) INTO collision_count
  FROM auth.users
  WHERE id IN (
    'a7000000-0000-4000-8000-000000000001'::uuid,
    'a7000000-0000-4000-8000-000000000002'::uuid,
    'a7000000-0000-4000-8000-000000000003'::uuid,
    'a7000000-0000-4000-8000-000000000004'::uuid
  )
  AND email NOT IN (
    'owner-a-007@example.test', 'owner-b-007@example.test',
    'participant-a-007@example.test', 'unrelated-007@example.test'
  );
  IF collision_count > 0 THEN
    RAISE EXCEPTION '007 fixture UUID collision with existing local auth user; refusing to alter data';
  END IF;
END $$;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin)
VALUES
  ('a7000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a-007@example.test', crypt('LocalOnly-007-owner-a!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"007 Owner A"}', now(), now(), false),
  ('a7000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b-007@example.test', crypt('LocalOnly-007-owner-b!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"007 Owner B"}', now(), now(), false),
  ('a7000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'participant-a-007@example.test', crypt('LocalOnly-007-participant-a!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"007 Participant A"}', now(), now(), false),
  ('a7000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unrelated-007@example.test', crypt('LocalOnly-007-unrelated!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"007 Unrelated"}', now(), now(), false)
ON CONFLICT (id) DO NOTHING;

-- This local GoTrue build scans token fields as non-null strings.
UPDATE auth.users
SET confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = ''
WHERE id IN (
  'a7000000-0000-4000-8000-000000000001'::uuid,
  'a7000000-0000-4000-8000-000000000002'::uuid,
  'a7000000-0000-4000-8000-000000000003'::uuid,
  'a7000000-0000-4000-8000-000000000004'::uuid
);

UPDATE public.profiles
SET role = CASE id
  WHEN 'a7000000-0000-4000-8000-000000000001'::uuid THEN 'admin'::user_role
  WHEN 'a7000000-0000-4000-8000-000000000002'::uuid THEN 'admin'::user_role
  ELSE 'student'::user_role
END,
full_name = CASE id
  WHEN 'a7000000-0000-4000-8000-000000000001'::uuid THEN '007 Owner A'
  WHEN 'a7000000-0000-4000-8000-000000000002'::uuid THEN '007 Owner B'
  WHEN 'a7000000-0000-4000-8000-000000000003'::uuid THEN '007 Participant A'
  ELSE '007 Unrelated'
END
WHERE id IN (
  'a7000000-0000-4000-8000-000000000001'::uuid,
  'a7000000-0000-4000-8000-000000000002'::uuid,
  'a7000000-0000-4000-8000-000000000003'::uuid,
  'a7000000-0000-4000-8000-000000000004'::uuid
);

INSERT INTO public.groups (id, name, admin_id) VALUES
  ('b7000000-0000-4000-8000-000000000001', '007 Baseline Group A', 'a7000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000002', '007 Baseline Group B', 'a7000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.exams (id, title, description, start_time, duration_minutes, admin_id, is_published) VALUES
  ('c7000000-0000-4000-8000-000000000001', '007 Baseline Exam A', 'Synthetic local security fixture', now() + interval '1 hour', 60, 'a7000000-0000-4000-8000-000000000001', false),
  ('c7000000-0000-4000-8000-000000000002', '007 Baseline Exam B', 'Synthetic local security fixture', now() + interval '1 hour', 60, 'a7000000-0000-4000-8000-000000000002', false),
  ('c7000000-0000-4000-8000-000000000003', '007 Baseline RPC Exam', 'Synthetic local security fixture', now() + interval '1 hour', 60, 'a7000000-0000-4000-8000-000000000001', false),
  ('c7000000-0000-4000-8000-000000000004', '007 Baseline Edge Exam', 'Synthetic local security fixture', now() + interval '1 hour', 60, 'a7000000-0000-4000-8000-000000000001', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.exam_permissions (exam_id, group_id) VALUES
  ('c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001'),
  ('c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002'),
  ('c7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001'),
  ('c7000000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000001')
ON CONFLICT (exam_id, group_id) DO NOTHING;

INSERT INTO public.group_students (group_id, student_id) VALUES
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003')
ON CONFLICT (group_id, student_id) DO NOTHING;

INSERT INTO public.questions (id, exam_id, type, text, points, "order", mcq_choices, correct_choice, reference_answers)
SELECT fixture.id, fixture.exam_id, fixture.type, fixture.text, fixture.points, fixture.question_order,
       fixture.mcq_choices, fixture.correct_choice, fixture.reference_answers
FROM (VALUES
  ('d7000000-0000-4000-8000-000000000002'::uuid, 'c7000000-0000-4000-8000-000000000003'::uuid, 'mcq'::question_type, 'Synthetic RPC question', 1, 1, '[{"id":"a","text":"A"},{"id":"b","text":"B"}]'::jsonb, 'b', '[{"id":"r1","text":"synthetic reference"}]'::jsonb),
  ('d7000000-0000-4000-8000-000000000003'::uuid, 'c7000000-0000-4000-8000-000000000004'::uuid, 'mcq'::question_type, 'Synthetic Edge question', 1, 1, '[{"id":"a","text":"A"},{"id":"b","text":"B"}]'::jsonb, 'b', '[{"id":"r1","text":"synthetic reference"}]'::jsonb)
) AS fixture(id, exam_id, type, text, points, question_order, mcq_choices, correct_choice, reference_answers)
WHERE NOT EXISTS (SELECT 1 FROM public.questions existing WHERE existing.id = fixture.id);

INSERT INTO public.exam_attempts (id, exam_id, student_id, access_token, status) VALUES
  ('e7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000003', 'fixture-007-rpc-attempt', 'pending'),
  ('e7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000004', 'a7000000-0000-4000-8000-000000000003', 'fixture-007-edge-attempt', 'pending')
ON CONFLICT (id) DO NOTHING;

UPDATE public.exams
SET start_time = now() - interval '1 minute', is_published = true
WHERE id IN ('c7000000-0000-4000-8000-000000000003'::uuid, 'c7000000-0000-4000-8000-000000000004'::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM public.exam_attempts attempt
    WHERE attempt.exam_id = exams.id AND attempt.status <> 'pending'
  );

INSERT INTO public.exam_attempts (id, exam_id, student_id, access_token, status) VALUES
  ('e7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003', 'fixture-007-attempt-a', 'pending')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.answers (id, attempt_id, question_id, mcq_answer) VALUES
  ('f7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'a')
ON CONFLICT (id) DO NOTHING;


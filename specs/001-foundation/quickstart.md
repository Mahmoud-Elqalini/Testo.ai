# Quickstart & Validation Guide: 001-foundation

This guide outlines how to validate the foundation features end-to-end once implemented.

## Prerequisites
- Local Supabase instance running (`supabase start`).
- Next.js development server running (`npm run dev`).
- Test accounts created (Admin: `admin@testo.local`, Student: `student@testo.local`).

## Scenario 1: Admin Exam Creation & Publication
1. Log in as `admin@testo.local`.
2. Navigate to "Create Exam". Fill in details: Title, start time (e.g., 5 mins from now), duration (60 mins).
3. Add 1 MCQ and 1 Essay question.
4. Assign the exam to `student@testo.local`.
5. Click "Publish".
**Expected**: The exam appears in the Admin's dashboard as Published.

## Scenario 2: Immutability Enforcement
1. Student starts the exam (transitions to `in_progress`).
2. Admin attempts to edit the exam's questions or duration.
**Expected**: UI prevents the edit. Direct API calls are rejected by the database trigger/RLS.

## Scenario 3: Secure Exam Taking
1. Log in as `student@testo.local`.
2. Navigate to the exam link *before* the start time.
**Expected**: Access denied / Pending state.
3. Wait for start time, open exam link.
**Expected**: Exam loads. Network payload for `questions` does NOT contain `correct_choice` or `reference_answers`.
4. Answer the MCQ.
**Expected**: Save status indicates "Saving..." then "Saved".
5. Disconnect internet. Type in the essay field.
**Expected**: UI indicates "Unsynced" or "Offline".
6. Reconnect internet.
**Expected**: Essay answer syncs automatically.

## Scenario 4: Auto Submission
1. Start an exam as a student.
2. Close the browser.
3. Wait for `start_time + duration_minutes` to pass.
4. Trigger the pg_cron job manually (or wait).
**Expected**: Attempt status changes to `auto_submitted`. Re-opening the link as the student denies access (exam closed).

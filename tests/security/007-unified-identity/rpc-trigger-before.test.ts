import { record, parseJson, runSqlFile } from "./context.ts";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ids = {
  ownerA: "a7000000-0000-4000-8000-000000000001",
  ownerB: "a7000000-0000-4000-8000-000000000002",
  participantA: "a7000000-0000-4000-8000-000000000003",
  unrelated: "a7000000-0000-4000-8000-000000000004",
  groupA: "b7000000-0000-4000-8000-000000000001",
  groupB: "b7000000-0000-4000-8000-000000000002",
  examA: "c7000000-0000-4000-8000-000000000001",
  examRpc: "c7000000-0000-4000-8000-000000000003",
  questionRpc: "d7000000-0000-4000-8000-000000000002",
  attemptRpc: "e7000000-0000-4000-8000-000000000002",
};

async function rpc(ctx: any, actor: string | undefined, name: string, args: Record<string, unknown>) {
  const response = await ctx.request(`/rest/v1/rpc/${name}`, actor, { method: "POST", body: JSON.stringify(args) });
  const body = parseJson(await response.text());
  return { response, body };
}

function returnedRows(body: unknown) { return Array.isArray(body) && body.length > 0; }
function okay(response: Response, body: unknown) { return response.ok && !(body && typeof body === "object" && ("denial_reason" in body || "validation_error" in body || "error" in body)); }
function responseDetail(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return `; response=${text.length > 500 ? `${text.slice(0, 500)}…` : text}`;
}

async function sourceFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = resolve(path, entry.name);
    return entry.isDirectory() ? sourceFiles(fullPath) : /\.(tsx?|sql)$/.test(entry.name) ? [fullPath] : [];
  }));
  return nested.flat();
}

export async function runRpcTriggerCases(ctx: any) {
  const helperOutput = await runSqlFile("supabase/tests/007-unified-identity/rpc-trigger-before.sql");
  for (const line of helperOutput.split(/\r?\n/)) {
    const match = /CASE_RESULT\|([^|]+)\|(PASS|FAIL)\|(.+)/.exec(line);
    if (match) await record(ctx, match[1], match[2] === "PASS", match[3]);
  }

  const search = await rpc(ctx, "ownerA", "search_student_by_email", { search_email: "participant-a-007@example.test" });
  await record(ctx, "function:public.search_student_by_email.allow", search.response.ok && returnedRows(search.body), `HTTP ${search.response.status}; admin exact-match lookup returns one row`);
  const searchDenied = await rpc(ctx, "participantA", "search_student_by_email", { search_email: "unrelated-007@example.test" });
  await record(ctx, "function:public.search_student_by_email.deny", !searchDenied.response.ok || !returnedRows(searchDenied.body), `HTTP ${searchDenied.response.status}; student cannot enumerate an unrelated account`);

  const groupList = await rpc(ctx, "ownerA", "list_group_students", { target_group_id: ids.groupA });
  await record(ctx, "function:public.list_group_students.allow", groupList.response.ok && returnedRows(groupList.body), `HTTP ${groupList.response.status}; group owner lists an associated participant`);
  const groupListDenied = await rpc(ctx, "ownerB", "list_group_students", { target_group_id: ids.groupA });
  await record(ctx, "function:public.list_group_students.deny", groupListDenied.response.ok && !returnedRows(groupListDenied.body), `HTTP ${groupListDenied.response.status}; another owner receives no participant rows`);

  const permissionList = await rpc(ctx, "ownerA", "list_exam_permissions", { target_exam_id: ids.examA });
  await record(ctx, "function:public.list_exam_permissions.allow", permissionList.response.ok && returnedRows(permissionList.body), `HTTP ${permissionList.response.status}; exam owner lists permissions`);
  const permissionListDenied = await rpc(ctx, "ownerB", "list_exam_permissions", { target_exam_id: ids.examA });
  await record(ctx, "function:public.list_exam_permissions.deny", permissionListDenied.response.ok && !returnedRows(permissionListDenied.body), `HTTP ${permissionListDenied.response.status}; non-owner receives no permission rows`);

  const invitation = await rpc(ctx, "ownerA", "create_group_invitation", { target_group_id: ids.groupA });
  const inviteCode = (invitation.body as any)?.code;
  await record(ctx, "function:public.create_group_invitation.allow", invitation.response.ok && typeof inviteCode === "string", `HTTP ${invitation.response.status}; group owner creates an invitation`);
  const createDenied = await rpc(ctx, "ownerB", "create_group_invitation", { target_group_id: ids.groupA });
  await record(ctx, "function:public.create_group_invitation.deny", !createDenied.response.ok, `HTTP ${createDenied.response.status}; non-owner cannot create an invitation`);

  const rotate = await rpc(ctx, "ownerA", "rotate_group_invitation", { target_group_id: ids.groupA });
  const validCode = (rotate.body as any)?.code;
  await record(ctx, "function:public.rotate_group_invitation.allow", rotate.response.ok && typeof validCode === "string", `HTTP ${rotate.response.status}; owner rotates invitation code`);
  const rotateDenied = await rpc(ctx, "ownerB", "rotate_group_invitation", { target_group_id: ids.groupA });
  await record(ctx, "function:public.rotate_group_invitation.deny", !rotateDenied.response.ok, `HTTP ${rotateDenied.response.status}; non-owner cannot rotate the invitation`);

  const inviteStatus = await rpc(ctx, "ownerA", "get_group_invitation_status", { target_group_id: ids.groupA });
  await record(ctx, "function:public.get_group_invitation_status.allow", inviteStatus.response.ok, `HTTP ${inviteStatus.response.status}; owner reads invitation status`);
  const inviteStatusDenied = await rpc(ctx, "ownerB", "get_group_invitation_status", { target_group_id: ids.groupA });
  await record(ctx, "function:public.get_group_invitation_status.deny", !inviteStatusDenied.response.ok, `HTTP ${inviteStatusDenied.response.status}; non-owner cannot read invitation status`);

  const ownerRedeem = await rpc(ctx, "ownerA", "redeem_group_invitation", { invitation_code: validCode });
  await record(ctx, "function:public.redeem_group_invitation.deny", ownerRedeem.response.ok && (ownerRedeem.body as any)?.success === false, `HTTP ${ownerRedeem.response.status}; owner cannot join their own group`);
  const participantRedeem = await rpc(ctx, "unrelated", "redeem_group_invitation", { invitation_code: validCode });
  await record(ctx, "function:public.redeem_group_invitation.allow", participantRedeem.response.ok && (participantRedeem.body as any)?.success === true, `HTTP ${participantRedeem.response.status}; student redeems valid code for self`);
  await ctx.request(`/rest/v1/group_students?group_id=eq.${ids.groupA}&student_id=eq.${ids.unrelated}`, "ownerA", { method: "DELETE", headers: ctx.serviceHeaders() });

  const revoke = await rpc(ctx, "ownerA", "revoke_group_invitation", { target_group_id: ids.groupA });
  await record(ctx, "function:public.revoke_group_invitation.allow", revoke.response.ok, `HTTP ${revoke.response.status}; group owner revokes invitation`);
  const revokeDenied = await rpc(ctx, "ownerB", "revoke_group_invitation", { target_group_id: ids.groupA });
  await record(ctx, "function:public.revoke_group_invitation.deny", !revokeDenied.response.ok, `HTTP ${revokeDenied.response.status}; non-owner cannot revoke invitation`);

  // These membership and permission writes are done through the actual trigger path.
  const serviceHeaders = ctx.serviceHeaders();
  const triggerGroupId = crypto.randomUUID();
  const triggerExamId = crypto.randomUUID();
  await ctx.request("/rest/v1/groups", "ownerA", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ id: triggerGroupId, name: "007 trigger fixture group", admin_id: ids.ownerA }) });
  await ctx.request("/rest/v1/exams", "ownerA", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ id: triggerExamId, title: "007 trigger fixture exam", description: "synthetic trigger test", start_time: new Date(Date.now() + 3600000).toISOString(), duration_minutes: 60, admin_id: ids.ownerA, is_published: false }) });

  const membership = await ctx.request("/rest/v1/group_students", "ownerA", { method: "POST", headers: { ...serviceHeaders, Prefer: "return=representation" }, body: JSON.stringify({ group_id: triggerGroupId, student_id: ids.unrelated }) });
  await record(ctx, "function:public.fn_require_student_group_member.allow", membership.ok, `HTTP ${membership.status}; student membership invokes the role guard`);
  await record(ctx, "trigger:trg_require_student_group_member.allow", membership.ok, `HTTP ${membership.status}; student membership passes the trigger`);
  const ownerMembership = await ctx.request("/rest/v1/group_students", "ownerA", { method: "POST", headers: { ...serviceHeaders, Prefer: "return=representation" }, body: JSON.stringify({ group_id: triggerGroupId, student_id: ids.ownerA }) });
  await record(ctx, "function:public.fn_require_student_group_member.deny", !ownerMembership.ok, `HTTP ${ownerMembership.status}; admin-role identity rejected as group student`);
  await record(ctx, "trigger:trg_require_student_group_member.deny", !ownerMembership.ok, `HTTP ${ownerMembership.status}; trigger rejects non-student membership`);

  const directPermission = await ctx.request("/rest/v1/exam_permissions", "ownerA", { method: "POST", headers: { ...serviceHeaders, Prefer: "return=representation" }, body: JSON.stringify({ exam_id: triggerExamId, student_id: ids.participantA }) });
  await record(ctx, "function:public.fn_require_student_exam_permission.allow", directPermission.ok, `HTTP ${directPermission.status}; student permission passes role guard`);
  await record(ctx, "trigger:trg_require_student_exam_permission.allow", directPermission.ok, `HTTP ${directPermission.status}; trigger accepts student permission`);
  const invalidStudentPermission = await ctx.request("/rest/v1/exam_permissions", "ownerA", { method: "POST", headers: { ...serviceHeaders, Prefer: "return=representation" }, body: JSON.stringify({ exam_id: triggerExamId, student_id: ids.ownerA }) });
  await record(ctx, "function:public.fn_require_student_exam_permission.deny", !invalidStudentPermission.ok, `HTTP ${invalidStudentPermission.status}; admin identity rejected as direct student permission`);
  await record(ctx, "trigger:trg_require_student_exam_permission.deny", !invalidStudentPermission.ok, `HTTP ${invalidStudentPermission.status}; trigger rejects non-student permission`);

  const sameOwnerGroupPermission = await ctx.request("/rest/v1/exam_permissions", "ownerA", { method: "POST", headers: { ...serviceHeaders, Prefer: "return=representation" }, body: JSON.stringify({ exam_id: triggerExamId, group_id: ids.groupA }) });
  await record(ctx, "function:public.fn_enforce_group_ownership_on_permission.allow", sameOwnerGroupPermission.ok, `HTTP ${sameOwnerGroupPermission.status}; exam and group share owner`);
  await record(ctx, "trigger:trg_enforce_group_ownership_on_permission.allow", sameOwnerGroupPermission.ok, `HTTP ${sameOwnerGroupPermission.status}; same-owner permission passes trigger`);
  const crossOwnerGroupPermission = await ctx.request("/rest/v1/exam_permissions", "ownerA", { method: "POST", headers: { ...serviceHeaders, Prefer: "return=representation" }, body: JSON.stringify({ exam_id: triggerExamId, group_id: ids.groupB }) });
  await record(ctx, "function:public.fn_enforce_group_ownership_on_permission.deny", !crossOwnerGroupPermission.ok, `HTTP ${crossOwnerGroupPermission.status}; cross-owner group permission rejected`);
  await record(ctx, "trigger:trg_enforce_group_ownership_on_permission.deny", !crossOwnerGroupPermission.ok, `HTTP ${crossOwnerGroupPermission.status}; trigger rejects cross-owner permission`);
  await ctx.request(`/rest/v1/exams?id=eq.${triggerExamId}`, "ownerA", { method: "DELETE", headers: serviceHeaders });
  await ctx.request(`/rest/v1/groups?id=eq.${triggerGroupId}`, "ownerA", { method: "DELETE", headers: serviceHeaders });

  // Create a disposable, additive attempt fixture per run. The stable manifest
  // attempt may have been consumed by an earlier baseline run; do not reset or
  // reseed it before the baseline evidence is committed.
  const rpcExamId = crypto.randomUUID();
  const rpcQuestionId = crypto.randomUUID();
  const rpcAttemptId = crypto.randomUUID();
  const examFixture = await ctx.request("/rest/v1/exams", "ownerA", {
    method: "POST", headers: serviceHeaders,
    body: JSON.stringify({ id: rpcExamId, title: "007 disposable RPC exam", description: "Security baseline probe", start_time: new Date(Date.now() - 5 * 60_000).toISOString(), duration_minutes: 60, admin_id: ids.ownerA, is_published: true }),
  });
  const questionFixture = await ctx.request("/rest/v1/questions", "ownerA", {
    method: "POST", headers: serviceHeaders,
    body: JSON.stringify({ id: rpcQuestionId, exam_id: rpcExamId, type: "mcq", text: "007 disposable RPC question", points: 1, order: 1, mcq_choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct_choice: "b", reference_answers: [{ id: "r1", text: "synthetic reference" }] }),
  });
  const attemptFixture = await ctx.request("/rest/v1/exam_attempts", "ownerA", {
    method: "POST", headers: serviceHeaders,
    body: JSON.stringify({ id: rpcAttemptId, exam_id: rpcExamId, student_id: ids.participantA, access_token: `fixture-${rpcAttemptId}`, status: "pending" }),
  });
  if (!examFixture.ok || !questionFixture.ok || !attemptFixture.ok) {
    const statuses = `disposable fixture setup failed: exam=${examFixture.status}, question=${questionFixture.status}, attempt=${attemptFixture.status}`;
    for (const caseId of [
      "function:public.fn_start_attempt.allow", "function:public.fn_start_attempt.deny",
      "function:public.fn_get_exam_questions.allow", "function:public.fn_get_exam_questions.deny",
      "function:public.fn_save_attempt_answer.allow", "function:public.fn_save_attempt_answer.deny",
      "function:public.fn_submit_attempt.allow", "function:public.fn_submit_attempt.deny",
    ]) await record(ctx, caseId, false, statuses);
  } else {
  // Current-schema attempt RPCs are callable only on the service path and accept p_student_id.
  // This verifies their existing logic; Edge tests separately verify the authenticated caller path.
  const sessionId = crypto.randomUUID();
  const start = await ctx.request("/rest/v1/rpc/fn_start_attempt", "participantA", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ p_attempt_id: rpcAttemptId, p_student_id: ids.participantA, p_session_id: sessionId }) });
  const startBody = parseJson(await start.text());
  await record(ctx, "function:public.fn_start_attempt.allow", okay(start, startBody), `HTTP ${start.status}; matching student attempt starts${responseDetail(startBody)}`);
  const spoofStart = await ctx.request("/rest/v1/rpc/fn_start_attempt", "unrelated", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ p_attempt_id: rpcAttemptId, p_student_id: ids.unrelated, p_session_id: crypto.randomUUID() }) });
  const spoofStartBody = parseJson(await spoofStart.text());
  await record(ctx, "function:public.fn_start_attempt.deny", !okay(spoofStart, spoofStartBody), `HTTP ${spoofStart.status}; attempt cannot start for a different student id`);

  const getQuestions = await ctx.request("/rest/v1/rpc/fn_get_exam_questions", "participantA", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ p_attempt_id: rpcAttemptId, p_student_id: ids.participantA, p_session_id: sessionId }) });
  const questionPayload = parseJson(await getQuestions.text()) as any;
  const safeQuestions = okay(getQuestions, questionPayload) && !JSON.stringify(questionPayload).includes("correct_choice") && !JSON.stringify(questionPayload).includes("reference_answers");
  await record(ctx, "function:public.fn_get_exam_questions.allow", safeQuestions, `HTTP ${getQuestions.status}; question projection excludes correct_choice and reference_answers${responseDetail(questionPayload)}`);
  const foreignQuestions = await ctx.request("/rest/v1/rpc/fn_get_exam_questions", "unrelated", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ p_attempt_id: rpcAttemptId, p_student_id: ids.unrelated, p_session_id: sessionId }) });
  const foreignQuestionsBody = parseJson(await foreignQuestions.text());
  await record(ctx, "function:public.fn_get_exam_questions.deny", !okay(foreignQuestions, foreignQuestionsBody), `HTTP ${foreignQuestions.status}; foreign learner receives no question payload${responseDetail(foreignQuestionsBody)}`);

  const save = await ctx.request("/rest/v1/rpc/fn_save_attempt_answer", "participantA", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ p_attempt_id: rpcAttemptId, p_student_id: ids.participantA, p_session_id: sessionId, p_question_id: rpcQuestionId, p_mcq_answer: "a", p_essay_answer: null }) });
  const saveBody = parseJson(await save.text());
  await record(ctx, "function:public.fn_save_attempt_answer.allow", okay(save, saveBody), `HTTP ${save.status}; valid participant answer saves${responseDetail(saveBody)}`);
  const saveDenied = await ctx.request("/rest/v1/rpc/fn_save_attempt_answer", "unrelated", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ p_attempt_id: rpcAttemptId, p_student_id: ids.unrelated, p_session_id: sessionId, p_question_id: rpcQuestionId, p_mcq_answer: "a", p_essay_answer: null }) });
  const saveDeniedBody = parseJson(await saveDenied.text());
  await record(ctx, "function:public.fn_save_attempt_answer.deny", !okay(saveDenied, saveDeniedBody), `HTTP ${saveDenied.status}; foreign answer save is rejected${responseDetail(saveDeniedBody)}`);

  const submit = await ctx.request("/rest/v1/rpc/fn_submit_attempt", "participantA", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ p_attempt_id: rpcAttemptId, p_student_id: ids.participantA, p_session_id: sessionId }) });
  const submitBody = parseJson(await submit.text());
  await record(ctx, "function:public.fn_submit_attempt.allow", okay(submit, submitBody), `HTTP ${submit.status}; participant submits own attempt${responseDetail(submitBody)}`);
  const submitDenied = await ctx.request("/rest/v1/rpc/fn_submit_attempt", "unrelated", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ p_attempt_id: rpcAttemptId, p_student_id: ids.unrelated, p_session_id: sessionId }) });
  const submitDeniedBody = parseJson(await submitDenied.text());
  await record(ctx, "function:public.fn_submit_attempt.deny", !okay(submitDenied, submitDeniedBody), `HTTP ${submitDenied.status}; foreign identity cannot submit attempt${responseDetail(submitDeniedBody)}`);

  const result = await rpc(ctx, "participantA", "fn_get_student_attempt_result", { p_attempt_id: rpcAttemptId });
  await record(ctx, "function:public.fn_get_student_attempt_result.allow", result.response.ok && ["pending", "graded"].includes((result.body as any)?.status), `HTTP ${result.response.status}; own submitted result projection is visible`);
  const resultDenied = await rpc(ctx, "unrelated", "fn_get_student_attempt_result", { p_attempt_id: rpcAttemptId });
  await record(ctx, "function:public.fn_get_student_attempt_result.deny", !resultDenied.response.ok || (resultDenied.body as any)?.error === "access_denied", `HTTP ${resultDenied.response.status}; foreign caller receives no result`);
  }
  await ctx.request(`/rest/v1/exams?id=eq.${rpcExamId}`, "ownerA", { method: "DELETE", headers: serviceHeaders });

  const ordinaryUpdate = await ctx.request(`/rest/v1/profiles?id=eq.${ids.participantA}`, "participantA", { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ full_name: "007 Participant A" }) });
  await record(ctx, "function:public.fn_protect_profile_role.allow", ordinaryUpdate.ok, `HTTP ${ordinaryUpdate.status}; ordinary profile edit does not alter role`);
  await record(ctx, "trigger:trg_protect_profile_role.allow", ordinaryUpdate.ok, `HTTP ${ordinaryUpdate.status}; non-role update passes protection trigger`);
  const roleUpdate = await ctx.request(`/rest/v1/profiles?id=eq.${ids.participantA}`, "participantA", { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ role: "admin" }) });
  const roleUpdateBody = parseJson(await roleUpdate.text());
  const roleRead = await ctx.request(`/rest/v1/profiles?id=eq.${ids.participantA}&select=role`, "participantA");
  const roleRows = parseJson(await roleRead.text()) as Array<{ role?: string }>;
  const profileRoleUnchanged = roleRead.ok && Array.isArray(roleRows) && roleRows[0]?.role === "student";
  const roleMutationRejected = !roleUpdate.ok || profileRoleUnchanged;
  const mirrorOutput = (await ctx.runSql(`SELECT role::text FROM public.private_user_roles WHERE user_id='${ids.participantA}'::uuid;`)).trim();
  const mirrorRole = /\b(student|admin)\s*$/.exec(mirrorOutput)?.[1] ?? "";
  const roleMirrorUnchanged = mirrorRole === "student";
  const roleDetail = `HTTP ${roleUpdate.status}; returned=${JSON.stringify(roleUpdateBody)}; profile_role=${roleRows?.[0]?.role ?? "unreadable"}; mirror_role=${mirrorRole || "missing"}`;
  await record(ctx, "function:public.fn_protect_profile_role.deny", roleMutationRejected, `${roleDetail}; authenticated role mutation must not take effect`);
  await record(ctx, "trigger:trg_protect_profile_role.deny", roleMutationRejected, `${roleDetail}; protection trigger must prevent the role change`);
  await record(ctx, "function:public.fn_sync_user_role.deny", roleMutationRejected && roleMirrorUnchanged, `${roleDetail}; rejected update must not reach the mirror function`);
  await record(ctx, "trigger:trg_sync_user_role.deny", roleMutationRejected && roleMirrorUnchanged, `${roleDetail}; rejected update must not alter the role mirror`);
  await ctx.request(`/rest/v1/profiles?id=eq.${ids.participantA}`, "ownerA", { method: "PATCH", headers: serviceHeaders, body: JSON.stringify({ role: "student" }) });
  const mirrored = await ctx.request(`/rest/v1/profiles?id=eq.${ids.participantA}&select=id`, "participantA", { method: "GET" });
  await record(ctx, "function:public.fn_sync_user_role.allow", mirrored.ok, `HTTP ${mirrored.status}; profile remains available after trusted mirror update`);
  await record(ctx, "trigger:trg_sync_user_role.allow", mirrored.ok, `HTTP ${mirrored.status}; mirror trigger remains active`);

  const absentPaths = [resolve("src"), resolve("supabase/functions")];
  const files = (await Promise.all(absentPaths.map(sourceFiles))).flat();
  const text = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const absent = !/(void[_-]?attempt|voidAttempt|grade[_-]?override|gradeOverride)/i.test(text);
  await record(ctx, "action:void_attempt.absent", absent, `Scanned ${files.length} application/Edge files for a current void-attempt path`);
  await record(ctx, "action:grade_override.absent", absent, `Scanned ${files.length} application/Edge files for a current grade-override path`);
}

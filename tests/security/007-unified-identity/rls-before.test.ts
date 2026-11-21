import { record, parseJson } from "./context.ts";

const ids = {
  ownerA: "a7000000-0000-4000-8000-000000000001",
  ownerB: "a7000000-0000-4000-8000-000000000002",
  participantA: "a7000000-0000-4000-8000-000000000003",
  unrelated: "a7000000-0000-4000-8000-000000000004",
  groupA: "b7000000-0000-4000-8000-000000000001",
  groupB: "b7000000-0000-4000-8000-000000000002",
  examA: "c7000000-0000-4000-8000-000000000001",
  examB: "c7000000-0000-4000-8000-000000000002",
  examRpc: "c7000000-0000-4000-8000-000000000003",
  examEdge: "c7000000-0000-4000-8000-000000000004",
  questionA: "d7000000-0000-4000-8000-000000000001",
  attemptA: "e7000000-0000-4000-8000-000000000001",
};

function nonempty(value: unknown) { return Array.isArray(value) && value.length > 0; }
function empty(value: unknown) { return Array.isArray(value) && value.length === 0; }

async function request(ctx: any, actor: string, table: string, method = "GET", query = "select=*", body?: unknown) {
  const response = await ctx.request(`/rest/v1/${table}?${query}`, actor, {
    method,
    headers: { Prefer: "return=representation" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const rawBody = await response.text();
  return { response, body: parseJson(rawBody), rawBody };
}

async function readPair(ctx: any, policy: string, table: string, allowActor: string, allowQuery: string, denyActor: string, denyQuery: string) {
  const allow = await request(ctx, allowActor, table, "GET", allowQuery);
  await record(ctx, `policy:${policy}.allow`, allow.response.ok && nonempty(allow.body), `HTTP ${allow.response.status}; matching authorized row returned`);
  const deny = await request(ctx, denyActor, table, "GET", denyQuery);
  await record(ctx, `policy:${policy}.deny`, deny.response.ok && empty(deny.body), `HTTP ${deny.response.status}; unrelated row hidden`);
}

async function writePair(ctx: any, policy: string, method: string, table: string, allowActor: string, allowBody: unknown, denyActor: string, denyBody: unknown, allowQuery = "select=*", denyQuery = allowQuery) {
  const allow = await request(ctx, allowActor, table, method, allowQuery, allowBody);
  const allowed = allow.response.ok && (nonempty(allow.body) || allow.response.status === 204);
  await record(ctx, `policy:${policy}.allow`, allowed, `HTTP ${allow.response.status}; owner operation ${allowed ? "accepted" : "rejected"}`);
  const deny = await request(ctx, denyActor, table, method, denyQuery, denyBody);
  const denied = !deny.response.ok || empty(deny.body);
  await record(ctx, `policy:${policy}.deny`, denied, `HTTP ${deny.response.status}; unrelated operation ${denied ? "denied" : "accepted"}`);
  return allow;
}

export async function runRlsCases(ctx: any) {
  const groupId = crypto.randomUUID();
  const examId = crypto.randomUUID();
  const questionId = crypto.randomUUID();
  const extraGroupId = crypto.randomUUID();
  const membershipGroupId = crypto.randomUUID();
  const tempMembership = { group_id: membershipGroupId, student_id: ids.unrelated };

  await readPair(ctx, "profiles_admin_read_scoped_students", "profiles", "ownerA", `id=eq.${ids.participantA}&select=id,full_name`, "ownerA", `id=eq.${ids.ownerB}&select=id,full_name`);

  await readPair(ctx, "groups_admin_select", "groups", "ownerA", `id=eq.${ids.groupA}`, "ownerB", `id=eq.${ids.groupA}`);
  await writePair(ctx, "groups_admin_insert", "POST", "groups", "ownerA", { id: groupId, name: "007 baseline disposable group", [ctx.migrationVersions?.includes("0014") ? "owner_id" : "admin_id"]: ids.ownerA }, "ownerB", { id: crypto.randomUUID(), name: "spoofed group", [ctx.migrationVersions?.includes("0014") ? "owner_id" : "admin_id"]: ids.ownerA });
  const groupUpdate = await request(ctx, "ownerA", "groups", "PATCH", `id=eq.${ids.groupA}&select=id`, { name: "007 Baseline Group A (temporary update)" });
  await record(ctx, "policy:groups_admin_update.allow", groupUpdate.response.ok && nonempty(groupUpdate.body), `HTTP ${groupUpdate.response.status}; owner updates group`);
  const groupUpdateDeny = await request(ctx, "ownerB", "groups", "PATCH", `id=eq.${ids.groupA}&select=id`, { name: "spoofed" });
  await record(ctx, "policy:groups_admin_update.deny", groupUpdateDeny.response.ok && empty(groupUpdateDeny.body), `HTTP ${groupUpdateDeny.response.status}; non-owner update hidden`);
  const groupDelete = await request(ctx, "ownerA", "groups", "DELETE", `id=eq.${groupId}&select=id`);
  await record(ctx, "policy:groups_admin_delete.allow", groupDelete.response.ok && nonempty(groupDelete.body), `HTTP ${groupDelete.response.status}; owner deletes disposable group`);
  const groupDeleteDeny = await request(ctx, "ownerB", "groups", "DELETE", `id=eq.${ids.groupA}&select=id`);
  await record(ctx, "policy:groups_admin_delete.deny", groupDeleteDeny.response.ok && empty(groupDeleteDeny.body), `HTTP ${groupDeleteDeny.response.status}; non-owner delete hidden`);

  await request(ctx, "ownerA", "groups", "POST", "select=id", { id: membershipGroupId, name: "007 direct-membership policy fixture", [ctx.migrationVersions?.includes("0014") ? "owner_id" : "admin_id"]: ids.ownerA });
  const serviceForMembership = ctx.serviceHeaders();
  await ctx.request("/rest/v1/group_students", "ownerA", { method: "POST", headers: serviceForMembership, body: JSON.stringify({ group_id: membershipGroupId, student_id: ids.participantA }) });
  await readPair(ctx, "group_students_admin_select", "group_students", "ownerA", `group_id=eq.${ids.groupA}&student_id=eq.${ids.participantA}`, "ownerB", `group_id=eq.${ids.groupA}&student_id=eq.${ids.participantA}`);
  await writePair(ctx, "group_students_admin_insert", "POST", "group_students", "ownerA", tempMembership, "ownerB", { group_id: ids.groupA, student_id: ids.unrelated });
  const memberUpdate = await request(ctx, "ownerA", "group_students", "PATCH", `group_id=eq.${membershipGroupId}&student_id=eq.${ids.unrelated}&select=group_id,student_id`, { student_id: ids.unrelated });
  await record(ctx, "policy:group_students_admin_update.allow", memberUpdate.response.ok && nonempty(memberUpdate.body), `HTTP ${memberUpdate.response.status}; owner updates membership`);
  const memberUpdateDeny = await request(ctx, "ownerB", "group_students", "PATCH", `group_id=eq.${membershipGroupId}&student_id=eq.${ids.unrelated}&select=group_id`, { student_id: ids.participantA });
  await record(ctx, "policy:group_students_admin_update.deny", memberUpdateDeny.response.ok && empty(memberUpdateDeny.body), `HTTP ${memberUpdateDeny.response.status}; non-owner update hidden`);
  const memberDeleteDeny = await request(ctx, "ownerB", "group_students", "DELETE", `group_id=eq.${membershipGroupId}&student_id=eq.${ids.participantA}&select=group_id`);
  await record(ctx, "policy:group_students_admin_delete.deny", memberDeleteDeny.response.ok && empty(memberDeleteDeny.body), `HTTP ${memberDeleteDeny.response.status}; non-owner delete hidden`);
  const memberDelete = await request(ctx, "ownerA", "group_students", "DELETE", `group_id=eq.${membershipGroupId}&student_id=eq.${ids.participantA}&select=group_id`);
  await record(ctx, "policy:group_students_admin_delete.allow", memberDelete.response.ok && nonempty(memberDelete.body), `HTTP ${memberDelete.response.status}; owner deletes disposable membership; response body=${memberDelete.rawBody}`);

  await readPair(ctx, "exams_admin_select", "exams", "ownerA", `id=eq.${ids.examA}`, "ownerB", `id=eq.${ids.examA}`);
  await writePair(ctx, "exams_admin_insert", "POST", "exams", "ownerA", { id: examId, title: "007 disposable exam", description: "fixture", start_time: new Date(Date.now() + 3600000).toISOString(), duration_minutes: 60, [ctx.migrationVersions?.includes("0014") ? "owner_id" : "admin_id"]: ids.ownerA }, "ownerB", { id: crypto.randomUUID(), title: "spoofed", description: "fixture", start_time: new Date(Date.now() + 3600000).toISOString(), duration_minutes: 60, [ctx.migrationVersions?.includes("0014") ? "owner_id" : "admin_id"]: ids.ownerA });
  const examUpdate = await request(ctx, "ownerA", "exams", "PATCH", `id=eq.${examId}&select=id`, { title: "007 disposable exam (temporary update)" });
  await record(ctx, "policy:exams_admin_update.allow", examUpdate.response.ok && nonempty(examUpdate.body), `HTTP ${examUpdate.response.status}; owner updates exam`);
  const examUpdateDeny = await request(ctx, "ownerB", "exams", "PATCH", `id=eq.${examId}&select=id`, { title: "spoofed" });
  await record(ctx, "policy:exams_admin_update.deny", examUpdateDeny.response.ok && empty(examUpdateDeny.body), `HTTP ${examUpdateDeny.response.status}; non-owner update hidden`);
  const examDeleteDeny = await request(ctx, "ownerB", "exams", "DELETE", `id=eq.${ids.examA}&select=id`);
  await record(ctx, "policy:exams_admin_delete.deny", examDeleteDeny.response.ok && empty(examDeleteDeny.body), `HTTP ${examDeleteDeny.response.status}; non-owner delete hidden`);
  await readPair(ctx, "exams_student_select", "exams", "participantA", `id=eq.${ids.examRpc}`, "ownerB", `id=eq.${ids.examRpc}`);

  await readPair(ctx, "exam_permissions_admin_select", "exam_permissions", "ownerA", `exam_id=eq.${ids.examA}`, "ownerB", `exam_id=eq.${ids.examA}`);
  const extraGroup = await request(ctx, "ownerA", "groups", "POST", "select=id", { id: extraGroupId, name: "007 permission fixture", [ctx.migrationVersions?.includes("0014") ? "owner_id" : "admin_id"]: ids.ownerA });
  // 0017 grants INSERT only on exam_id/group_id; use that natural key for the preserved CRUD assertions.
  await writePair(ctx, "exam_permissions_admin_insert", "POST", "exam_permissions", "ownerA", { exam_id: ids.examA, group_id: extraGroupId }, "ownerB", { exam_id: ids.examA, group_id: ids.groupA });
  const permissionRowFilter = `exam_id=eq.${ids.examA}&group_id=eq.${extraGroupId}`;
  const permissionUpdate = await request(ctx, "ownerA", "exam_permissions", "PATCH", `${permissionRowFilter}&select=id`, { group_id: extraGroupId });
  await record(ctx, "policy:exam_permissions_admin_update.allow", permissionUpdate.response.ok && nonempty(permissionUpdate.body), `HTTP ${permissionUpdate.response.status}; owner updates permission`);
  const permissionUpdateDeny = await request(ctx, "ownerB", "exam_permissions", "PATCH", `${permissionRowFilter}&select=id`, { group_id: extraGroupId });
  await record(ctx, "policy:exam_permissions_admin_update.deny", permissionUpdateDeny.response.ok && empty(permissionUpdateDeny.body), `HTTP ${permissionUpdateDeny.response.status}; non-owner update hidden`);
  const permissionDelete = await request(ctx, "ownerA", "exam_permissions", "DELETE", `${permissionRowFilter}&select=id`);
  await record(ctx, "policy:exam_permissions_admin_delete.allow", permissionDelete.response.ok && nonempty(permissionDelete.body), `HTTP ${permissionDelete.response.status}; owner deletes permission`);
  const permissionDeleteDeny = await request(ctx, "ownerB", "exam_permissions", "DELETE", `exam_id=eq.${ids.examA}&group_id=eq.${ids.groupA}&select=id`);
  await record(ctx, "policy:exam_permissions_admin_delete.deny", permissionDeleteDeny.response.ok && empty(permissionDeleteDeny.body), `HTTP ${permissionDeleteDeny.response.status}; non-owner delete hidden`);
  await ctx.request(`/rest/v1/groups?id=eq.${extraGroupId}`, "ownerA", { method: "DELETE", headers: ctx.serviceHeaders() });
  await readPair(ctx, "exam_permissions_student_select", "exam_permissions", "participantA", `exam_id=eq.${ids.examRpc}`, "ownerB", `exam_id=eq.${ids.examRpc}`);

  await writePair(ctx, "questions_admin_insert", "POST", "questions", "ownerA", { id: questionId, exam_id: examId, type: "mcq", text: "007 disposable question", points: 1, order: 2 }, "ownerB", { id: crypto.randomUUID(), exam_id: examId, type: "mcq", text: "spoofed", points: 1, order: 2 });
  await readPair(ctx, "questions_admin_select", "questions", "ownerA", `id=eq.${questionId}`, "ownerB", `id=eq.${questionId}`);
  const questionUpdate = await request(ctx, "ownerA", "questions", "PATCH", `id=eq.${questionId}&select=id`, { text: "007 disposable question (temporary update)" });
  await record(ctx, "policy:questions_admin_update.allow", questionUpdate.response.ok && nonempty(questionUpdate.body), `HTTP ${questionUpdate.response.status}; owner updates question`);
  const questionUpdateDeny = await request(ctx, "ownerB", "questions", "PATCH", `id=eq.${questionId}&select=id`, { text: "spoofed" });
  await record(ctx, "policy:questions_admin_update.deny", questionUpdateDeny.response.ok && empty(questionUpdateDeny.body), `HTTP ${questionUpdateDeny.response.status}; non-owner update hidden`);
  const questionDeleteDeny = await request(ctx, "ownerB", "questions", "DELETE", `id=eq.${questionId}&select=id`);
  await record(ctx, "policy:questions_admin_delete.deny", questionDeleteDeny.response.ok && empty(questionDeleteDeny.body), `HTTP ${questionDeleteDeny.response.status}; non-owner delete hidden`);
  const questionDelete = await request(ctx, "ownerA", "questions", "DELETE", `id=eq.${questionId}&select=id`);
  await record(ctx, "policy:questions_admin_delete.allow", questionDelete.response.ok && nonempty(questionDelete.body), `HTTP ${questionDelete.response.status}; owner deletes disposable question`);

  const examDelete = await request(ctx, "ownerA", "exams", "DELETE", `id=eq.${examId}&select=id`);
  await record(ctx, "policy:exams_admin_delete.allow", examDelete.response.ok && nonempty(examDelete.body), `HTTP ${examDelete.response.status}; owner deletes disposable exam after its questions`);

  const participantAttemptRead = await request(ctx, "participantA", "exam_attempts", "GET", `id=eq.${ids.attemptA}`);
  const attemptAclAllows = participantAttemptRead.response.ok && nonempty(participantAttemptRead.body);
  await record(ctx, "policy:exam_attempts_student_select.allow", attemptAclAllows, `HTTP ${participantAttemptRead.response.status}; current schema grant/RLS outcome ${JSON.stringify(participantAttemptRead.body)}`);
  const unrelatedAttemptRead = await request(ctx, "unrelated", "exam_attempts", "GET", `id=eq.${ids.attemptA}`);
  await record(ctx, "policy:exam_attempts_student_select.deny", !unrelatedAttemptRead.response.ok || empty(unrelatedAttemptRead.body), `HTTP ${unrelatedAttemptRead.response.status}; unrelated actor gets no attempt`);
  const ownerAttemptRead = await request(ctx, "ownerA", "exam_attempts", "GET", `id=eq.${ids.attemptA}`);
  await record(ctx, "policy:exam_attempts_admin_select.allow", ownerAttemptRead.response.ok && nonempty(ownerAttemptRead.body), `HTTP ${ownerAttemptRead.response.status}; current schema grant/RLS outcome ${JSON.stringify(ownerAttemptRead.body)}`);
  const otherOwnerAttemptRead = await request(ctx, "ownerB", "exam_attempts", "GET", `id=eq.${ids.attemptA}`);
  await record(ctx, "policy:exam_attempts_admin_select.deny", !otherOwnerAttemptRead.response.ok || empty(otherOwnerAttemptRead.body), `HTTP ${otherOwnerAttemptRead.response.status}; other owner gets no attempt`);
  await readPair(ctx, "answers_student_select", "answers", "participantA", `attempt_id=eq.${ids.attemptA}`, "unrelated", `attempt_id=eq.${ids.attemptA}`);
  await readPair(ctx, "answers_admin_select", "answers", "ownerA", `attempt_id=eq.${ids.attemptA}`, "ownerB", `attempt_id=eq.${ids.attemptA}`);

  // Restore the baseline relationships and mutable fixture labels changed by allow cases.
  const service = ctx.serviceHeaders();
  await ctx.request(`/rest/v1/groups?id=eq.${ids.groupA}`, "ownerA", { method: "PATCH", headers: service, body: JSON.stringify({ name: "007 Baseline Group A" }) });
  await ctx.request(`/rest/v1/exam_attempts?exam_id=in.(${ids.examRpc},${ids.examEdge})&student_id=eq.${ids.unrelated}`, "ownerA", { method: "DELETE", headers: service });
  await ctx.request(`/rest/v1/group_students?group_id=eq.${ids.groupA}&student_id=eq.${ids.participantA}`, "ownerA", { method: "POST", headers: { ...service, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ group_id: ids.groupA, student_id: ids.participantA }) });
  await ctx.request(`/rest/v1/exam_permissions?exam_id=eq.${ids.examA}&group_id=eq.${ids.groupA}`, "ownerA", { method: "POST", headers: { ...service, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ exam_id: ids.examA, group_id: ids.groupA }) });
  await ctx.request(`/rest/v1/groups?id=eq.${membershipGroupId}`, "ownerA", { method: "DELETE", headers: service });
  await ctx.request(`/rest/v1/groups?id=eq.${extraGroupId}`, "ownerA", { method: "DELETE", headers: service });
}

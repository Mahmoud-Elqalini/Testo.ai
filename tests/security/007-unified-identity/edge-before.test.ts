import { record, parseJson, stringField, isRecord, type SecurityTestContext } from "./context.ts";

const ids = {
  participantA: "a7000000-0000-4000-8000-000000000003",
  ownerA: "a7000000-0000-4000-8000-000000000001",
  unrelated: "a7000000-0000-4000-8000-000000000004",
  participantAttempt: "e7000000-0000-4000-8000-000000000003",
  examEdge: "c7000000-0000-4000-8000-000000000004",
  questionEdge: "d7000000-0000-4000-8000-000000000003",
};

async function call(ctx: SecurityTestContext, endpoint: string, actor: string | undefined, method: string, data: Record<string, unknown>, query = "") {
  const response = await ctx.request(`/functions/v1/${endpoint}${query}`, actor, {
    method,
    headers: { apikey: ctx.anonKey, ...(actor ? {} : {}) },
    ...(method === "GET" ? {} : { body: JSON.stringify(data) }),
  });
  return { response, body: parseJson(await response.text()) };
}

function valid(body: unknown) { return isRecord(body) && !body.error && !body.denial_reason; }
function diagnostic(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}
function unauthorized(response: Response, body: unknown) {
  return (response.status === 401 || response.status === 403) && !valid(body);
}

export async function runEdgeCases(ctx: SecurityTestContext) {
  const service = ctx.serviceHeaders();
  const examUrl = `/rest/v1/exams?id=eq.${ids.examEdge}`;
  // Use the manifest ID: the current schema intentionally has no authenticated SELECT grant on exam_attempts.
  const attemptId = ids.participantAttempt;

  // Warm every function through its real CORS preflight handler before the
  // security cases. The first cold Edge Runtime request can otherwise return
  // a transient 503 and make all session-dependent cases meaningless.
  for (const endpoint of ["start-attempt", "get-exam-questions", "save-answer", "submit-attempt"]) {
    await ctx.request(`/functions/v1/${endpoint}`, undefined, { method: "OPTIONS" });
  }

  const start = await call(ctx, "start-attempt", "participantA", "POST", { attempt_id: attemptId, student_id: ids.unrelated });
  const sessionId = stringField(start.body, "session_id");
  const startAllowed = start.response.ok && valid(start.body) && typeof sessionId === "string";
  await record(ctx, "edge:start-attempt/index.ts.allow", startAllowed, `HTTP ${start.response.status}; authorized participant starts their attempt; response=${diagnostic(start.body)}`);
  const startDeny = await call(ctx, "start-attempt", "unrelated", "POST", { attempt_id: attemptId, student_id: ids.participantA });
  await record(ctx, "edge:start-attempt/index.ts.deny", unauthorized(startDeny.response, startDeny.body), `HTTP ${startDeny.response.status}; unrelated participant denied despite spoofed body student_id`);
  const startAnon = await call(ctx, "start-attempt", undefined, "POST", { attempt_id: attemptId });
  await record(ctx, "edge:start-attempt/index.ts.anon", unauthorized(startAnon.response, startAnon.body), `HTTP ${startAnon.response.status}; anon denied`);

  // Keep denial/anonymous cases independent if the authorized start fails;
  // never send an undefined session_id and turn a prerequisite failure into
  // misleading 400s for every downstream route.
  const requestSessionId = typeof sessionId === "string" ? sessionId : "a7000000-0000-4000-8000-000000000099";
  const get = await call(ctx, "get-exam-questions", "participantA", "GET", {}, `?attempt_id=${attemptId}&session_id=${requestSessionId}&student_id=${ids.unrelated}`);
  const safe = get.response.ok && valid(get.body) && !JSON.stringify(get.body).includes("correct_choice") && !JSON.stringify(get.body).includes("reference_answers");
  await record(ctx, "edge:get-exam-questions/index.ts.allow", safe, `HTTP ${get.response.status}; questions omit answer keys; response=${diagnostic(get.body)}`);
  const getDeny = await call(ctx, "get-exam-questions", "unrelated", "GET", {}, `?attempt_id=${attemptId}&session_id=${requestSessionId}&student_id=${ids.participantA}`);
  await record(ctx, "edge:get-exam-questions/index.ts.deny", unauthorized(getDeny.response, getDeny.body), `HTTP ${getDeny.response.status}; unrelated user denied despite URL identity spoofing`);
  const getAnon = await call(ctx, "get-exam-questions", undefined, "GET", {}, `?attempt_id=${attemptId}&session_id=${requestSessionId}`);
  await record(ctx, "edge:get-exam-questions/index.ts.anon", unauthorized(getAnon.response, getAnon.body), `HTTP ${getAnon.response.status}; anon denied`);

  const save = await call(ctx, "save-answer", "participantA", "POST", { attempt_id: attemptId, session_id: requestSessionId, question_id: ids.questionEdge, mcq_answer: "a", essay_answer: null, student_id: ids.unrelated });
  await record(ctx, "edge:save-answer/index.ts.allow", save.response.ok && valid(save.body), `HTTP ${save.response.status}; participant saves valid answer; response=${diagnostic(save.body)}`);
  const saveDeny = await call(ctx, "save-answer", "unrelated", "POST", { attempt_id: attemptId, session_id: requestSessionId, question_id: ids.questionEdge, mcq_answer: "a", essay_answer: null, student_id: ids.participantA });
  await record(ctx, "edge:save-answer/index.ts.deny", unauthorized(saveDeny.response, saveDeny.body), `HTTP ${saveDeny.response.status}; foreign attempt rejected despite spoofed body identity`);
  const saveAnon = await call(ctx, "save-answer", undefined, "POST", { attempt_id: attemptId, session_id: requestSessionId, question_id: ids.questionEdge, mcq_answer: "a", essay_answer: null });
  await record(ctx, "edge:save-answer/index.ts.anon", unauthorized(saveAnon.response, saveAnon.body), `HTTP ${saveAnon.response.status}; anon denied`);

  const submit = await call(ctx, "submit-attempt", "participantA", "POST", { attempt_id: attemptId, session_id: requestSessionId, student_id: ids.unrelated });
  await record(ctx, "edge:submit-attempt/index.ts.allow", submit.response.ok && valid(submit.body), `HTTP ${submit.response.status}; participant submits own attempt; response=${diagnostic(submit.body)}`);
  const submitDeny = await call(ctx, "submit-attempt", "unrelated", "POST", { attempt_id: attemptId, session_id: requestSessionId, student_id: ids.participantA });
  await record(ctx, "edge:submit-attempt/index.ts.deny", unauthorized(submitDeny.response, submitDeny.body), `HTTP ${submitDeny.response.status}; unrelated caller denied despite spoofed body identity`);
  const submitAnon = await call(ctx, "submit-attempt", undefined, "POST", { attempt_id: attemptId, session_id: requestSessionId });
  await record(ctx, "edge:submit-attempt/index.ts.anon", unauthorized(submitAnon.response, submitAnon.body), `HTTP ${submitAnon.response.status}; anon denied`);

  await ctx.request(`/rest/v1/exam_attempts?id=eq.${attemptId}`, "ownerA", { method: "DELETE", headers: service });
  await ctx.request(examUrl, "ownerA", { method: "DELETE", headers: service });
}

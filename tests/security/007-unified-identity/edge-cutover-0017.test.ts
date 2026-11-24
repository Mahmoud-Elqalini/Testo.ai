import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createContext, isRecord, parseJson, record, stringField, type SecurityTestContext } from "./context.ts";
import { resetStaticAttemptForEdgeCases } from "./edge-attempt-reset.ts";

const ids = {
  participantA: "a7000000-0000-4000-8000-000000000003",
  unrelated: "a7000000-0000-4000-8000-000000000004",
  attempt: "e7000000-0000-4000-8000-000000000003",
  question: "d7000000-0000-4000-8000-000000000003",
};
const wrongSessionId = "a7000000-0000-4000-8000-000000000099";

async function call(ctx: SecurityTestContext, endpoint: string, actor: string | undefined, method: string, body: Record<string, unknown>, query = "") {
  const response = await ctx.request(`/functions/v1/${endpoint}${query}`, actor, {
    method,
    headers: { apikey: ctx.anonKey },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: parseJson(await response.text()) };
}

function accepted(response: Response, body: unknown) {
  return response.ok && isRecord(body) && !body.error && !body.denial_reason;
}
function denied(response: Response, body: unknown) {
  return [401, 403].includes(response.status) && !accepted(response, body);
}
function detail(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}
function sessionIdFrom(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const sessionId = (body as Record<string, unknown>).session_id;
  return typeof sessionId === "string" ? sessionId : null;
}

export async function runEdgeCutoverCases(ctx: SecurityTestContext) {
  resetStaticAttemptForEdgeCases(ctx);

  for (const endpoint of ["start-attempt", "get-exam-questions", "save-answer", "submit-attempt"]) {
    await ctx.request(`/functions/v1/${endpoint}`, undefined, { method: "OPTIONS" });
  }

  // The participant JWT is authoritative even when request data names someone
  // else. The cutover must forward that JWT to the database RPC, never trust
  // body/query identity or use a service-role call with a client-supplied ID.
  const start = await call(ctx, "start-attempt", "participantA", "POST", {
    attempt_id: ids.attempt, student_id: ids.unrelated,
  });
  const sessionId = sessionIdFrom(start.body) ?? "";
  await record(ctx, "edge-cutover:start_attempt.jwt_authoritative", accepted(start.response, start.body) && Boolean(sessionId),
    `HTTP ${start.response.status}; participant JWT controls attempt despite spoofed student_id; returned session_id=${sessionId || "missing"}; ${detail(start.body)}`);
  const foreignStart = await call(ctx, "start-attempt", "unrelated", "POST", {
    attempt_id: ids.attempt, student_id: ids.participantA,
  });
  await record(ctx, "edge-cutover:start_attempt.spoof_denied", denied(foreignStart.response, foreignStart.body),
    `HTTP ${foreignStart.response.status}; unrelated JWT cannot start participant attempt; ${detail(foreignStart.body)}`);

  const get = await call(ctx, "get-exam-questions", "participantA", "GET", {},
    `?attempt_id=${ids.attempt}&session_id=${sessionId}&student_id=${ids.unrelated}`);
  const safeQuestions = accepted(get.response, get.body)
    && !JSON.stringify(get.body).includes("correct_choice")
    && !JSON.stringify(get.body).includes("reference_answers");
  await record(ctx, "edge-cutover:get_questions.jwt_and_projection", safeQuestions,
    `HTTP ${get.response.status}; caller JWT authorizes and answer keys are absent; ${detail(get.body)}`);
  const wrongSessionGet = await call(ctx, "get-exam-questions", "participantA", "GET", {},
    `?attempt_id=${ids.attempt}&session_id=${wrongSessionId}`);
  await record(ctx, "edge-cutover:get_questions.wrong_session_denied",
    wrongSessionGet.response.status === 403 && stringField(wrongSessionGet.body, "error") === "access_denied",
    `HTTP ${wrongSessionGet.response.status}; authenticated participant with the wrong session is denied; ${detail(wrongSessionGet.body)}`);
  const foreignGet = await call(ctx, "get-exam-questions", "unrelated", "GET", {},
    `?attempt_id=${ids.attempt}&session_id=${sessionId}&student_id=${ids.participantA}`);
  await record(ctx, "edge-cutover:get_questions.spoof_denied", denied(foreignGet.response, foreignGet.body),
    `HTTP ${foreignGet.response.status}; unrelated JWT cannot read questions by spoofing student_id; ${detail(foreignGet.body)}`);

  const saveBody = { attempt_id: ids.attempt, session_id: sessionId, question_id: ids.question,
    mcq_answer: "a", essay_answer: null, student_id: ids.unrelated };
  const save = await call(ctx, "save-answer", "participantA", "POST", saveBody);
  await record(ctx, "edge-cutover:save_answer.jwt_authoritative", accepted(save.response, save.body),
    `HTTP ${save.response.status}; caller JWT controls answer write; ${detail(save.body)}`);
  const foreignSave = await call(ctx, "save-answer", "unrelated", "POST", { ...saveBody, student_id: ids.participantA });
  await record(ctx, "edge-cutover:save_answer.spoof_denied", denied(foreignSave.response, foreignSave.body),
    `HTTP ${foreignSave.response.status}; unrelated JWT cannot save to participant attempt; ${detail(foreignSave.body)}`);

  const submitBody = { attempt_id: ids.attempt, session_id: sessionId, student_id: ids.unrelated };
  const submit = await call(ctx, "submit-attempt", "participantA", "POST", submitBody);
  await record(ctx, "edge-cutover:submit_attempt.jwt_authoritative", accepted(submit.response, submit.body),
    `HTTP ${submit.response.status}; caller JWT controls submit; ${detail(submit.body)}`);
  const foreignSubmit = await call(ctx, "submit-attempt", "unrelated", "POST", { ...submitBody, student_id: ids.participantA });
  await record(ctx, "edge-cutover:submit_attempt.spoof_denied", denied(foreignSubmit.response, foreignSubmit.body),
    `HTTP ${foreignSubmit.response.status}; unrelated JWT cannot submit participant attempt; ${detail(foreignSubmit.body)}`);

  for (const [endpoint, method, body] of [
    ["start-attempt", "POST", { attempt_id: ids.attempt }],
    ["get-exam-questions", "GET", {}],
    ["save-answer", "POST", { attempt_id: ids.attempt, session_id: sessionId, question_id: ids.question }],
    ["submit-attempt", "POST", { attempt_id: ids.attempt, session_id: sessionId }],
  ] as const) {
    const query = endpoint === "get-exam-questions" ? `?attempt_id=${ids.attempt}&session_id=${sessionId}` : "";
    const result = await call(ctx, endpoint, undefined, method, body, query);
    await record(ctx, `edge-cutover:${endpoint}.anonymous_denied`, denied(result.response, result.body),
      `HTTP ${result.response.status}; anonymous request is denied; ${detail(result.body)}`);
  }

  const anonymousValidSave = await call(ctx, "save-answer", undefined, "POST", {
    attempt_id: ids.attempt, session_id: sessionId, question_id: ids.question,
    mcq_answer: "a", essay_answer: null,
  });
  await record(ctx, "edge-cutover:save_answer.anonymous_valid_body_denied",
    anonymousValidSave.response.status === 401 && stringField(anonymousValidSave.body, "error") === "unauthorized",
    `HTTP ${anonymousValidSave.response.status}; valid anonymous save body is rejected by authentication; ${detail(anonymousValidSave.body)}`);

  const anonymousMalformedSave = await call(ctx, "save-answer", undefined, "POST", { attempt_id: "not-a-uuid" });
  await record(ctx, "edge-cutover:save_answer.anonymous_malformed_body_denied",
    anonymousMalformedSave.response.status === 401 && stringField(anonymousMalformedSave.body, "error") === "unauthorized",
    `HTTP ${anonymousMalformedSave.response.status}; malformed anonymous save body is rejected by authentication; ${detail(anonymousMalformedSave.body)}`);

  const anonymousMalformedCases = [
    { endpoint: "get-exam-questions", method: "GET", body: {}, query: `?session_id=${sessionId}`, field: "missing attempt_id" },
    { endpoint: "get-exam-questions", method: "GET", body: {}, query: `?attempt_id=not-a-uuid&session_id=${sessionId}`, field: "invalid attempt_id" },
    { endpoint: "get-exam-questions", method: "GET", body: {}, query: `?attempt_id=${ids.attempt}`, field: "missing session_id" },
    { endpoint: "get-exam-questions", method: "GET", body: {}, query: `?attempt_id=${ids.attempt}&session_id=not-a-uuid`, field: "invalid session_id" },
    { endpoint: "submit-attempt", method: "POST", body: { session_id: sessionId }, query: "", field: "missing attempt_id" },
    { endpoint: "submit-attempt", method: "POST", body: { attempt_id: "not-a-uuid", session_id: sessionId }, query: "", field: "invalid attempt_id" },
    { endpoint: "submit-attempt", method: "POST", body: { attempt_id: ids.attempt }, query: "", field: "missing session_id" },
    { endpoint: "submit-attempt", method: "POST", body: { attempt_id: ids.attempt, session_id: "not-a-uuid" }, query: "", field: "invalid session_id" },
  ] as const;
  for (const testCase of anonymousMalformedCases) {
    const result = await call(ctx, testCase.endpoint, undefined, testCase.method, testCase.body, testCase.query);
    await record(ctx, `edge-cutover:${testCase.endpoint}.anonymous_malformed_${testCase.field.replaceAll(" ", "_")}`,
      result.response.status === 401 && stringField(result.body, "error") === "unauthorized",
      `HTTP ${result.response.status}; anonymous request with ${testCase.field} is rejected by authentication; ${detail(result.body)}`);
  }
}

async function main() {
  const ctx = await createContext("0017");
  await runEdgeCutoverCases(ctx);
  const failures = ctx.results.filter((item) => item.status !== "PASS");
  console.log(JSON.stringify({ caseCount: ctx.results.length, passCount: ctx.results.length - failures.length,
    failCount: failures.length, results: ctx.results }, null, 2));
  if (failures.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

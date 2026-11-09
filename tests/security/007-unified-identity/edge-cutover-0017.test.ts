import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createContext, parseJson, record } from "./context.ts";

const ids = {
  participantA: "a7000000-0000-4000-8000-000000000003",
  unrelated: "a7000000-0000-4000-8000-000000000004",
  attempt: "e7000000-0000-4000-8000-000000000003",
  question: "d7000000-0000-4000-8000-000000000003",
};

async function call(ctx: any, endpoint: string, actor: string | undefined, method: string, body: Record<string, unknown>, query = "") {
  const response = await ctx.request(`/functions/v1/${endpoint}${query}`, actor, {
    method,
    headers: { apikey: ctx.anonKey },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: parseJson(await response.text()) };
}

function accepted(response: Response, body: any) {
  return response.ok && body && typeof body === "object" && !body.error && !body.denial_reason;
}
function denied(response: Response, body: unknown) {
  return [401, 403].includes(response.status) && !accepted(response, body);
}
function detail(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

export async function runEdgeCutoverCases(ctx: any) {
  for (const endpoint of ["start-attempt", "get-exam-questions", "save-answer", "submit-attempt"]) {
    await ctx.request(`/functions/v1/${endpoint}`, undefined, { method: "OPTIONS" });
  }

  // The participant JWT is authoritative even when request data names someone
  // else. The cutover must forward that JWT to the database RPC, never trust
  // body/query identity or use a service-role call with a client-supplied ID.
  const sessionId = "a7000000-0000-4000-8000-000000000099";
  const start = await call(ctx, "start-attempt", "participantA", "POST", {
    attempt_id: ids.attempt, student_id: ids.unrelated,
  });
  await record(ctx, "edge-cutover:start_attempt.jwt_authoritative", accepted(start.response, start.body),
    `HTTP ${start.response.status}; participant JWT controls attempt despite spoofed student_id; ${detail(start.body)}`);
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

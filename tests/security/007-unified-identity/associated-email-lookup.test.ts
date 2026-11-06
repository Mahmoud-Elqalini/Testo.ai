import { record, parseJson } from "./context.ts";

const ownerA = "ownerA";
const ownerB = "ownerB";
const groupA = "b7000000-0000-4000-8000-000000000001";
const examA = "c7000000-0000-4000-8000-000000000001";
const groupB = "b7000000-0000-4000-8000-000000000002";
const participantEmail = "participant-a-007@example.test";
const unrelatedEmail = "unrelated-007@example.test";
const missingEmail = "missing-007@example.test";

async function lookup(ctx: any, actor: string, kind: "group" | "exam", id: string, email: string) {
  const started = performance.now();
  const response = await ctx.request("/rest/v1/rpc/lookup_associated_participant", actor, {
    method: "POST",
    body: JSON.stringify({ p_context_kind: kind, p_context_id: id, p_email: email }),
  });
  const elapsedMs = performance.now() - started;
  return { response, body: parseJson(await response.text()), elapsedMs };
}

function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value as Record<string, unknown>[] : []; }
function responseShape(status: number, body: unknown) {
  const responseRows = rows(body);
  return `${status}:${responseRows.map((row) => Object.keys(row).sort().join(",")).sort().join(";")}:${responseRows.length}`;
}
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

async function resetFixtureLimits(ctx: any) {
  const exists = ctx.runSql("SELECT to_regclass('private.associated_profile_lookup_rate_limits') IS NOT NULL").trim() === "t";
  if (exists) ctx.runSql(`DELETE FROM private.associated_profile_lookup_rate_limits WHERE requester_id IN ('a7000000-0000-4000-8000-000000000001'::uuid,'a7000000-0000-4000-8000-000000000002'::uuid) AND context_id IN ('${groupA}'::uuid,'${examA}'::uuid,'${groupB}'::uuid)`);
}

export async function runAssociatedEmailLookupCases(ctx: any) {
  await resetFixtureLimits(ctx);
  try {
    const relationshipsBefore = ctx.runSql(`SELECT (SELECT count(*) FROM public.group_students WHERE group_id='${groupA}'::uuid)::text || ':' || (SELECT count(*) FROM public.exam_permissions WHERE exam_id='${examA}'::uuid)::text`).trim();
    const associated = await lookup(ctx, ownerA, "group", groupA, participantEmail);
    const successRows = rows(associated.body);
    const endpointAvailable = associated.response.ok;
    await record(ctx, "contract:email_lookup.associated_exact_allow",
      associated.response.ok && successRows.length === 1 && successRows[0].id === "a7000000-0000-4000-8000-000000000003" && successRows[0].display_name === "007 Participant A",
      `HTTP ${associated.response.status}; associated exact email resolves to id and display name`);
    await record(ctx, "contract:email_lookup.email_never_returned",
      successRows.length === 1 && Object.keys(successRows[0]).sort().join(",") === "display_name,id" && !JSON.stringify(associated.body).includes(participantEmail),
      "lookup response contains only id and display_name, never the email");

    const partial = await lookup(ctx, ownerA, "group", groupA, "participant-a-007");
    await record(ctx, "contract:email_lookup.partial_not_match",
      endpointAvailable && partial.response.status !== 404 && partial.response.ok && rows(partial.body).length === 0,
      "partial email search does not resolve an account");
    const nonOwner = await lookup(ctx, ownerB, "group", groupA, participantEmail);
    await record(ctx, "contract:email_lookup.non_owner_deny",
      endpointAvailable && (!nonOwner.response.ok || rows(nonOwner.body).length === 0),
      `HTTP ${nonOwner.response.status}; caller who does not own the context gets no account data`);

    ctx.runSql(`DELETE FROM public.group_students WHERE group_id='${groupA}'::uuid AND student_id='a7000000-0000-4000-8000-000000000003'::uuid`);
    try {
      const examAttemptHolder = await lookup(ctx, ownerA, "exam", examA, participantEmail);
      const examLookupRows = rows(examAttemptHolder.body);
      await record(ctx, "contract:email_lookup.exam_attempt_holder_allow",
        endpointAvailable && examAttemptHolder.response.ok && examLookupRows.length === 1 && examLookupRows[0].id === "a7000000-0000-4000-8000-000000000003",
        `HTTP ${examAttemptHolder.response.status}; an existing exam attempt preserves association after group membership removal`);
    } finally {
      ctx.runSql(`INSERT INTO public.group_students (group_id, student_id) VALUES ('${groupA}'::uuid,'a7000000-0000-4000-8000-000000000003'::uuid) ON CONFLICT DO NOTHING`);
    }

    await resetFixtureLimits(ctx);
    const missingSamples: Awaited<ReturnType<typeof lookup>>[] = [];
    const unrelatedSamples: Awaited<ReturnType<typeof lookup>>[] = [];
    for (let index = 0; index < 4; index += 1) {
      missingSamples.push(await lookup(ctx, ownerA, "group", groupA, missingEmail));
      unrelatedSamples.push(await lookup(ctx, ownerA, "group", groupA, unrelatedEmail));
    }
    const sameShape = missingSamples.every((result) => responseShape(result.response.status, result.body) === responseShape(unrelatedSamples[0].response.status, unrelatedSamples[0].body))
      && unrelatedSamples.every((result) => responseShape(result.response.status, result.body) === responseShape(missingSamples[0].response.status, missingSamples[0].body));
    await record(ctx, "contract:email_lookup.unassociated_missing_same_shape",
      endpointAvailable && sameShape && rows(missingSamples[0].body).length === 0 && rows(unrelatedSamples[0].body).length === 0,
      "unassociated and nonexistent email responses have identical status, row count, and field shape");

    // The server contract applies the same minimum response delay to both
    // branches. Pairwise timing assertions use multiple samples and a modest
    // tolerance to avoid treating network jitter as an existence signal.
    const missingAverage = average(missingSamples.map((result) => result.elapsedMs));
    const unrelatedAverage = average(unrelatedSamples.map((result) => result.elapsedMs));
    await record(ctx, "contract:email_lookup.uniform_timing",
      endpointAvailable && missingAverage >= 40 && unrelatedAverage >= 40 && Math.abs(missingAverage - unrelatedAverage) <= 25,
      `4-sample means missing=${missingAverage.toFixed(1)}ms, unassociated=${unrelatedAverage.toFixed(1)}ms; both must include the minimum delay and differ by at most 25ms`);

    // The fixed contract is 10 attempts per minute per requester/context.
    // Exhaust one scope, then prove another context and another owner/requester
    // retain an independent budget. Cleanup makes repeat runs deterministic.
    await resetFixtureLimits(ctx);
    const exhausted: Awaited<ReturnType<typeof lookup>>[] = [];
    for (let index = 0; index < 12; index += 1) exhausted.push(await lookup(ctx, ownerA, "group", groupA, missingEmail));
    const limitIndex = exhausted.findIndex((result) => result.response.status === 429);
    await record(ctx, "contract:email_lookup.rate_limit_enforced",
      limitIndex >= 0 && limitIndex >= 1 && limitIndex <= 10,
      `first HTTP 429 occurred at request ${limitIndex < 0 ? "never" : limitIndex + 1} of 12 (limit: 10 per minute)`);
    const isolatedContext = await lookup(ctx, ownerA, "exam", examA, missingEmail);
    await record(ctx, "contract:email_lookup.rate_limit_context_isolation",
      endpointAvailable && isolatedContext.response.status !== 404 && isolatedContext.response.status !== 429,
      `HTTP ${isolatedContext.response.status}; owner A's exam context has an independent limit`);
    const isolatedRequester = await lookup(ctx, ownerB, "group", groupB, missingEmail);
    await record(ctx, "contract:email_lookup.rate_limit_requester_isolation",
      endpointAvailable && isolatedRequester.response.status !== 404 && isolatedRequester.response.status !== 429,
      `HTTP ${isolatedRequester.response.status}; owner B has an independent requester/context limit`);
    const hasRateLimitTable = ctx.runSql("SELECT to_regclass('private.associated_profile_lookup_rate_limits') IS NOT NULL").trim() === "t";
    const rateLimitScopes = hasRateLimitTable
      ? Number(ctx.runSql(`SELECT count(*) FROM private.associated_profile_lookup_rate_limits WHERE (requester_id='a7000000-0000-4000-8000-000000000001'::uuid AND context_id IN ('${groupA}'::uuid,'${examA}'::uuid)) OR (requester_id='a7000000-0000-4000-8000-000000000002'::uuid AND context_id='${groupB}'::uuid)`).trim())
      : 0;
    await record(ctx, "contract:email_lookup.rate_limit_per_requester_context",
      rateLimitScopes === 3,
      `${rateLimitScopes} independent requester/context counters exist (expected 3)`);
    const relationshipsAfter = ctx.runSql(`SELECT (SELECT count(*) FROM public.group_students WHERE group_id='${groupA}'::uuid)::text || ':' || (SELECT count(*) FROM public.exam_permissions WHERE exam_id='${examA}'::uuid)::text`).trim();
    await record(ctx, "contract:email_lookup.no_relationship_mutation",
      relationshipsAfter === relationshipsBefore,
      `group membership/exam permission counts unchanged (${relationshipsBefore} → ${relationshipsAfter})`);
  } finally {
    await resetFixtureLimits(ctx);
  }
}

import { record, parseJson, type SecurityTestContext } from "./context.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ownerA = "ownerA";
const ownerB = "ownerB";
const groupA = "b7000000-0000-4000-8000-000000000001";
const examA = "c7000000-0000-4000-8000-000000000001";
const groupB = "b7000000-0000-4000-8000-000000000002";
const participantEmail = "participant-a-007@example.test";
const unrelatedEmail = "unrelated-007@example.test";
const missingEmail = "missing-007@example.test";

async function lookup(ctx: SecurityTestContext, actor: string, kind: "group" | "exam", id: string, email: string) {
  const started = performance.now();
  const response = await ctx.request("/rest/v1/rpc/lookup_associated_participant", actor, {
    method: "POST",
    body: JSON.stringify({ p_context_kind: kind, p_context_id: id, p_email: email }),
  });
  const rawBody = await response.text();
  const elapsedMs = performance.now() - started;
  return { response, body: parseJson(rawBody), rawBody, elapsedMs };
}

function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value as Record<string, unknown>[] : []; }
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}
function p99(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.99 * sorted.length) - 1];
}
function roundMs(value: number) { return Number(value.toFixed(3)); }
function summarize(samples: ReturnType<typeof toRawSample>[]) {
  const times = samples.map((sample) => sample.elapsedMs);
  return { sampleCount: samples.length, medianMs: roundMs(median(times)), p95Ms: roundMs(p95(times)), p99Ms: roundMs(p99(times)) };
}
function toRawSample(result: Awaited<ReturnType<typeof lookup>>) {
  return { elapsedMs: roundMs(result.elapsedMs), status: result.response.status, rawBody: result.rawBody };
}

async function resetFixtureLimits(ctx: SecurityTestContext) {
  const exists = ctx.runSql("SELECT to_regclass('private.associated_profile_lookup_rate_limits') IS NOT NULL").trim() === "t";
  if (exists) ctx.runSql(`DELETE FROM private.associated_profile_lookup_rate_limits WHERE requester_id IN ('a7000000-0000-4000-8000-000000000001'::uuid,'a7000000-0000-4000-8000-000000000002'::uuid) AND context_id IN ('${groupA}'::uuid,'${examA}'::uuid,'${groupB}'::uuid)`);
}

export async function runUniformTimingCase(ctx: SecurityTestContext, endpointAvailable = true) {
  try {
    await resetFixtureLimits(ctx);
    const sampleCount = 200;
    const timingGroupIds = Array.from({ length: sampleCount }, () => crypto.randomUUID());
    const groupValues = timingGroupIds.map((id, index) => `('${id}'::uuid,'007 timing context ${index}','a7000000-0000-4000-8000-000000000001'::uuid)`).join(",");
    const memberValues = timingGroupIds.map((id) => `('${id}'::uuid,'a7000000-0000-4000-8000-000000000003'::uuid)`).join(",");
    const contexts = timingGroupIds.map((id) => `'${id}'::uuid`).join(",");
    const standardSamples = { associated: [] as ReturnType<typeof toRawSample>[], unassociated: [] as ReturnType<typeof toRawSample>[], nonexistent: [] as ReturnType<typeof toRawSample>[] };
    const largeSamples = { unassociated: [] as ReturnType<typeof toRawSample>[], nonexistent: [] as ReturnType<typeof toRawSample>[] };
    const largeContextSamples = { unassociated: [] as ReturnType<typeof toRawSample>[], nonexistent: [] as ReturnType<typeof toRawSample>[] };
    const loadMarker = crypto.randomUUID().replaceAll("-", "");
    const loadEmailPrefix = `007-load-${loadMarker}-`;
    const loadUnassociatedEmail = `${loadEmailPrefix}2500@example.test`;
    // Five paired samples per context: 200 samples per case while staying under the per-context rate limit.
    const largeContextSamplesPerContext = 5;
    const largeContextIds = Array.from({ length: Math.ceil(sampleCount / largeContextSamplesPerContext) }, () => crypto.randomUUID());
    const largeContextGroupValues = largeContextIds.map((id, index) => `('${id}'::uuid,'007 large-context timing ${index}','a7000000-0000-4000-8000-000000000001'::uuid)`).join(",");
    const largeContextValues = largeContextIds.map((id) => `('${id}'::uuid)`).join(",");
    const largeContextSqlIds = largeContextIds.map((id) => `'${id}'::uuid`).join(",");
    let syntheticUsersCreated = 0;
    let syntheticUsersRemaining = 0;
    let syntheticCleanupVerified = false;
    let largeContextMemberCount = 0;
    let largeContextGroupsAtTargetSize = 0;
    let largeContextGroupsRemaining = 0;
    let largeContextMembershipsRemaining = 0;
    let largeContextPendingAttemptsRemaining = 0;
    let largeContextSyntheticUsersRemaining = 0;
    try {
      ctx.runSql(`INSERT INTO public.groups (id,name,owner_id) VALUES ${groupValues}; INSERT INTO public.group_students (group_id,student_id) VALUES ${memberValues}`);
      for (let index = 0; index < timingGroupIds.length; index += 1) {
        const contextId = timingGroupIds[index];
        const requests = [
          { key: "associated" as const, email: participantEmail },
          { key: "unassociated" as const, email: unrelatedEmail },
          { key: "nonexistent" as const, email: missingEmail },
        ];
        const rotation = index % requests.length;
        for (let offset = 0; offset < requests.length; offset += 1) {
          const item = requests[(offset + rotation) % requests.length];
          const result = await lookup(ctx, ownerA, "group", contextId, item.email);
          standardSamples[item.key].push(toRawSample(result));
        }
      }

      const loadPrefixSql = loadEmailPrefix.replaceAll("'", "''");
      ctx.runSql(`
        WITH shared_password AS (
          SELECT crypt('LocalOnly-007-load-test!', gen_salt('bf')) AS encrypted_password
        )
        INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin
        )
        SELECT
          gen_random_uuid(),
          '00000000-0000-0000-0000-000000000000'::uuid,
          'authenticated', 'authenticated',
          '${loadPrefixSql}' || generated.user_number || '@example.test',
          shared_password.encrypted_password,
          pg_catalog.now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('full_name', '007 load user ' || generated.user_number),
          pg_catalog.now(), pg_catalog.now(), false
        FROM pg_catalog.generate_series(1, 5000) AS generated(user_number)
        CROSS JOIN shared_password;
        UPDATE auth.users
        SET confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = ''
        WHERE email LIKE '${loadPrefixSql}%';
      `);
      syntheticUsersCreated = Number(ctx.runSql(`SELECT count(*) FROM auth.users WHERE email LIKE '${loadPrefixSql}%'`).trim());
      if (syntheticUsersCreated !== 5000) throw new Error(`Expected 5000 temporary auth users, found ${syntheticUsersCreated}`);

      ctx.runSql(`
        INSERT INTO public.groups (id,name,owner_id)
      VALUES ${largeContextGroupValues};
        INSERT INTO public.group_students (group_id,student_id)
      SELECT group_ids.id, u.id
      FROM (VALUES ${largeContextValues}) AS group_ids(id)
      CROSS JOIN auth.users AS u
        WHERE u.email LIKE '${loadPrefixSql}%'
          AND split_part(split_part(u.email, '-', 4), '@', 1)::integer BETWEEN 1 AND 500;
      `);
      const largeContextSizes = ctx.runSql(`
        SELECT COALESCE(min(member_count),0)::text || ':' || count(*) FILTER (WHERE member_count=500)::text
        FROM (
          SELECT group_ids.id, count(gs.student_id)::integer AS member_count
          FROM (VALUES ${largeContextValues}) AS group_ids(id)
          LEFT JOIN public.group_students AS gs ON gs.group_id=group_ids.id
          GROUP BY group_ids.id
        ) AS group_sizes;
      `).trim().split(":");
      largeContextMemberCount = Number(largeContextSizes[0]);
      largeContextGroupsAtTargetSize = Number(largeContextSizes[1]);

      for (let index = 0; index < timingGroupIds.length; index += 1) {
        const contextId = timingGroupIds[index];
        const requests = [
          { key: "unassociated" as const, email: loadUnassociatedEmail },
          { key: "nonexistent" as const, email: missingEmail },
        ];
        if (index % 2 === 1) requests.reverse();
        for (const item of requests) {
          const result = await lookup(ctx, ownerA, "group", contextId, item.email);
          largeSamples[item.key].push(toRawSample(result));
        }
      }

      for (let index = 0; index < sampleCount; index += 1) {
        const contextId = largeContextIds[Math.floor(index / largeContextSamplesPerContext)];
        const requests = [
          { key: "unassociated" as const, email: loadUnassociatedEmail },
          { key: "nonexistent" as const, email: missingEmail },
        ];
        const rotation = index % requests.length;
        for (let offset = 0; offset < requests.length; offset += 1) {
          const item = requests[(offset + rotation) % requests.length];
          const result = await lookup(ctx, ownerA, "group", contextId, item.email);
          largeContextSamples[item.key].push(toRawSample(result));
        }
      }
    } finally {
      const loadPrefixSql = loadEmailPrefix.replaceAll("'", "''");
      const syntheticIds = ctx.runSql(`SELECT COALESCE(string_agg(id::text, ','), '') FROM auth.users WHERE email LIKE '${loadPrefixSql}%'`).trim();
      const syntheticIdsSql = syntheticIds
        ? `(${syntheticIds.split(",").map((id: string) => `'${id}'::uuid`).join(",")})`
        : "(NULL::uuid)";
      ctx.runSql(`
        DELETE FROM private.associated_profile_lookup_rate_limits
        WHERE requester_id='a7000000-0000-4000-8000-000000000001'::uuid
          AND context_kind='group' AND context_id IN (${contexts},${largeContextSqlIds});
        DELETE FROM public.groups WHERE id IN (${contexts},${largeContextSqlIds});
        DELETE FROM public.exam_attempts WHERE status='pending' AND student_id IN ${syntheticIdsSql};
        DELETE FROM auth.users WHERE email LIKE '${loadPrefixSql}%';
      `);
      largeContextGroupsRemaining = Number(ctx.runSql(`SELECT count(*) FROM public.groups WHERE id IN (${largeContextSqlIds})`).trim());
      largeContextMembershipsRemaining = Number(ctx.runSql(`SELECT count(*) FROM public.group_students WHERE group_id IN (${largeContextSqlIds})`).trim());
      largeContextPendingAttemptsRemaining = Number(ctx.runSql(`SELECT count(*) FROM public.exam_attempts WHERE status='pending' AND student_id IN ${syntheticIdsSql}`).trim());
      largeContextSyntheticUsersRemaining = Number(ctx.runSql(`SELECT count(*) FROM auth.users WHERE email LIKE '${loadPrefixSql}%'`).trim());
      syntheticUsersRemaining = largeContextSyntheticUsersRemaining;
      syntheticCleanupVerified = syntheticUsersRemaining === 0;
    }

    const standardStats = {
      associated: summarize(standardSamples.associated),
      unassociated: summarize(standardSamples.unassociated),
      nonexistent: summarize(standardSamples.nonexistent),
    };
    const largeStats = {
      unassociated: summarize(largeSamples.unassociated),
      nonexistent: summarize(largeSamples.nonexistent),
    };
    const largeContextStats = {
      unassociated: summarize(largeContextSamples.unassociated),
      nonexistent: summarize(largeContextSamples.nonexistent),
    };
    const standardMedianDifferenceMs = roundMs(Math.abs(standardStats.unassociated.medianMs - standardStats.nonexistent.medianMs));
    const largeMedianDifferenceMs = roundMs(Math.abs(largeStats.unassociated.medianMs - largeStats.nonexistent.medianMs));
    const largeContextMedianDifferenceMs = roundMs(Math.abs(largeContextStats.unassociated.medianMs - largeContextStats.nonexistent.medianMs));
    const fixedFloorRespected = [
      ...standardSamples.associated, ...standardSamples.unassociated, ...standardSamples.nonexistent,
      ...largeSamples.unassociated, ...largeSamples.nonexistent,
      ...largeContextSamples.unassociated, ...largeContextSamples.nonexistent,
    ]
      .every((sample) => sample.elapsedMs >= 50);
    const sameStandardNegativeStatusAndBody = standardSamples.unassociated.every((sample) => sample.status === standardSamples.nonexistent[0]?.status && sample.rawBody === standardSamples.nonexistent[0]?.rawBody)
      && standardSamples.nonexistent.every((sample) => sample.status === standardSamples.unassociated[0]?.status && sample.rawBody === standardSamples.unassociated[0]?.rawBody);
    const sameLargeNegativeStatusAndBody = largeSamples.unassociated.every((sample) => sample.status === largeSamples.nonexistent[0]?.status && sample.rawBody === largeSamples.nonexistent[0]?.rawBody)
      && largeSamples.nonexistent.every((sample) => sample.status === largeSamples.unassociated[0]?.status && sample.rawBody === largeSamples.unassociated[0]?.rawBody);
    const sameLargeContextNegativeStatusAndBody = largeContextSamples.unassociated.every((sample) => sample.status === largeContextSamples.nonexistent[0]?.status && sample.rawBody === largeContextSamples.nonexistent[0]?.rawBody)
      && largeContextSamples.nonexistent.every((sample) => sample.status === largeContextSamples.unassociated[0]?.status && sample.rawBody === largeContextSamples.unassociated[0]?.rawBody);
    const timingReport = {
      feature: "007-unified-identity",
      function: "public.lookup_associated_participant(text,uuid,text)",
      measuredAtUtc: new Date().toISOString(),
      timingMethod: "Client-side fetch duration through full response-body read. Each sample uses an independently owned group context; request order is rotated per context. The large dataset and large-context memberships are inserted before their runs and deleted in a finally block.",
      assertion: { minimumSamplesPerCase: sampleCount, maximumNegativeMedianDifferenceMsExclusive: 5, fixedDelayFloorMs: 50, largeDatasetAuthUserCount: 5000 },
      fixedDelayFloorRespected: fixedFloorRespected,
      standardRun: {
        additionalSyntheticAuthUsers: 0,
        medianDifferenceMs: standardMedianDifferenceMs,
        negativeStatusAndRawBodyIdentical: sameStandardNegativeStatusAndBody,
        cases: {
          associated: { ...standardStats.associated, rawSamples: standardSamples.associated },
          unassociated: { ...standardStats.unassociated, rawSamples: standardSamples.unassociated },
          nonexistent: { ...standardStats.nonexistent, rawSamples: standardSamples.nonexistent },
        },
      },
      largeDatasetRun: {
        syntheticAuthUsersRequested: 5000,
        syntheticAuthUsersCreated: syntheticUsersCreated,
        syntheticAuthUsersRemainingAfterCleanup: syntheticUsersRemaining,
        syntheticCleanupVerified,
        medianDifferenceMs: largeMedianDifferenceMs,
        negativeStatusAndRawBodyIdentical: sameLargeNegativeStatusAndBody,
        cases: {
          unassociated: { ...largeStats.unassociated, rawSamples: largeSamples.unassociated },
          nonexistent: { ...largeStats.nonexistent, rawSamples: largeSamples.nonexistent },
        },
      },
      largeContextRun: {
        addOnly: true,
        groupMemberCount: largeContextMemberCount,
        contextCount: largeContextIds.length,
        sampleCountPerNegativeCase: largeContextSamples.unassociated.length,
        groupsAtTargetSize: largeContextGroupsAtTargetSize,
        cleanup: {
          groupsRemaining: largeContextGroupsRemaining,
          membershipsRemaining: largeContextMembershipsRemaining,
          pendingAttemptsRemaining: largeContextPendingAttemptsRemaining,
          syntheticUsersRemaining: largeContextSyntheticUsersRemaining,
        },
        medianDifferenceMs: largeContextMedianDifferenceMs,
        negativeStatusAndRawBodyIdentical: sameLargeContextNegativeStatusAndBody,
        cases: {
          unassociated: { ...largeContextStats.unassociated, rawSamples: largeContextSamples.unassociated },
          nonexistent: { ...largeContextStats.nonexistent, rawSamples: largeContextSamples.nonexistent },
        },
      },
    };
    await mkdir(resolve(process.cwd(), "specs/007-unified-identity/security-baseline/0016"), { recursive: true });
    await writeFile(resolve(process.cwd(), "specs/007-unified-identity/security-baseline/0016/lookup-timing.json"), `${JSON.stringify(timingReport, null, 2)}\n`, "utf8");

    await record(ctx, "contract:email_lookup.unassociated_missing_same_shape",
      endpointAvailable && sameStandardNegativeStatusAndBody && sameLargeNegativeStatusAndBody && standardSamples.unassociated[0]?.status === 200 && standardSamples.unassociated[0]?.rawBody === "[]" && largeSamples.unassociated[0]?.status === 200 && largeSamples.unassociated[0]?.rawBody === "[]",
      `N=${sampleCount} each per run; same HTTP status/body in both runs: ${standardSamples.unassociated[0]?.status} ${standardSamples.unassociated[0]?.rawBody}`);
    await record(ctx, "contract:email_lookup.uniform_timing",
      endpointAvailable
        && standardStats.associated.sampleCount >= sampleCount
        && standardStats.unassociated.sampleCount >= sampleCount
        && standardStats.nonexistent.sampleCount >= sampleCount
        && largeStats.unassociated.sampleCount >= sampleCount
        && largeStats.nonexistent.sampleCount >= sampleCount
        && syntheticUsersCreated === 5000
        && syntheticCleanupVerified
        && fixedFloorRespected
        && standardMedianDifferenceMs < 5
        && largeMedianDifferenceMs < 5,
      `N=${sampleCount}; standard median difference=${standardMedianDifferenceMs}ms, large-dataset median difference=${largeMedianDifferenceMs}ms (both required <5ms); p95/p99 and all raw status/body samples saved; 5000 users cleaned=${syntheticCleanupVerified}; 50ms floor respected=${fixedFloorRespected}`);
    await record(ctx, "contract:email_lookup.uniform_timing_large_context_add_only",
      endpointAvailable
        && largeContextMemberCount === 500
        && largeContextStats.unassociated.sampleCount === sampleCount
        && largeContextStats.nonexistent.sampleCount === sampleCount
        && largeContextGroupsAtTargetSize === largeContextIds.length
        && sameLargeContextNegativeStatusAndBody
        && largeContextMedianDifferenceMs < 5
        && largeContextSamples.unassociated.every((sample) => sample.elapsedMs >= 50)
        && largeContextSamples.nonexistent.every((sample) => sample.elapsedMs >= 50)
        && largeContextGroupsRemaining === 0
        && largeContextMembershipsRemaining === 0
        && largeContextPendingAttemptsRemaining === 0
        && largeContextSyntheticUsersRemaining === 0,
      `add-only N=${sampleCount} each; members per context=${largeContextMemberCount}; contexts at 500 members=${largeContextGroupsAtTargetSize}; median difference=${largeContextMedianDifferenceMs}ms (<5ms); same status/body=${sameLargeContextNegativeStatusAndBody}; 50ms floor respected; cleanup remaining groups/memberships/pending attempts/users=${largeContextGroupsRemaining}/${largeContextMembershipsRemaining}/${largeContextPendingAttemptsRemaining}/${largeContextSyntheticUsersRemaining}`);


  } finally {
    await resetFixtureLimits(ctx);
  }
}

export async function runAssociatedEmailLookupCases(ctx: SecurityTestContext) {
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

    await runUniformTimingCase(ctx, endpointAvailable);

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

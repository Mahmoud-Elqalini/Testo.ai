import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fixtureManifest } from "./fixtures.ts";
import { createContext, parseJson, runSqlFile } from "./context.ts";
import { runRlsCases } from "./rls-before.test.ts";
import { runRpcTriggerCases } from "./rpc-trigger-before.test.ts";
import { runEdgeCases } from "./edge-before.test.ts";
import { runOwnerMirrorCases } from "./owner-mirror-0014.test.ts";
import { runPreparation0015Cases } from "./preparation-0015.test.ts";
import { runProfileProjectionCases } from "./preparation-0016.test.ts";
import { runEdgeCutoverCases } from "./edge-cutover-0017.test.ts";
import { resetStaticAttemptForEdgeCases } from "./edge-attempt-reset.ts";
import { runUniformTimingCase } from "./associated-email-lookup.test.ts";

type CaseResult = { case_id: string; status: "PASS" | "FAIL" | "SKIP" | "removed-by-design"; details: string };

const root = process.cwd();
const beforeDir = resolve(root, "specs/007-unified-identity/security-baseline/before");
const phaseArg = process.argv.indexOf("--phase");
const phase = phaseArg >= 0 ? process.argv[phaseArg + 1] : "before";
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : undefined;
if (only !== undefined && (only !== "uniform-timing" || phase !== "after-0017")) {
  throw new Error("--only currently supports only --phase after-0017 --only uniform-timing");
}
if (!["before", "before-0014", "after-0014", "before-0015", "after-0015", "before-0016", "after-0016", "after-0017", "after-0021"].includes(phase)) {
  throw new Error(`Unsupported security suite phase: ${phase}`);
}

const phaseDirectory = phase === "after-0021" ? "0021" : (phase === "after-0017" || phase === "after-0021") ? "0017" : phase.endsWith("0016") ? "0016" : phase.endsWith("0015") ? "0015" : "0014";
const outputDirectory = phase === "before"
  ? beforeDir
  : resolve(root, `specs/007-unified-identity/security-baseline/${phaseDirectory}`);
const outputPath = resolve(outputDirectory, phase === "before" ? "raw-results.json" : `${phase}.json`);

type After0017Transition = {
  beforeStatus: "PASS" | "FAIL";
  afterStatus: "PASS" | "removed-by-design";
  reason: string;
  replacementCaseIds: string[];
};

const after0017Transitions = new Map<string, After0017Transition>();
function addRemovedCases(caseIds: string[], beforeStatus: "PASS" | "FAIL", reason: string, replacementCaseIds: string[]) {
  for (const caseId of caseIds) after0017Transitions.set(caseId, {
    beforeStatus, afterStatus: "removed-by-design", reason, replacementCaseIds,
  });
}

// These entries are the documented exceptions to literal before/after status
// equality. Every removed case is emitted explicitly and its replacement
// assertions are required to pass.
after0017Transitions.set("policy:exam_attempts_student_select.allow", {
  beforeStatus: "FAIL", afterStatus: "PASS",
  reason: "0017 grants the participant only the approved attempt columns and adds participant-own-attempt RLS; the after case uses that safe projection.",
  replacementCaseIds: ["cutover.attempt.safe_columns.participant_allow"],
});
after0017Transitions.set("policy:exam_attempts_admin_select.allow", {
  beforeStatus: "FAIL", afterStatus: "PASS",
  reason: "0017 grants the exam owner only the approved attempt columns and adds exam-owner RLS; the after case uses that safe projection.",
  replacementCaseIds: ["cutover.attempt.safe_columns.owner_allow"],
});

addRemovedCases([
  "function:public.fn_protect_profile_role.deny",
  "trigger:trg_protect_profile_role.deny",
  "function:public.fn_sync_user_role.deny",
  "trigger:trg_sync_user_role.deny",
], "FAIL", "The before assertion that self-role mutation is rejected is replaced at 0017 by explicit self-promotion no-capability checks; the role column and legacy trigger artifacts remain until 0019.", [
  "cutover.self_promotion.group_deny", "cutover.self_promotion.exam_deny", "cutover.self_promotion.lookup_deny",
  "cutover.self_promotion.owner_self_exam_deny",
  "cutover.self_promotion.invitation_status_deny", "cutover.self_promotion.invitation_create_deny",
  "cutover.self_promotion.invitation_rotate_deny", "cutover.self_promotion.invitation_revoke_deny",
  "cutover.self_promotion.attempt_deny", "cutover.self_promotion.result_deny",
]);

addRemovedCases([
  "function:public.fn_start_attempt.allow", "function:public.fn_start_attempt.deny",
  "function:public.fn_get_exam_questions.allow", "function:public.fn_get_exam_questions.deny",
  "function:public.fn_save_attempt_answer.allow", "function:public.fn_save_attempt_answer.deny",
  "function:public.fn_submit_attempt.allow", "function:public.fn_submit_attempt.deny",
], "PASS", "0017 drops the service-role RPC overloads that accept p_student_id; the caller-JWT Edge cases and the catalog assertion replace those direct RPC call shapes.", ["catalog.no_callable_legacy_student_id_rpc"]);

addRemovedCases([
  "policy:group_students_admin_insert.allow", "policy:group_students_admin_insert.deny",
], "PASS", "0017 removes direct client membership INSERT for owners and non-owners; valid membership creation is covered through invitation redemption, and all direct writes are asserted unavailable.", ["cutover.group_students.no_client_insert", "cutover.invitation_redemption.membership_allow"]);
addRemovedCases([
  "policy:group_students_admin_update.allow", "policy:group_students_admin_update.deny",
], "PASS", "0017 removes direct client membership UPDATE for owners and non-owners; membership changes use invitation redemption or owner-scoped DELETE.", ["cutover.group_students.no_client_insert", "cutover.invitation_redemption.membership_allow"]);

addRemovedCases([
  "function:public.fn_require_student_group_member.allow", "trigger:trg_require_student_group_member.allow",
  "function:public.fn_require_student_group_member.deny", "trigger:trg_require_student_group_member.deny",
], "PASS", "0017 drops the role-only student membership guard and replaces it with role-free owner-self-membership protection plus invitation-only client creation.", ["cutover.invitation_redemption.owner_self_join_deny", "cutover.invitation_redemption.membership_allow"]);
addRemovedCases([
  "function:public.fn_require_student_exam_permission.allow", "trigger:trg_require_student_exam_permission.allow",
  "function:public.fn_require_student_exam_permission.deny", "trigger:trg_require_student_exam_permission.deny",
], "PASS", "0017 drops the role-only direct-student permission guard and requires group-only permissions; direct student-target writes are denied.", ["after-0017:exam_permissions.direct_student_permission_denied", "cutover.attempt.safe_columns.participant_allow", "cutover.owner.self_exam_deny"]);

// 0017's exam_permissions INSERT grants cover exam_id/group_id only; preserved owner CRUD cases omit id and address the inserted row by that pair.

addRemovedCases([
  "function:public.search_student_by_email.allow", "function:public.search_student_by_email.deny",
], "PASS", "0017 drops the unscoped email-search RPC; associated exact lookup requires an owned context and returns only the approved projection.", ["contract:email_lookup.associated_exact_allow", "contract:email_lookup.non_owner_deny"]);
addRemovedCases([
  "function:public.list_group_students.allow", "function:public.list_group_students.deny",
], "PASS", "0017 drops the role-based list RPC; associated participant listing is scoped to the owned group and current membership.", ["contract:participant_list.group_owner_allow", "contract:participant_list.non_owner_deny"]);
addRemovedCases([
  "function:public.list_exam_permissions.allow", "function:public.list_exam_permissions.deny",
], "PASS", "0017 drops the old list RPC and replaces it with owner-scoped, group-only permission listing.", ["after-0017:list_owned_exam_permissions.allow", "after-0017:list_owned_exam_permissions.deny"]);
addRemovedCases([
  "function:private.is_admin_scoped_student.allow", "function:private.is_admin_scoped_student.deny",
], "PASS", "0017 retires the broad role-scoped profile helper; owner-context participant projections replace it.", ["contract:participant_list.group_owner_allow", "contract:participant_list.non_owner_deny"]);
addRemovedCases([
  "policy:profiles_admin_read_scoped_students.allow",
], "PASS", "0017 removes direct cross-profile reads; the approved owner-scoped participant projections expose only the permitted fields.", ["contract:participant_list.group_owner_allow", "contract:email_lookup.associated_exact_allow"]);

const after0017SqlFiles = [
  "supabase/tests/007-unified-identity/security-definer-0017.sql",
  "supabase/tests/007-unified-identity/cutover-0017.sql",
  "supabase/tests/007-unified-identity/lookup-context-0019.sql",
  "supabase/tests/007-unified-identity/drop-admin-id-0021.sql",
];

async function compareStatuses(actual: CaseResult[], referencePath: string) {
  const reference = JSON.parse(await readFile(referencePath, "utf8")) as { results: CaseResult[] };
  const actualById = new Map(actual.map((item) => [item.case_id, item.status]));
  const mismatches = reference.results.flatMap((expected) => {
    const received = actualById.get(expected.case_id);
    return received === expected.status ? [] : [{ case_id: expected.case_id, expected: expected.status, actual: received ?? "MISSING" }];
  });
  return {
    referencePath,
    referenceCases: reference.results.length,
    matchedCases: reference.results.length - mismatches.length,
    mismatchCount: mismatches.length,
    mismatches,
    decisionsUnchanged: mismatches.length === 0,
  };
}

async function runAfter0017SqlCases(context: Awaited<ReturnType<typeof createContext>>) {
  const legacyOwnerColumnsExist = !context.migrationVersions.includes("0021");
  const files = [
    after0017SqlFiles[0],
    after0017SqlFiles[1],
    ...(legacyOwnerColumnsExist ? ["supabase/tests/007-unified-identity/owner-returning-0018.sql"] : []),
    after0017SqlFiles[2],
    after0017SqlFiles[3],
  ];
  for (const file of files) {
    const output = await runSqlFile(file);
    const parsed = [...output.matchAll(/CASE_RESULT\|([^|\r\n]+)\|(PASS|FAIL)\|([^\r\n]*)/g)];
    if (parsed.length === 0) throw new Error(`No CASE_RESULT lines were emitted by ${file}`);
    for (const match of parsed) {
      context.results.push({ case_id: match[1], status: match[2] as "PASS" | "FAIL", details: match[3] });
    }
  }
}

async function runAfter0017CallShapeCases(context: Awaited<ReturnType<typeof createContext>>) {
  const attemptId = "e7000000-0000-4000-8000-000000000001";
  const safeColumns = "id,exam_id,student_id,status,started_at,finished_at,session_id";
  const attemptReads = [
    { caseId: "policy:exam_attempts_student_select.allow", actor: "participantA", shouldSeeRow: true },
    { caseId: "policy:exam_attempts_student_select.deny", actor: "unrelated", shouldSeeRow: false },
    { caseId: "policy:exam_attempts_admin_select.allow", actor: "ownerA", shouldSeeRow: true },
    { caseId: "policy:exam_attempts_admin_select.deny", actor: "ownerB", shouldSeeRow: false },
  ] as const;

  // The legacy RLS cases issue select=* by default. Replace only those four
  // case results with the equivalent 0017 safe-column queries; select=* denial
  // remains independently asserted by cutover-0017.sql.
  const replacedIds = new Set<string>(attemptReads.map((item) => item.caseId));
  context.results.splice(0, context.results.length, ...context.results.filter((item) => !replacedIds.has(item.case_id)));
  context.results.push({
    case_id: "removed-by-design:exam_attempts.select_star",
    status: "removed-by-design",
    details: "0017 intentionally denies select=* because it includes access_token; the four frozen attempt cases are rerun with the documented safe-column projection.",
  });

  for (const item of attemptReads) {
    const response = await context.request(`/rest/v1/exam_attempts?select=${safeColumns}&id=eq.${attemptId}`, item.actor);
    const body = parseJson(await response.text());
    const rows = Array.isArray(body) ? body : [];
    const pass = response.ok && (item.shouldSeeRow ? rows.length === 1 : rows.length === 0);
    context.results.push({
      case_id: item.caseId,
      status: pass ? "PASS" : "FAIL",
      details: `HTTP ${response.status}; safe-column attempt read ${item.shouldSeeRow ? "returns the authorized row" : "hides the unrelated row"}; rows=${rows.length}`,
    });
  }

  const directStudentPermission = context.runSql(`BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.exam_permissions (exam_id, student_id)
    VALUES ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000003');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_denied := true;
  END;
  PERFORM set_config('manjam.after0017.student_permission_write_denied', v_denied::text, true);
END;
$$;
SELECT 'DIRECT_STUDENT_PERMISSION_DENIED=' || current_setting('manjam.after0017.student_permission_write_denied', true);
ROLLBACK;`);
  const deniedMarker = /(?:^|\r?\n)DIRECT_STUDENT_PERMISSION_DENIED=(true|false)(?:\r?\n|$)/.exec(directStudentPermission)?.[1];
  context.results.push({
    case_id: "after-0017:exam_permissions.direct_student_permission_denied",
    status: deniedMarker === "true" ? "PASS" : "FAIL",
    details: `authenticated direct student-target INSERT is rejected inside a rolled-back transaction; result=${deniedMarker ?? "marker missing"}`,
  });

  for (const [actor, suffix, shouldReturnRows] of [["ownerA", "allow", true], ["ownerB", "deny", false]] as const) {
    const response = await context.request("/rest/v1/rpc/list_owned_exam_permissions", actor, {
      method: "POST",
      body: JSON.stringify({ target_exam_id: "c7000000-0000-4000-8000-000000000001" }),
    });
    const body = parseJson(await response.text());
    const rows = Array.isArray(body) ? body : [];
    const pass = response.ok && (shouldReturnRows ? rows.length > 0 : rows.length === 0);
    context.results.push({
      case_id: `after-0017:list_owned_exam_permissions.${suffix}`,
      status: pass ? "PASS" : "FAIL",
      details: `HTTP ${response.status}; ${shouldReturnRows ? "exam owner receives group-only permissions" : "unrelated owner receives no permissions"}; rows=${rows.length}`,
    });
  }
}

async function applyAfter0017Removals(context: Awaited<ReturnType<typeof createContext>>, baselinePath: string) {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as { results: CaseResult[] };
  const baselineById = new Map(baseline.results.map((item) => [item.case_id, item]));
  for (const [caseId, transition] of after0017Transitions) {
    const before = baselineById.get(caseId);
    if (!before || before.status !== transition.beforeStatus) {
      throw new Error(`Invalid after-0017 transition table entry for ${caseId}: expected before=${transition.beforeStatus}, found ${before?.status ?? "MISSING"}`);
    }
    const replacementFailures = transition.replacementCaseIds.filter((replacementId) =>
      !context.results.some((item) => item.case_id === replacementId && item.status === "PASS"),
    );
    if (replacementFailures.length > 0) {
      context.results.push({
        case_id: `transition-replacement:${caseId}`,
        status: "FAIL",
        details: `Required replacement assertions did not pass: ${replacementFailures.join(", ")}`,
      });
    }
    context.results.splice(0, context.results.length, ...context.results.filter((item) => item.case_id !== caseId));
    context.results.push({ case_id: caseId, status: transition.afterStatus, details: `${transition.reason} Replacements: ${transition.replacementCaseIds.join(", ")}.` });
  }
}

async function compareAfter0017Statuses(actual: CaseResult[], referencePath: string) {
  const reference = JSON.parse(await readFile(referencePath, "utf8")) as { results: CaseResult[] };
  const baselineReadme = await readFile(resolve(beforeDir, "README.md"), "utf8");
  const actualById = new Map(actual.map((item) => [item.case_id, item.status]));
  const knownBaselineFailures = [
    "policy:exam_attempts_student_select.allow",
    "policy:exam_attempts_admin_select.allow",
    "function:public.fn_protect_profile_role.deny",
    "trigger:trg_protect_profile_role.deny",
    "function:public.fn_sync_user_role.deny",
    "trigger:trg_sync_user_role.deny",
  ];
  const undocumentedBaselineFailures = knownBaselineFailures.filter((caseId) => !baselineReadme.includes(`\`${caseId}\``));
  const mismatches = reference.results.flatMap((before) => {
    const transition = after0017Transitions.get(before.case_id);
    const expected = transition?.afterStatus ?? before.status;
    const received = actualById.get(before.case_id);
    return received === expected ? [] : [{ case_id: before.case_id, before: before.status, expectedAfter: expected, actualAfter: received ?? "MISSING" }];
  });
  return {
    referencePath,
    referenceCases: reference.results.length,
    matchedCases: reference.results.length - mismatches.length,
    mismatchCount: mismatches.length + undocumentedBaselineFailures.length,
    transitionCount: after0017Transitions.size,
    removedByDesignCount: [...actualById.values()].filter((status) => status === "removed-by-design").length,
    knownBaselineFailures,
    undocumentedBaselineFailures,
    mismatches,
    decisionsMatchDocumentedTransitions: mismatches.length === 0 && undocumentedBaselineFailures.length === 0,
  };
}

async function main() {
  const expectedLastMigration = phase === "after-0016" ? "0016"
    : phase === "after-0021" ? "0021" : (phase === "after-0017" || phase === "after-0021") ? "0020"
    : ["after-0015", "before-0016"].includes(phase) ? "0015"
    : ["after-0014", "before-0015"].includes(phase) ? "0014" : "0013";
  const context = await createContext(expectedLastMigration);
  await mkdir(outputDirectory, { recursive: true });
  if (only === "uniform-timing") {
    await runUniformTimingCase(context);
    const report = {
      suite: "007-unified-identity-after-0017-uniform-timing",
      migrationVersions: context.migrationVersions,
      caseCount: context.results.length,
      passCount: context.results.filter((item) => item.status === "PASS").length,
      failCount: context.results.filter((item) => item.status === "FAIL").length,
      results: context.results,
      lookupTimingReport: "specs/007-unified-identity/security-baseline/0016/lookup-timing.json",
    };
    console.log(JSON.stringify(report, null, 2));
    if (report.failCount > 0) process.exitCode = 1;
    return;
  }
  await runRlsCases(context);
  await runRpcTriggerCases(context, { after0017: (phase === "after-0017" || phase === "after-0021") });
  if ((phase === "after-0017" || phase === "after-0021")) resetStaticAttemptForEdgeCases(context);
  await runEdgeCases(context);
  if (phase === "after-0014") await runOwnerMirrorCases(context);
  if (["after-0015", "before-0016", "after-0016"].includes(phase)) await runPreparation0015Cases(context);
  if (["after-0016", "after-0017", "after-0021"].includes(phase)) await runProfileProjectionCases(context);
  if ((phase === "after-0017" || phase === "after-0021")) {
    await runAfter0017SqlCases(context);
    await runEdgeCutoverCases(context);
    await runAfter0017CallShapeCases(context);
    await applyAfter0017Removals(context, resolve(beforeDir, "raw-results.json"));
  }
  for (const entry of context.inventory.entries as { id: string }[]) {
    for (const outcome of ["allow", "deny"]) {
      const caseId = `${entry.id}.${outcome}`;
      if (!context.results.some((result) => result.case_id === caseId)) {
        context.results.push({ case_id: caseId, status: "FAIL", details: `Inventory coverage missing ${outcome} case` });
      }
    }
  }
  const cases = context.results;

  const failing = cases.filter((item) => (phase === "after-0017" || phase === "after-0021") ? item.status === "FAIL" : item.status !== "PASS");
  let decisionComparison: Awaited<ReturnType<typeof compareStatuses>> | Awaited<ReturnType<typeof compareAfter0017Statuses>> | null = null;
  if (phase === "before-0014") {
    decisionComparison = await compareStatuses(cases, resolve(beforeDir, "raw-results.json"));
  } else if (phase === "after-0014") {
    decisionComparison = await compareStatuses(cases, resolve(outputDirectory, "before-0014.json"));
  } else if (phase === "before-0015") {
    decisionComparison = await compareStatuses(cases, resolve(beforeDir, "raw-results.json"));
  } else if (phase === "after-0015") {
    decisionComparison = await compareStatuses(cases, resolve(outputDirectory, "before-0015.json"));
  } else if (phase === "before-0016") {
    decisionComparison = await compareStatuses(cases, resolve(beforeDir, "raw-results.json"));
  } else if (phase === "after-0016") {
    decisionComparison = await compareStatuses(cases, resolve(outputDirectory, "before-0016.json"));
  } else if ((phase === "after-0017" || phase === "after-0021")) {
    decisionComparison = await compareAfter0017Statuses(cases, resolve(beforeDir, "raw-results.json"));
  }
  const report = {
    suite: `007-unified-identity-${phase}`,
    migrationVersions: context.migrationVersions,
    fixtures: fixtureManifest,
    fixtureHash: createHash("sha256").update(JSON.stringify(fixtureManifest)).digest("hex"),
    command: phase === "before" ? "npm run test:security:007:before" : `node --experimental-strip-types tests/security/007-unified-identity/harness.ts --phase ${phase}`,
    recordedAtUtc: new Date().toISOString(),
    caseCount: cases.length,
    passCount: (phase === "after-0017" || phase === "after-0021") ? cases.filter((item) => item.status === "PASS").length : cases.length - failing.length,
    failCount: failing.length,
    mismatchCount: (phase === "after-0017" || phase === "after-0021") ? decisionComparison?.mismatchCount ?? 0 : 0,
    removedByDesignCount: (phase === "after-0017" || phase === "after-0021") ? cases.filter((item) => item.status === "removed-by-design").length : 0,
    results: cases,
    decisionComparison,
    documentedTransitions: (phase === "after-0017" || phase === "after-0021") ? [...after0017Transitions].map(([case_id, transition]) => {
      const replacementResults = transition.replacementCaseIds.map((replacementCaseId) => {
        const replacement = cases.find((item) => item.case_id === replacementCaseId);
        return { case_id: replacementCaseId, status: replacement?.status ?? "MISSING" };
      });
      return {
        case_id,
        beforeStatus: transition.beforeStatus,
        afterStatus: transition.afterStatus,
        reason: transition.reason,
        replacementCaseIds: transition.replacementCaseIds,
        replacementResults,
        everyReplacementPassed: replacementResults.every((item) => item.status === "PASS"),
      };
    }) : undefined,
    localAdvisories: ["public.private_user_roles currently has row-level security disabled; recorded as observed and not changed by the baseline run."],
    fixtureSeed: (phase === "after-0017" || phase === "after-0021")
      ? "supabase/tests/007-unified-identity/fixture-setup.sql (additive); edge-cutover-0017 resets only its static attempt in one transaction before endpoint requests"
      : "supabase/tests/007-unified-identity/fixture-setup.sql (additive; no reset/reseed performed)",
  };
  // Publish the report atomically so a concurrent reader can never observe a
  // partially-written JSON file (and accidentally reuse stale PowerShell data).
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  const decisionsMatch = (phase === "after-0017" || phase === "after-0021")
    ? (decisionComparison as Awaited<ReturnType<typeof compareAfter0017Statuses>> | null)?.decisionsMatchDocumentedTransitions ?? null
    : (decisionComparison as Awaited<ReturnType<typeof compareStatuses>> | null)?.decisionsUnchanged ?? null;
  console.log(JSON.stringify({
    outputPath,
    caseCount: report.caseCount,
    passCount: report.passCount,
    failCount: report.failCount,
    mismatchCount: report.mismatchCount,
    decisionsMatch,
    documentedTransitions: report.documentedTransitions,
  }, null, 2));
  if (failing.length || decisionsMatch === false) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

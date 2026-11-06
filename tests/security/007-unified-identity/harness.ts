import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fixtureManifest } from "./fixtures.ts";
import { createContext } from "./context.ts";
import { runRlsCases } from "./rls-before.test.ts";
import { runRpcTriggerCases } from "./rpc-trigger-before.test.ts";
import { runEdgeCases } from "./edge-before.test.ts";
import { runOwnerMirrorCases } from "./owner-mirror-0014.test.ts";

type CaseResult = { case_id: string; status: "PASS" | "FAIL" | "SKIP"; details: string };

const root = process.cwd();
const beforeDir = resolve(root, "specs/007-unified-identity/security-baseline/before");
const phaseArg = process.argv.indexOf("--phase");
const phase = phaseArg >= 0 ? process.argv[phaseArg + 1] : "before";
if (!["before", "before-0014", "after-0014"].includes(phase)) {
  throw new Error(`Unsupported security suite phase: ${phase}`);
}

const outputDirectory = phase === "before"
  ? beforeDir
  : resolve(root, "specs/007-unified-identity/security-baseline/0014");
const outputPath = resolve(outputDirectory, phase === "before" ? "raw-results.json" : `${phase}.json`);

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

async function main() {
  const expectedLastMigration = phase === "after-0014" ? "0014" : "0013";
  const context = await createContext(expectedLastMigration);
  await mkdir(outputDirectory, { recursive: true });
  await runRlsCases(context);
  await runRpcTriggerCases(context);
  await runEdgeCases(context);
  if (phase === "after-0014") await runOwnerMirrorCases(context);
  for (const entry of context.inventory.entries as { id: string }[]) {
    for (const outcome of ["allow", "deny"]) {
      const caseId = `${entry.id}.${outcome}`;
      if (!context.results.some((result) => result.case_id === caseId)) {
        context.results.push({ case_id: caseId, status: "FAIL", details: `Inventory coverage missing ${outcome} case` });
      }
    }
  }
  const cases = context.results;

  const failing = cases.filter((item) => item.status !== "PASS");
  let decisionComparison: Awaited<ReturnType<typeof compareStatuses>> | null = null;
  if (phase === "before-0014") {
    decisionComparison = await compareStatuses(cases, resolve(beforeDir, "raw-results.json"));
  } else if (phase === "after-0014") {
    decisionComparison = await compareStatuses(cases, resolve(outputDirectory, "before-0014.json"));
  }
  const report = {
    suite: `007-unified-identity-${phase}`,
    migrationVersions: context.migrationVersions,
    fixtures: fixtureManifest,
    fixtureHash: createHash("sha256").update(JSON.stringify(fixtureManifest)).digest("hex"),
    command: phase === "before" ? "npm run test:security:007:before" : `node --experimental-strip-types tests/security/007-unified-identity/harness.ts --phase ${phase}`,
    recordedAtUtc: new Date().toISOString(),
    caseCount: cases.length,
    passCount: cases.length - failing.length,
    failCount: failing.length,
    results: cases,
    decisionComparison,
    localAdvisories: ["public.private_user_roles currently has row-level security disabled; recorded as observed and not changed by the baseline run."],
    fixtureSeed: "supabase/tests/007-unified-identity/fixture-setup.sql (additive; no reset/reseed performed)",
  };
  // Publish the report atomically so a concurrent reader can never observe a
  // partially-written JSON file (and accidentally reuse stale PowerShell data).
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  console.log(JSON.stringify({ outputPath, caseCount: report.caseCount, passCount: report.passCount, failCount: report.failCount, decisionsUnchanged: decisionComparison?.decisionsUnchanged ?? null }, null, 2));
  if (failing.length || decisionComparison?.decisionsUnchanged === false) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

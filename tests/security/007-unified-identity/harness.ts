import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fixtureManifest } from "./fixtures.ts";
import { createContext } from "./context.ts";
import { runRlsCases } from "./rls-before.test.ts";
import { runRpcTriggerCases } from "./rpc-trigger-before.test.ts";
import { runEdgeCases } from "./edge-before.test.ts";

type CaseResult = { case_id: string; status: "PASS" | "FAIL" | "SKIP"; details: string };

const root = process.cwd();
const beforeDir = resolve(root, "specs/007-unified-identity/security-baseline/before");
const outputPath = resolve(beforeDir, "raw-results.json");

async function main() {
  const context = await createContext();
  await mkdir(beforeDir, { recursive: true });
  await runRlsCases(context);
  await runRpcTriggerCases(context);
  await runEdgeCases(context);
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
  const report = {
    suite: "007-unified-identity-before",
    migrationVersions: context.migrationVersions,
    fixtures: fixtureManifest,
    fixtureHash: createHash("sha256").update(JSON.stringify(fixtureManifest)).digest("hex"),
    command: "npm run test:security:007:before",
    recordedAtUtc: new Date().toISOString(),
    caseCount: cases.length,
    passCount: cases.length - failing.length,
    failCount: failing.length,
    results: cases,
    localAdvisories: ["public.private_user_roles currently has row-level security disabled; recorded as observed and not changed by the baseline run."],
    fixtureSeed: "supabase/tests/007-unified-identity/fixture-setup.sql (additive; no reset/reseed performed)",
  };
  // Publish the report atomically so a concurrent reader can never observe a
  // partially-written JSON file (and accidentally reuse stale PowerShell data).
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  console.log(JSON.stringify({ outputPath, caseCount: report.caseCount, passCount: report.passCount, failCount: report.failCount }, null, 2));
  if (failing.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

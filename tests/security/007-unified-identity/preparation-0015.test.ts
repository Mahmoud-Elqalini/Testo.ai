import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createContext, record, runSqlFile, type SecurityTestContext } from "./context.ts";

export async function runPreparation0015Cases(ctx: SecurityTestContext) {
  const output = await runSqlFile("supabase/tests/007-unified-identity/preparation-0015.sql");
  for (const line of output.split(/\r?\n/)) {
    const match = /^CASE_RESULT\|([^|]+)\|(PASS|FAIL)\|(.+)$/.exec(line.trim());
    if (match) await record(ctx, `migration:0015.${match[1]}`, match[2] === "PASS", match[3]);
  }
}

async function main() {
  const phaseIndex = process.argv.indexOf("--phase");
  const phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : "before";
  const ctx = await createContext(phase === "after" ? "0015" : "0014");
  await runPreparation0015Cases(ctx);
  const failed = ctx.results.filter((item) => item.status !== "PASS");
  console.log(JSON.stringify({ caseCount: ctx.results.length, passCount: ctx.results.length - failed.length, failCount: failed.length, results: ctx.results }, null, 2));
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

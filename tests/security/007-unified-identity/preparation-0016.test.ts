import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createContext, record, type SecurityTestContext } from "./context.ts";
import { runParticipantListCases } from "./participant-list.test.ts";
import { runAssociatedEmailLookupCases } from "./associated-email-lookup.test.ts";

export async function runProfileProjectionCases(ctx: SecurityTestContext) {
  await runParticipantListCases(ctx);
  await runAssociatedEmailLookupCases(ctx);
}

async function main() {
  const ctx = await createContext("0015");
  await runProfileProjectionCases(ctx);
  const failed = ctx.results.filter((item) => item.status !== "PASS");
  console.log(JSON.stringify({ caseCount: ctx.results.length, passCount: ctx.results.length - failed.length, failCount: failed.length, expectedFailFirst: true, results: ctx.results }, null, 2));
  if (failed.length) process.exitCode = 1;
  else {
    await record(ctx, "test:first_run", false, "profile projection contracts unexpectedly passed before migration 0016");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

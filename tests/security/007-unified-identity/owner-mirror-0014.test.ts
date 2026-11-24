import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createContext, record, runSqlFile, type SecurityTestContext } from "./context.ts";

const ids = {
  ownerA: "a7000000-0000-4000-8000-000000000001",
  ownerB: "a7000000-0000-4000-8000-000000000002",
  groupA: "b7000000-0000-4000-8000-000000000001",
  examA: "c7000000-0000-4000-8000-000000000001",
};

function parseJson(text: string): unknown {
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

export async function runOwnerMirrorCases(ctx: SecurityTestContext) {
  const output = await runSqlFile("supabase/tests/007-unified-identity/owner-mirror-0014.sql");
  for (const line of output.split(/\r?\n/)) {
    const match = /^CASE_RESULT\|([^|]+)\|(PASS|FAIL)\|(.+)$/.exec(line.trim());
    if (match) await record(ctx, `migration:0014.${match[1]}`, match[2] === "PASS", match[3]);
  }

  await assertOwnerTransferDenied(ctx, "groups", ids.groupA, "group");
  await assertOwnerTransferDenied(ctx, "exams", ids.examA, "exam");
}

async function assertOwnerTransferDenied(ctx: SecurityTestContext, table: "groups" | "exams", id: string, label: string) {
  const url = `/rest/v1/${table}?id=eq.${id}`;
  const beforeResponse = await ctx.request(`${url}&select=admin_id,owner_id`, "ownerA", {
    method: "GET", headers: ctx.serviceHeaders(),
  });
  const beforeValue = parseJson(await beforeResponse.text());
  const beforeRows = Array.isArray(beforeValue) ? beforeValue as Array<{ admin_id?: string; owner_id?: string }> : [];
  const before = beforeRows[0];
  const updateResponse = await ctx.request(url, "ownerA", {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_id: ids.ownerB }),
  });
  const afterResponse = await ctx.request(`${url}&select=admin_id,owner_id`, "ownerA", {
    method: "GET", headers: ctx.serviceHeaders(),
  });
  const afterValue = parseJson(await afterResponse.text());
  const afterRows = Array.isArray(afterValue) ? afterValue as Array<{ admin_id?: string; owner_id?: string }> : [];
  const after = afterRows[0];
  const unchanged = before?.admin_id === ids.ownerA && before?.owner_id === ids.ownerA &&
    after?.admin_id === ids.ownerA && after?.owner_id === ids.ownerA;
  await record(
    ctx,
    `migration:0014.${label}_owner_transfer.deny`,
    beforeResponse.ok && afterResponse.ok && unchanged,
    `HTTP ${updateResponse.status}; authenticated owner cannot transfer ${label} ownership; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );

  // Keep the stable synthetic fixture safe if a regression accidentally lets
  // the transfer through; record the failure before restoring its owner.
  if (!unchanged && afterResponse.ok && after?.admin_id && after?.owner_id) {
    await ctx.request(url, "ownerA", {
      method: "PATCH",
      headers: ctx.serviceHeaders(),
      body: JSON.stringify({ admin_id: ids.ownerA, owner_id: ids.ownerA }),
    });
  }
}

async function main() {
  const phaseIndex = process.argv.indexOf("--phase");
  const phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : "after";
  const ctx = await createContext(phase === "before" ? "0013" : "0014");
  await runOwnerMirrorCases(ctx);
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

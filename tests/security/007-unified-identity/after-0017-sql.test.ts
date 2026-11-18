import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const sqlFiles = [
  "supabase/tests/007-unified-identity/security-definer-0017.sql",
  "supabase/tests/007-unified-identity/cutover-0017.sql",
  "supabase/tests/007-unified-identity/owner-returning-0018.sql",
  "supabase/tests/007-unified-identity/lookup-context-0019.sql",
];

type Result = { file: string; case_id: string; status: "PASS" | "FAIL"; details: string };

function runPsql(sql: string) {
  const containers = spawnSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], {
    cwd: root,
    encoding: "utf8",
  });
  if (containers.error) throw containers.error;
  if (containers.status !== 0) throw new Error(containers.stderr || "Unable to locate local Supabase database container");
  const container = containers.stdout.trim().split(/\r?\n/).find(Boolean);
  if (!container) throw new Error("No local Supabase database container is running");

  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
    cwd: root,
    encoding: "utf8",
    input: sql,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}

async function main() {
  const results: Result[] = [];
  const fileFailures: Array<{ file: string; reason: string }> = [];

  for (const file of sqlFiles) {
    const sql = await readFile(resolve(root, file), "utf8");
    const execution = runPsql(sql);
    console.log(`RAW_OUTPUT_BEGIN|${file}`);
    console.log(execution.output);
    console.log(`RAW_OUTPUT_END|${file}`);

    if (execution.status !== 0) {
      fileFailures.push({ file, reason: `psql exited with status ${execution.status}` });
      break;
    }

    const parsed = [...execution.output.matchAll(/CASE_RESULT\|([^|\r\n]+)\|(PASS|FAIL)\|([^\r\n]*)/g)];
    if (parsed.length === 0) fileFailures.push({ file, reason: "zero CASE_RESULT lines" });
    if (execution.output.includes("|FAIL|")) {
      for (const match of parsed) {
        if (match[2] === "FAIL") {
          results.push({ file, case_id: match[1], status: "FAIL", details: match[3] });
        } else {
          results.push({ file, case_id: match[1], status: "PASS", details: match[3] });
        }
      }
      if (!parsed.some((match) => match[2] === "FAIL")) {
        fileFailures.push({ file, reason: "output contains |FAIL| outside a parseable CASE_RESULT line" });
      }
    } else {
      for (const match of parsed) {
        results.push({ file, case_id: match[1], status: match[2] as "PASS" | "FAIL", details: match[3] });
      }
    }
  }

  const failedCases = results.filter((result) => result.status === "FAIL");
  const report = {
    fileCount: sqlFiles.length,
    caseCount: results.length,
    passCount: results.filter((result) => result.status === "PASS").length,
    failCount: failedCases.length + fileFailures.length,
    fileFailures,
    failures: failedCases,
    results,
  };
  console.log("RUNNER_SUMMARY_BEGIN");
  console.log(JSON.stringify(report, null, 2));
  console.log("RUNNER_SUMMARY_END");
  if (report.failCount > 0 || results.length === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const sharedSqlFiles = [
  "supabase/tests/007-unified-identity/security-definer-0017.sql",
  "supabase/tests/007-unified-identity/cutover-0017.sql",
  "supabase/tests/007-unified-identity/lookup-context-0019.sql",
  "supabase/tests/007-unified-identity/drop-admin-id-0021.sql",
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

  const fixtureSql = await readFile(resolve(root, "supabase/tests/007-unified-identity/fixture-setup.sql"), "utf8");
  const fixtureExecution = runPsql(fixtureSql);
  console.log("LOCAL_FIXTURE_SETUP_BEGIN");
  console.log(fixtureExecution.output);
  console.log("LOCAL_FIXTURE_SETUP_END");
  if (fixtureExecution.status !== 0) {
    throw new Error(`Local security fixture setup failed with psql status ${fixtureExecution.status}`);
  }

  const legacyColumnCheck = runPsql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('groups','exams') AND column_name='admin_id'");
  const legacyColumnCount = Number(legacyColumnCheck.output.trim());
  if (legacyColumnCheck.status !== 0 || ![0, 2].includes(legacyColumnCount)) {
    throw new Error(`Unexpected owner column state before SQL security tests: ${legacyColumnCheck.output}`);
  }
  const sqlFiles = [
    sharedSqlFiles[0],
    sharedSqlFiles[1],
    ...(legacyColumnCount === 2 ? ["supabase/tests/007-unified-identity/owner-returning-0018.sql"] : []),
    sharedSqlFiles[2],
    sharedSqlFiles[3],
  ];

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

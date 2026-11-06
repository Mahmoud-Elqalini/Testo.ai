import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const migrationNames = [
  "0001_schema.sql", "0002_rls_policies.sql", "0003_functions_triggers_cron.sql", "0004_fix_get_my_role_rls_bypass.sql",
  "0005_rebuild_role_helpers_and_break_rls_cycles.sql", "0006_secure_student_search.sql", "0007_group_invitations.sql",
  "0008_student_attempt_operations.sql", "0009_attempt_publication_denial.sql", "0010_harden_expired_attempt_sweep.sql",
  "0011_student_results.sql", "0012_fix_student_results_attempt_lookup.sql", "0013_list_my_joined_groups.sql",
];

const migrations = await Promise.all(migrationNames.map(async (file) => ({
  file,
  sql: await readFile(resolve(root, "supabase/migrations", file), "utf8"),
})));
const activePolicySource = migrations.find(({ file }) => file.startsWith("0005_"))!;
const policies = [...activePolicySource.sql.matchAll(/CREATE POLICY\s+(\w+)\s+ON\s+(?:public\.)?(\w+)([\s\S]*?);/gi)]
  .filter(([, , , body]) => /is_admin|is_student|admin_id|role/i.test(body));
const policyInventory = policies.map(([, name, table, body]) => {
  const command = /\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i.exec(body)?.[1]?.toUpperCase() ?? "ALL";
  return {
    id: `policy:${name}`,
    type: "rls_policy",
    migration: activePolicySource.file,
    object: name,
    table,
    command,
    policySql: body.trim().replace(/\s+/g, " "),
    allowCase: `Authenticated owner/admin or participant matching ${name}`,
    denyCase: `Authenticated unrelated account and anon request denied by ${name}`,
  };
});

const functionDefinitions = new Map<string, { migration: string; body: string; functionName: string }>();
const canonical = (value: string) => value.trim().replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").toLowerCase();
const publicName = (name: string) => name.includes(".") ? name : `public.${name}`;
for (const { file, sql } of migrations) {
  const declarations = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(/gi;
  for (const declaration of sql.matchAll(declarations)) {
    const name = declaration[1];
    const start = declaration.index! + declaration[0].length;
    let depth = 1;
    let end = start;
    for (; end < sql.length && depth > 0; end++) {
      if (sql[end] === "(") depth++;
      else if (sql[end] === ")") depth--;
    }
    if (depth !== 0) continue;
    const signature = sql.slice(start, end - 1);
    const rest = sql.slice(end);
    const delimiter = /\bAS\s+(\$[\w]*\$)/i.exec(rest);
    if (!delimiter) continue;
    const bodyStart = end + delimiter.index + delimiter[0].length;
    const tag = delimiter[1];
    const bodyEnd = sql.indexOf(tag, bodyStart);
    if (bodyEnd < 0) continue;
    const header = sql.slice(end, bodyStart);
    const body = sql.slice(bodyStart, bodyEnd);
    if (/\bis_admin\b|\bis_student\b|\brole\b|private_user_roles|\badmin_id\b|\buser_role\b/i.test(`${signature} ${header} ${body}`)) {
      const key = `${publicName(name)}(${canonical(signature)})`;
      functionDefinitions.set(key, { migration: file, body: body.trim().replace(/\s+/g, " "), functionName: name });
    }
  }
  for (const match of sql.matchAll(/DROP FUNCTION\s+(?:IF EXISTS\s+)?([\w.]+)\s*\(([^)]*)\)\s*;/gi)) {
    const [, name, signature] = match;
    const droppedArgs = canonical(signature).split(",").map((item) => item.trim().split(/\s+/).at(-1)).filter(Boolean).join(",");
    const droppedName = publicName(name).toLowerCase();
    for (const key of functionDefinitions.keys()) {
      const openParen = key.indexOf("(");
      const keyName = key.slice(0, openParen);
      const keyArgs = key.slice(openParen + 1, -1).split(",").map((item) => item.trim().split(/\s+/).at(-1)).filter(Boolean).join(",");
      if (keyName === droppedName && canonical(keyArgs) === canonical(droppedArgs)) functionDefinitions.delete(key);
    }
  }
}
const functionInventory = [...functionDefinitions].map(([signature, definition]) => ({
  // Keep case IDs stable across the planned signature cutover in 0017.
  id: `function:${signature.slice(0, signature.indexOf("("))}`,
  type: "security_definer_function_or_role_dependent_function",
  migration: definition.migration,
  object: signature,
  allowCase: `Valid caller, role or resource relationship allowed by ${signature}`,
  denyCase: `Unauthenticated or unrelated caller denied by ${signature}`,
  sourceExcerpt: definition.body.slice(0, 500),
}));

const functionNames = new Set([...functionDefinitions.values()].map(({ functionName }) => functionName.split(".").at(-1)));
const triggerCalls = new Map<string, string>();
for (const { file, sql } of migrations) {
  for (const match of sql.matchAll(/CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)\s+([\s\S]*?);/gi)) {
    const [, name, definition] = match;
    const table = /\bON\s+(?:public\.)?(\w+)/i.exec(definition)?.[1];
    const fn = /EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([\w.]+)\s*\(/i.exec(definition)?.[1];
    if (!table || !fn) continue;
    if (functionNames.has(fn.split(".").at(-1))) triggerCalls.set(name, `${file}:${table}:${fn}`);
  }
}
const triggerInventory = [...triggerCalls].map(([name, source]) => ({
  id: `trigger:${name}`,
  type: "role_dependent_trigger_path",
  source,
  object: name,
  allowCase: `Valid database event passes trigger ${name}`,
  denyCase: `Invalid role/owner relationship is rejected by trigger ${name}`,
}));

const edgeFiles = [
  "start-attempt/index.ts", "get-exam-questions/index.ts", "save-answer/index.ts", "submit-attempt/index.ts",
];
const edgeInventory = [];
for (const file of edgeFiles) {
  const source = await readFile(resolve(root, "supabase/functions", file), "utf8");
  if (/student_id|attempt|admin|role/i.test(source)) edgeInventory.push({
    id: `edge:${file}`,
    type: "edge_function_path",
    source: `supabase/functions/${file}`,
    object: file.split("/")[0],
    allowCase: "Authenticated user for an authorized attempt/resource",
    denyCase: "Anon and authenticated unrelated user, including request-body identity spoofing",
  });
}

// Reconcile the migration-derived names against the active local PostgreSQL catalog.
// The SQL filter uses the same role/admin_id dependency markers as the source scan.
const catalogSql = `
WITH objects AS (
  SELECT 'policy'::text AS kind, policyname AS object, ''::text AS signature_hash
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* '(is_admin|is_student|admin_id|private_user_roles|user_role|profiles[.]role)'
  UNION ALL
  SELECT 'function', n.nspname || '.' || p.proname,
    md5(regexp_replace(btrim(pg_get_function_identity_arguments(p.oid)), '[[:space:]]*,[[:space:]]*', ',', 'g'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~* '(is_admin|is_student|admin_id|private_user_roles|user_role|profiles[[:space:]]*[(][^)]*role|old[.]role|new[.]role|p[.]role|pur[.]role|role[[:space:]]*=)'
  UNION ALL
  SELECT 'trigger', t.tgname, ''::text
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace pn ON pn.oid = p.pronamespace
  WHERE NOT t.tgisinternal AND p.prokind = 'f'
    AND pn.nspname IN ('public', 'private')
    AND pg_get_functiondef(p.oid) ~* '(is_admin|is_student|admin_id|private_user_roles|user_role|profiles[[:space:]]*[(][^)]*role|old[.]role|new[.]role|p[.]role|pur[.]role|role[[:space:]]*=)'
)
SELECT kind, object, signature_hash FROM objects ORDER BY kind, object`;
const cli = resolve(root, "node_modules/supabase/dist/supabase.js");
const query = spawnSync(process.execPath, [cli, "db", "query", "--local", "--output", "json", catalogSql], {
  cwd: root, encoding: "utf8", env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }, maxBuffer: 16 * 1024 * 1024,
});
if (query.status !== 0) throw new Error(query.stderr || query.stdout || "Unable to read local catalog for inventory reconciliation");
const jsonStart = query.stdout.indexOf("{");
const jsonEnd = query.stdout.lastIndexOf("}");
if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error("Supabase CLI returned no catalog JSON");
const catalogRows = (JSON.parse(query.stdout.slice(jsonStart, jsonEnd + 1)) as { rows?: { kind: string; object: string; signature_hash: string }[] }).rows ?? [];
const signatureHash = (value: string) => createHash("md5").update(canonical(value)).digest("hex");
const migrationCatalog = [
  ...policyInventory.map((entry) => ({ kind: "policy", object: entry.object })),
  ...functionInventory.map((entry) => ({ kind: "function", object: entry.object.slice(0, entry.object.indexOf("(")), signature_hash: signatureHash(entry.object.slice(entry.object.indexOf("(") + 1, -1)) })),
  ...triggerInventory.map((entry) => ({ kind: "trigger", object: entry.object })),
];
const catalogKey = (item: { kind: string; object: string; signature_hash?: string }) => `${item.kind}:${item.object.toLowerCase()}${item.kind === "function" ? `:${item.signature_hash}` : ""}`;
const sourceKeys = new Set(migrationCatalog.map(catalogKey));
const databaseKeys = new Set(catalogRows.map(catalogKey));
const missingFromCatalog = [...sourceKeys].filter((key) => !databaseKeys.has(key));
const missingFromMigrations = [...databaseKeys].filter((key) => !sourceKeys.has(key));
if (missingFromCatalog.length || missingFromMigrations.length) {
  throw new Error(`Migration/catalog inventory mismatch. Missing from catalog: ${missingFromCatalog.join(", ") || "none"}; missing from migrations: ${missingFromMigrations.join(", ") || "none"}`);
}

const planText = await readFile(resolve(root, "specs/007-unified-identity/plan.md"), "utf8");
const planMissing = [...policyInventory, ...functionInventory, ...triggerInventory]
  .filter((entry) => {
    const plannedName = entry.type === "role_dependent_trigger_path"
      ? entry.source.split(":").at(-1)!.split(".").at(-1)!
      : entry.object.split("(")[0].replace(/^public\./i, "");
    return !planText.toLowerCase().includes(plannedName.toLowerCase());
  });
if (planMissing.length) throw new Error(`Inventory entries absent from plan matrix: ${planMissing.map(({ kind, object }) => `${kind}:${object}`).join(", ")}`);
const edgeMissingFromPlan = edgeInventory.filter(({ object }) => !planText.toLowerCase().includes(object.toLowerCase()));
if (edgeMissingFromPlan.length) throw new Error(`Edge paths absent from plan matrix: ${edgeMissingFromPlan.map(({ source }) => source).join(", ")}`);

const inventory = {
  sourceMigrations: migrationNames,
  generatedFrom: "supabase/migrations source; active policy definitions use migration 0005 after role-helper rebuild; functions apply CREATE/DROP history through 0013",
  catalogReconciled: true,
  catalogSnapshot: catalogRows,
  planReconciled: true,
  excludedRelatedFunctions: [
    { object: "public.get_my_role()", reason: "Historical role function dropped by migration 0005; absent from the active local pg_catalog, so no active before-state path exists to baseline." },
    { object: "private.can_access_exam", reason: "Membership/published-state helper; its active definition contains no profiles.role or admin_id check." },
    { object: "private.can_access_exam_permission", reason: "Membership/published-state helper; its active definition contains no profiles.role or admin_id check." },
    { object: "private.owns_attempt", reason: "auth.uid()-based self-ownership helper; its active definition contains no profiles.role or admin_id check." },
    { object: "public.fn_create_pending_attempt_on_permission", reason: "Attempt-generation trigger helper; its active definition contains no profiles.role or admin_id check." },
    { object: "public.fn_create_pending_attempt_on_group_student", reason: "Attempt-generation trigger helper; its active definition contains no profiles.role or admin_id check." },
    { object: "public.fn_create_pending_attempts_at_start", reason: "Attempt-generation helper; its active definition contains no profiles.role or admin_id check." },
  ],
  generatedAtUtc: new Date().toISOString(),
  entries: [...policyInventory, ...functionInventory, ...triggerInventory, ...edgeInventory],
};
const target = resolve(root, "specs/007-unified-identity/security-baseline");
await mkdir(target, { recursive: true });
await writeFile(resolve(target, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
const markdown = [
  "# Frozen Role-Dependent Authorization Inventory (before 0014)",
  "",
  `Generated: ${inventory.generatedAtUtc}`,
  `Source migrations: ${migrationNames.join(", ")}`,
  `Total entries: ${inventory.entries.length} (RLS ${policyInventory.length}; functions ${functionInventory.length}; triggers ${triggerInventory.length}; Edge paths ${edgeInventory.length})`,
  "",
  "Every entry must have a current-schema allow and deny result in the before-suite and the same case IDs must be rerun after the change.",
  "",
  "| ID | Kind | Source/object | Allow case | Deny case |",
  "|---|---|---|---|---|",
  ...inventory.entries.map((entry) => `| ${entry.id} | ${entry.type} | ${"migration" in entry ? entry.migration : entry.source} / ${entry.object} | ${entry.allowCase} | ${entry.denyCase} |`),
  "",
].join("\n");
await writeFile(resolve(target, "inventory.md"), markdown, "utf8");
console.log(JSON.stringify({ policies: policyInventory.length, functions: functionInventory.length, triggers: triggerInventory.length, edgePaths: edgeInventory.length, total: inventory.entries.length }, null, 2));

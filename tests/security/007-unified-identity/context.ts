import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fixtureManifest } from "./fixtures.ts";

const root = process.cwd();
const node = process.execPath;
const cli = resolve(root, "node_modules/supabase/dist/supabase.js");

function cliCall(args: string[]) {
  const result = spawnSync(node, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `supabase ${args.join(" ")} failed (${result.status})`);
  return `${result.stdout}${result.stderr}`;
}

function dockerSql(sql: string) {
  const containers = spawnSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { cwd: root, encoding: "utf8" });
  if (containers.status !== 0) throw new Error(containers.stderr || "Unable to locate local Supabase database container");
  const name = containers.stdout.trim().split(/\r?\n/).find(Boolean);
  if (!name) throw new Error("No local Supabase database container is running");
  const result = spawnSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
    cwd: root, encoding: "utf8", input: sql, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `psql failed (${result.status})`);
  return result.stdout;
}

function cliJson(stdout: string, matches: (value: Record<string, unknown>) => boolean = () => true) {
  // Supabase CLI versions may mix progress output or emit either an object or
  // an array as JSON. Extract complete top-level values rather than parsing
  // everything from the first opening brace through the last closing brace.
  const payloads: Record<string, unknown>[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < stdout.length; index += 1) {
    const char = stdout[index];
    if (depth === 0) {
      if (char === "{" || char === "[") {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const value: unknown = JSON.parse(stdout.slice(start, index + 1));
          if (Array.isArray(value)) payloads.push({ rows: value });
          else if (value && typeof value === "object") payloads.push(value as Record<string, unknown>);
        } catch {
          // Ignore brace-delimited CLI log fragments and keep scanning.
        }
        start = -1;
      }
    }
  }

  const payload = [...payloads].reverse().find(matches);
  if (!payload) {
    const preview = stdout.trim().slice(0, 300);
    throw new Error(`Supabase CLI returned no matching JSON object (${payloads.length} valid object(s) found). Output: ${preview}`);
  }
  return payload;
}

export type CaseResult = { case_id: string; status: "PASS" | "FAIL"; details: string };

export async function createContext() {
  const inventory = JSON.parse(await readFile(resolve(root, "specs/007-unified-identity/security-baseline/inventory.json"), "utf8"));
  const status = cliJson(cliCall(["status", "--output", "json"]), (value) =>
    typeof value.API_URL === "string" && typeof value.ANON_KEY === "string" && typeof value.SERVICE_ROLE_KEY === "string",
  );
  const apiUrl = String(status.API_URL ?? "");
  const anonKey = String(status.ANON_KEY ?? "");
  const serviceKey = String(status.SERVICE_ROLE_KEY ?? "");
  if (!apiUrl || !anonKey || !serviceKey) throw new Error("Local Supabase status did not return API URL/keys");

  const fixtureSeed = dockerSql(await readFile(resolve(root, "supabase/tests/007-unified-identity/fixture-setup.sql"), "utf8"));
  const migrationPayload = cliJson(
    cliCall(["db", "query", "--local", "--output", "json", "select version from supabase_migrations.schema_migrations order by version"]),
    (value) => Array.isArray(value.rows),
  );
  const migrationRows = migrationPayload.rows as { version: string }[];
  const migrationVersions = migrationRows.map((row) => row.version);
  if (migrationVersions.at(-1) !== "0013") throw new Error(`Before-suite requires applied schema through 0013, found ${migrationVersions.at(-1) ?? "none"}`);

  const tokens = new Map<string, string>();
  for (const [key, actor] of Object.entries(fixtureManifest.actors)) {
    const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: actor.email, password: actor.password }),
    });
    if (!response.ok) throw new Error(`Fixture login ${key} failed with HTTP ${response.status}`);
    const payload = await response.json() as { access_token?: string; user?: { id?: string } };
    if (!payload.access_token || payload.user?.id !== actor.id) throw new Error(`Fixture login ${key} returned an unexpected identity`);
    tokens.set(key, payload.access_token);
  }

  const results: CaseResult[] = [];
  return {
    apiUrl,
    anonKey,
    serviceKey,
    migrationVersions,
    inventory,
    fixtureSeed,
    tokens,
    results,
    async request(path: string, actor?: string, init: RequestInit = {}) {
      const token = actor ? tokens.get(actor) : undefined;
      const headers = new Headers(init.headers);
      headers.set("apikey", actor ? anonKey : anonKey);
      if (!headers.has("Authorization") && token) headers.set("Authorization", `Bearer ${token}`);
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      return fetch(`${apiUrl}${path}`, { ...init, headers });
    },
    serviceHeaders() {
      return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" };
    },
    runSql(sql: string) {
      return dockerSql(sql);
    },
  };
}

export async function record(context: Awaited<ReturnType<typeof createContext>>, caseId: string, pass: boolean, details: string) {
  context.results.push({ case_id: caseId, status: pass ? "PASS" : "FAIL", details });
}

export function parseJson(text: string): unknown {
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

export async function runSqlFile(path: string) {
  return dockerSql(await readFile(resolve(root, path), "utf8"));
}

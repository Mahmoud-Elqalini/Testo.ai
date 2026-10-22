import { createRequire } from "node:module";
import { bindings, defineConfig, defineWorker } from "cf/config";

const require = createRequire(import.meta.url);
const nextEnv = require("@next/env") as typeof import("@next/env");
nextEnv.loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for Cloudflare builds.",
  );
}

export default defineConfig({
  worker: defineWorker({
    name: "testo-ai",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-21",
    compatibilityFlags: ["nodejs_compat"],
    observability: {
      enabled: false,
      logs: {
        enabled: true,
        invocationLogs: true,
        persist: true,
      },
      issues: {
        enabled: true,
      },
    },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      NEXT_PUBLIC_SUPABASE_URL: bindings.text(supabaseUrl),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: bindings.text(supabaseAnonKey),
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
    },
  }),
});

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

declare module 'jsr:@supabase/supabase-js@2' {
  export function createClient(
    url: string,
    anonKey: string,
    options: {
      global: { headers: Record<string, string> }
      auth: { persistSession: boolean; autoRefreshToken: boolean }
    },
  ): {
    auth: {
      getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>
    }
    rpc(operation: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
  }
}

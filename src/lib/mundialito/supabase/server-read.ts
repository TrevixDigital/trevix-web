import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ReadConfiguration } from "./read-config.ts";
import { readonlyFetch } from "./readonly-fetch.ts";
export function createServerReadClient(
  config: Extract<ReadConfiguration, { mode: "supabase" }>,
) {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: readonlyFetch(config.url) },
  });
}

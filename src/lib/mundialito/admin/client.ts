import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { checkAdminAccess, adminCookieOptions } from "./access.ts";
import { adminFetch } from "./transport.ts";
import { readConfiguration } from "../supabase/read-config.ts";

export function adminConfiguration() {
  const config = readConfiguration({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (config.mode !== "supabase")
    throw new Error(
      "La autenticación administrativa requiere configurar Supabase.",
    );
  return config;
}
/** New instance per request. There is intentionally no browser auth client. */
export function createAdminClient(
  config: ReturnType<typeof adminConfiguration>,
  cookies: CookieMethodsServer,
  production = process.env.NODE_ENV === "production",
  implementation: typeof fetch = fetch,
) {
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: adminCookieOptions(
      production,
      "/mundialito",
    ),
    cookies,
    auth: { flowType: "pkce", detectSessionInUrl: false },
    global: { fetch: adminFetch(config.url, implementation) },
  });
}
export function verifyAdmin(client: ReturnType<typeof createAdminClient>) {
  return checkAdminAccess({
    async getVerifiedUser() {
      const { data, error } = await client.auth.getUser();
      return { user: data.user, error };
    },
    async isAdmin() {
      return await client.rpc("is_mundialito_admin", undefined, { get: true });
    },
  });
}

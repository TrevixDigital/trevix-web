import { SupabaseReadError } from "./read-types.ts";
const paths = new Set([
  "/rest/v1/tournaments",
  "/rest/v1/groups",
  "/rest/v1/teams",
  "/rest/v1/matchdays",
  "/rest/v1/matches",
  "/rest/v1/players",
  "/rest/v1/match_events",
  "/rest/v1/mundialito_public_card_snapshot",
  "/rest/v1/mundialito_public_reviews",
  "/rest/v1/mundialito_public_decisions",
]);
/** Restrict even the SDK transport to GETs against the five authorized tables. */
export function readonlyFetch(
  origin: string,
  implementation: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (
      method !== "GET" ||
      url.origin !== origin ||
      !paths.has(url.pathname) ||
      init?.body != null ||
      request?.body != null
    )
      throw new SupabaseReadError(
        "READ_ONLY_VIOLATION",
        "El cliente solo permite consultas GET a las tablas de lectura autorizadas.",
      );
    const originalSignal = init?.signal ?? request?.signal;
    const timeout = AbortSignal.timeout(15000);
    return implementation(input, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: originalSignal
        ? AbortSignal.any([originalSignal, timeout])
        : timeout,
    });
  };
}

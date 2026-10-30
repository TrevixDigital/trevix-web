import { isUuid } from "../players/model.ts";
import { requirePhase4Write } from "../events/capabilities.ts";
import { phase4Capabilities } from "../events/capabilities.ts";
import { classificationWritesEnabled as classificationWriteAllowed } from "../events/classification-capabilities.ts";
import { cardRegistrationCapabilities } from "../events/card-registration.ts";
import { knockoutProgressionEnabled } from "../matches/progression.ts";
const reads = new Set([
  "/rest/v1/rpc/mundialito_knockout_status",
  "/rest/v1/rpc/mundialito_group_basis",
  "/auth/v1/user",
  "/rest/v1/rpc/is_mundialito_admin",
  "/rest/v1/tournaments",
  "/rest/v1/groups",
  "/rest/v1/teams",
  "/rest/v1/matches",
  "/rest/v1/matchdays",
  "/rest/v1/match_audit_log",
  "/rest/v1/players",
  "/rest/v1/match_events",
  "/rest/v1/mundialito_public_card_snapshot",
  "/rest/v1/mundialito_public_reviews",
  "/rest/v1/mundialito_public_decisions",
  "/rest/v1/match_event_reviews",
  "/rest/v1/mundialito_card_requests",
  "/rest/v1/regulatory_audit_log",
  "/rest/v1/mundialito_decisions",
]);
/** Auth and scoped roster writes only; other database mutations and RPCs are blocked. */
export function adminFetch(
  origin: string,
  implementation: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const authWrite =
      method === "POST" &&
      ((url.pathname === "/auth/v1/token" &&
        ["password", "refresh_token"].includes(
          url.searchParams.get("grant_type") ?? "",
        )) ||
        url.pathname === "/auth/v1/logout");
    const read =
      (method === "GET" ||
        (method === "HEAD" && url.pathname.startsWith("/rest/v1/"))) &&
      reads.has(url.pathname) &&
      init?.body == null &&
      request?.body == null;
    let playerWrite = false;
    if (
      url.origin === origin &&
      url.pathname === "/rest/v1/players" &&
      (method === "POST" || method === "PATCH")
    ) {
      try {
        const body = JSON.parse(
          typeof init?.body === "string"
            ? init.body
            : request
              ? await request.clone().text()
              : "",
        );
        if (body && typeof body === "object" && !Array.isArray(body)) {
          const fields =
            method === "POST"
              ? [
                  "id",
                  "tournament_id",
                  "team_id",
                  "slug",
                  "full_name",
                  "shirt_number",
                  "position",
                  "is_active",
                ]
              : [
                  "full_name",
                  "shirt_number",
                  "position",
                  "is_active",
                  "updated_at",
                ];
          playerWrite =
            !url.searchParams.has("on_conflict") &&
            !new Headers(init?.headers ?? request?.headers)
              .get("prefer")
              ?.includes("resolution=") &&
            Object.keys(body).every((key) => fields.includes(key)) &&
            (method === "POST"
              ? isUuid(body.id) &&
                isUuid(body.tournament_id) &&
                isUuid(body.team_id) &&
                typeof body.slug === "string"
              : ["id", "team_id", "tournament_id"].every((key) => {
                  const filter = url.searchParams.get(key);
                  return filter?.startsWith("eq.") && isUuid(filter.slice(3));
                }) &&
                (url.searchParams.get("updated_at")?.startsWith("eq.") ??
                  false));
        }
      } catch {
        playerWrite = false;
      }
    }
    let matchWrite = false;
    if (
      url.origin === origin &&
      url.pathname === "/rest/v1/matches" &&
      method === "PATCH"
    ) {
      try {
        const body = JSON.parse(
          typeof init?.body === "string"
            ? init.body
            : request
              ? await request.clone().text()
              : "",
        );
        matchWrite =
          body &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          Object.keys(body).every((k) =>
            [
              "scheduled_at",
              "venue",
              "notes",
              "status",
              "home_score",
              "away_score",
              "home_penalties",
              "away_penalties",
            ].includes(k),
          ) &&
          ["id", "tournament_id"].every((k) => {
            const f = url.searchParams.get(k);
            return f?.startsWith("eq.") && isUuid(f.slice(3));
          }) &&
          (url.searchParams.get("updated_at")?.startsWith("eq.") ?? false) &&
          !url.searchParams.has("on_conflict") &&
          !new Headers(init?.headers ?? request?.headers)
            .get("prefer")
            ?.includes("resolution=");
      } catch {
        matchWrite = false;
      }
    }
    let eventWrite = false;
    if (
      url.origin === origin &&
      url.pathname === "/rest/v1/match_events" &&
      ["POST", "PATCH", "DELETE"].includes(method)
    ) {
      try {
        const scoped =
          ["id", "tournament_id", "match_id", "team_id"].every((k) => {
            const f = url.searchParams.get(k);
            return f?.startsWith("eq.") && isUuid(f.slice(3));
          }) &&
          (url.searchParams.get("updated_at")?.startsWith("eq.") ?? false);
        if (method === "DELETE")
          eventWrite = !!scoped && init?.body == null && request?.body == null;
        else {
          const body = JSON.parse(
            typeof init?.body === "string"
              ? init.body
              : request
                ? await request.clone().text()
                : "",
          );
          const fields =
            method === "POST"
              ? [
                  "id",
                  "tournament_id",
                  "match_id",
                  "team_id",
                  "player_id",
                  "event_type",
                  "minute",
                  "notes",
                ]
              : ["team_id", "player_id", "event_type", "minute", "notes"];
          eventWrite =
            body &&
            typeof body === "object" &&
            !Array.isArray(body) &&
            Object.keys(body).every((k) => fields.includes(k)) &&
            (method === "POST"
              ? ["id", "tournament_id", "match_id", "team_id"].every((k) =>
                  isUuid(body[k]),
                )
              : !!scoped);
        }
        eventWrite =
          eventWrite &&
          !url.searchParams.has("on_conflict") &&
          !new Headers(init?.headers ?? request?.headers)
            .get("prefer")
            ?.includes("resolution=");
      } catch {
        eventWrite = false;
      }
    }

    let decisionWrite=false;
    if(url.origin===origin&&url.pathname==="/rest/v1/mundialito_decisions"&&method==="POST"&&classificationWriteAllowed()) {
      try {
        const body=JSON.parse(typeof init?.body==="string"?init.body:request?await request.clone().text():"");
        const keys=["id","tournament_id","kind","scope_key","reason","article_reference","document_reference","basis_snapshot","basis_fingerprint","payload","published","recorded_by"];
        decisionWrite=body&&typeof body==="object"&&!Array.isArray(body)&&Object.keys(body).length===keys.length&&Object.keys(body).every(k=>keys.includes(k))&&
          ["id","tournament_id","recorded_by"].every(k=>isUuid(body[k]))&&["draw","third_assignment"].includes(body.kind)&&body.published===true&&
          ["scope_key","reason","article_reference","document_reference"].every(k=>typeof body[k]==="string"&&body[k].trim()&&body[k].length<=1000)&&
          /^[a-f0-9]{64}$/.test(body.basis_fingerprint)&&body.basis_snapshot&&Object.keys(body.basis_snapshot).length===1&&/^[a-f0-9]{64}$/.test(body.basis_snapshot.application_basis)&&
          body.payload&&typeof body.payload==="object"&&!url.searchParams.has("on_conflict")&&!new Headers(init?.headers??request?.headers).get("prefer")?.includes("resolution=");
      } catch {decisionWrite=false;}
    }
    let cardRpc = false;
    if (
      url.origin === origin &&
      method === "POST" &&
      [
        "/rest/v1/rpc/mundialito_get_player_cards",
        "/rest/v1/rpc/mundialito_save_player_cards",
      ].includes(url.pathname)
    ) {
      try {
        const body = JSON.parse(
          typeof init?.body === "string"
            ? init.body
            : request
              ? await request.clone().text()
              : "",
        );
        const saving = url.pathname.endsWith("mundialito_save_player_cards");
        const keys = saving
          ? [
              "p_request_id",
              "p_match_id",
              "p_team_id",
              "p_player_id",
              "p_expected_basis",
              "p_yellows",
              "p_direct_reds",
              "p_yellow_cards",
              "p_red_minute",
              "p_confirmed",
              "p_clear_red_minute",
            ]
          : ["p_match_id", "p_team_id", "p_player_id"];
        cardRpc =
          body &&
          !Array.isArray(body) &&
          Object.keys(body).length === keys.length &&
          Object.keys(body).every((k) => keys.includes(k)) &&
          ["p_match_id", "p_team_id", "p_player_id"].every((k) =>
            isUuid(body[k]),
          );
        if (saving)
          requirePhase4Write("cards", origin);
        if (saving)
          cardRpc =
            cardRpc &&
            isUuid(body.p_request_id) &&
            typeof body.p_expected_basis === "string" &&
            /^[0-9a-f]{64}$/.test(body.p_expected_basis) &&
            body.p_confirmed === true &&
            typeof body.p_clear_red_minute === "boolean" &&
            [0, 1, 2].includes(body.p_yellows) &&
            [0, 1].includes(body.p_direct_reds) &&
            !(body.p_yellows === 2 && body.p_direct_reds === 1) &&
            Array.isArray(body.p_yellow_cards) &&
            body.p_yellow_cards.length === body.p_yellows &&
            (body.p_red_minute === null ||
              (Number.isInteger(body.p_red_minute) &&
                body.p_red_minute >= 0 &&
                body.p_red_minute <= 130));
      } catch {
        cardRpc = false;
      }
    }
    let snapshotRpc = false;
    if (url.origin === origin && method === "POST" && url.pathname === "/rest/v1/rpc/mundialito_get_acta_snapshot") {
      try {
        const c = phase4Capabilities();
        const body = JSON.parse(typeof init?.body === "string" ? init.body : request ? await request.clone().text() : "");
        snapshotRpc = c.read && c.isolated && new URL(origin).origin === new URL(process.env.SUPABASE_PHASE4_ISOLATED_URL!).origin &&
          body && Object.keys(body).length === 1 && isUuid(body.p_match_id);
      } catch { snapshotRpc = false; }
    }
    let cardRegistrationRpc=false;
    if(url.origin===origin&&method==="POST"&&url.pathname==="/rest/v1/rpc/mundialito_register_match_cards"&&cardRegistrationCapabilities().write) {
      try {
        requirePhase4Write("cards",origin);
        const body=JSON.parse(typeof init?.body==="string"?init.body:request?await request.clone().text():"");
        const keys=["match_id","tournament_id","group_id","phase","status","home_team_id","away_team_id","home_score","away_score","home_penalties","away_penalties","cards"];
        cardRegistrationRpc=body&&Object.keys(body).length===2&&isUuid(body.p_match_id)&&body.p_expected&&
          Object.keys(body.p_expected).length===keys.length&&Object.keys(body.p_expected).every(k=>keys.includes(k))&&
          body.p_expected.match_id===body.p_match_id&&Array.isArray(body.p_expected.cards);
      }catch{cardRegistrationRpc=false;}
    }
    let certificationRpc = false;
    if (url.origin === origin && method === "POST" && url.pathname === "/rest/v1/rpc/mundialito_certify_match_events_v2") {
      try {
        requirePhase4Write("certification", origin);
        const body = JSON.parse(typeof init?.body === "string" ? init.body : request ? await request.clone().text() : "");
        const keys = ["p_match_id", "p_expected_basis", "p_expected_updated_at", "p_goals_complete", "p_cards_complete", "p_goals_reference", "p_cards_reference", "p_administrative_decision_id"];
        certificationRpc = body && !Array.isArray(body) && Object.keys(body).length === keys.length && Object.keys(body).every(k => keys.includes(k)) &&
          isUuid(body.p_match_id) && (body.p_expected_updated_at === null || (typeof body.p_expected_updated_at === "string" && Number.isFinite(Date.parse(body.p_expected_updated_at)))) &&
          typeof body.p_expected_basis === "string" && /^[0-9a-f]{64}$/.test(body.p_expected_basis) &&
          typeof body.p_goals_complete === "boolean" && typeof body.p_cards_complete === "boolean" &&
          (body.p_administrative_decision_id === null || isUuid(body.p_administrative_decision_id)) &&
          ["goals", "cards"].every(k => {
            const reference = body[`p_${k}_reference`];
            return (reference === null || (typeof reference === "string" && reference.length <= 1000)) && (!body[`p_${k}_complete`] || (typeof reference === "string" && reference.trim().length > 0));
          });
      } catch { certificationRpc = false; }
    }
    let octavosRpc=false;
    if(url.origin===origin&&method==="POST"&&url.pathname==="/rest/v1/rpc/mundialito_assign_octavos"&&classificationWriteAllowed()&&url.origin===new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin) {
      try {const body=JSON.parse(typeof init?.body==="string"?init.body:request?await request.clone().text():"");
        octavosRpc=Object.keys(body).length===2&&/^[a-f0-9]{64}$/.test(body.p_group_basis)&&Array.isArray(body.p_plan)&&body.p_plan.length===8&&body.p_plan.every((r:Record<string,unknown>)=>Object.keys(r).length===4&&isUuid(r.id)&&isUuid(r.home)&&isUuid(r.away)&&typeof r.version==="string"&&Number.isFinite(Date.parse(r.version)));
      }catch{octavosRpc=false;}
    }
    let knockoutRpc=false;
    if(url.origin===origin&&method==="POST"&&url.pathname==="/rest/v1/rpc/mundialito_save_knockout"&&knockoutProgressionEnabled()&&url.origin===new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin) {
      try {
        const body=JSON.parse(typeof init?.body==="string"?init.body:request?await request.clone().text():"");
        knockoutRpc=!!body&&Object.keys(body).length===3&&isUuid(body.p_match_id)&&typeof body.p_expected_version==="string"&&Number.isFinite(Date.parse(body.p_expected_version))&&body.p_values&&Object.keys(body.p_values).length===8&&Object.keys(body.p_values).every(k=>["status","home_score","away_score","home_penalties","away_penalties","scheduled_at","venue","notes"].includes(k));
      }catch{knockoutRpc=false;}
    }
    if (
      url.origin !== origin ||
      !(
        authWrite ||
        read ||
        playerWrite ||
        matchWrite ||
        eventWrite ||
        cardRpc ||
        certificationRpc ||
        snapshotRpc ||
        cardRegistrationRpc ||
        knockoutRpc ||
        octavosRpc ||
        decisionWrite
      )
    )
      throw new Error(
        "Operación no permitida en el cliente administrativo de esta fase.",
      );
    const signal = init?.signal ?? request?.signal;
    return implementation(input, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  };
}

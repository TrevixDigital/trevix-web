import { RosterError } from "../players/model.ts";

type Environment = Record<string, string | undefined>;
const productionHost = "vhryyxplhefmpykumvma.supabase.co";
/** Server flags are independent. The legacy flag can enable reads only. */
export function phase4Capabilities(env: Environment = process.env) {
  let isolated = false;
  let approvedProductionCards=false;
  try {
    const target=new URL(env.NEXT_PUBLIC_SUPABASE_URL??"");
    approvedProductionCards=env.SUPABASE_PHASE4_WRITE_TARGET==="production"&&
      env.SUPABASE_PHASE4_PRODUCTION_CARD_WRITES_APPROVED==="true"&&
      target.origin===`https://${productionHost}`&&!target.username&&!target.password&&
      target.pathname==="/"&&!target.search&&!target.hash;
  } catch { /* Production approval is an explicit, separate deployment decision. */ }
  try {
    const target = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const approved = new URL(env.SUPABASE_PHASE4_ISOLATED_URL ?? "");
    isolated = env.SUPABASE_PHASE4_WRITE_TARGET === "isolated" &&
      target.origin === approved.origin && target.hostname !== productionHost &&
      !target.username && !target.password && !approved.username && !approved.password &&
      (target.protocol === "https:" ||
        (target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)));
  } catch { /* An absent or invalid target always disables new writes. */ }
  const read = env.SUPABASE_PHASE4_READ_ENABLED === "true" ||
    (env.SUPABASE_PHASE4_READ_ENABLED === undefined && env.SUPABASE_PHASE4_CARDS_ENABLED === "true");
  return {
    read,
    cardsWrite: read && (isolated || approvedProductionCards) && env.SUPABASE_PHASE4_CARD_WRITES_ENABLED === "true",
    certificationWrite: read && isolated && env.SUPABASE_PHASE4_CERTIFICATION_WRITES_ENABLED === "true",
    isolated,
  };
}
export function requirePhase4Write(kind: "cards" | "certification", origin?: string) {
  const capabilities = phase4Capabilities();
  if (!(kind === "cards" ? capabilities.cardsWrite : capabilities.certificationWrite) ||
    (origin && new URL(origin).origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin))
    throw new RosterError("CAPABILITY", "Esta escritura nueva está desactivada. Tarjetas requiere destino y autorización explícitos; certificación solo se permite en el entorno aislado aprobado.");
}

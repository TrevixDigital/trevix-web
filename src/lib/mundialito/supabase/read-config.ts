import { SupabaseReadError } from "./read-types.ts";
export type ReadConfiguration =
  { mode: "local" } | { mode: "supabase"; url: string; publishableKey: string };
export function readConfiguration(env: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}): ReadConfiguration {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !key) return { mode: "local" };
  if (!url || !key)
    throw new SupabaseReadError(
      "INCOMPLETE_ENV",
      "Configure juntas NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; no se usará un origen local como respaldo.",
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SupabaseReadError(
      "INVALID_URL",
      "NEXT_PUBLIC_SUPABASE_URL no es una URL válida.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  )
    throw new SupabaseReadError(
      "INVALID_URL",
      "La URL de Supabase debe ser un origen HTTPS sin credenciales ni parámetros.",
    );
  if (!key.startsWith("sb_publishable_"))
    throw new SupabaseReadError(
      "INVALID_PUBLISHABLE_KEY",
      "Esta etapa requiere una clave publishable; no se admiten claves secretas, service_role ni credenciales de sesión.",
    );
  return { mode: "supabase", url: parsed.origin, publishableKey: key };
}

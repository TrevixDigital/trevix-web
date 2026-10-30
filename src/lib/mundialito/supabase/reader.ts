import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadTable, TournamentReader, ReadRow } from "./read-types.ts";
import { SupabaseReadError } from "./read-types.ts";
export const READ_COLUMNS: Readonly<Record<ReadTable, string>> = {
  tournaments: "id,name,slug,season,location,created_at",
  groups: "id,tournament_id,name,created_at",
  teams: "id,tournament_id,group_id,name,slug,created_at",
  matchdays:
    "id,tournament_id,number,scheduled_date,phase,created_at,updated_at",
  // Scores are public match data. Individual events and private audit records remain separate.
  matches:
    "id,tournament_id,matchday_id,match_number,phase,bracket_code,group_id,home_team_id,away_team_id,home_source,away_source,scheduled_at,venue,status,home_score,away_score,home_penalties,away_penalties,notes,created_at,updated_at",
};
export function createTournamentReader(
  client: Pick<SupabaseClient, "from">,
): TournamentReader {
  return {
    async read(table, filter) {
      const rows: ReadRow[] = [];
      let expected: number | undefined;
      for (let page = 0; page < 100; page++) {
        let response;
        try {
          response = await client
            .from(table)
            .select(READ_COLUMNS[table], { count: "exact" })
            .eq(filter.column, filter.value)
            .order("id", { ascending: true })
            .range(rows.length, rows.length + 99);
        } catch {
          throw new SupabaseReadError(
            "SUPABASE_READ_FAILED",
            `No se pudo leer ${table}. Revise la conexión y los permisos públicos de lectura.`,
          );
        }
        const { data, error, count } = response;
        if (
          error ||
          !Array.isArray(data) ||
          typeof count !== "number" ||
          !Number.isSafeInteger(count) ||
          count < 0
        )
          throw new SupabaseReadError(
            "SUPABASE_READ_FAILED",
            `No se pudo leer ${table} de forma completa. Revise la conexión y los permisos públicos de lectura.`,
          );
        if (expected !== undefined && expected !== count)
          throw new SupabaseReadError(
            "UNSTABLE_READ",
            `La lectura de ${table} cambió durante la paginación. Reintente.`,
          );
        expected = count;
        if (
          data.some(
            (row) =>
              row === null || typeof row !== "object" || Array.isArray(row),
          )
        )
          throw new SupabaseReadError(
            "INVALID_RESPONSE",
            `Respuesta inválida de ${table}.`,
          );
        rows.push(...(data as unknown as ReadRow[]));
        if (rows.length === count) return rows;
        if (!data.length || rows.length > count)
          throw new SupabaseReadError(
            "INCOMPLETE_READ",
            `Lectura incompleta de ${table}; no se utilizarán filas parciales.`,
          );
      }
      throw new SupabaseReadError(
        "READ_LIMIT",
        "La lectura excede el límite de paginación de esta integración.",
      );
    },
  };
}

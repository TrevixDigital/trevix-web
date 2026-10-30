import { createHash } from "node:crypto";
import {
  makePlayerSlug,
  normalizePlayerName,
  validatePlayerValues,
  RosterError,
  type RosterContext,
  type RosterPlayer,
} from "./model.ts";

export interface RosterFile {
  name: string;
  text: string;
  sha256: string;
  encoding: string;
}
export function selectManifestFiles(
  files: RosterFile[],
  manifest: unknown,
  tournamentId: string,
) {
  if (!manifest || typeof manifest !== "object")
    throw new RosterError("MANIFEST", "Manifiesto de simulación no válido.");
  const m = manifest as Record<string, unknown>;
  if (
    m.mode !== "dry-run" ||
    m.version !== 1 ||
    m.tournamentId !== tournamentId ||
    !Array.isArray(m.reports) ||
    !m.reports.length
  )
    throw new RosterError(
      "MANIFEST",
      "El manifiesto no corresponde a este torneo o formato.",
    );
  const names = new Set<string>();
  const selected = m.reports.map((r: unknown) => {
    if (!r || typeof r !== "object")
      throw new RosterError("MANIFEST", "Entrada de manifiesto no válida.");
    const row = r as Record<string, unknown>;
    if (
      typeof row.file !== "string" ||
      /[\\/]/.test(row.file) ||
      !row.file.endsWith(".txt") ||
      names.has(row.file) ||
      typeof row.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(row.sha256)
    )
      throw new RosterError(
        "MANIFEST",
        "Archivo o huella no válidos en el manifiesto.",
      );
    names.add(row.file);
    const file = files.find((f) => f.name === row.file);
    if (!file || file.sha256 !== row.sha256)
      throw new RosterError(
        "MANIFEST",
        "Un archivo falta o cambió desde la vista previa. Genera una simulación nueva antes de continuar.",
      );
    return file;
  });
  return {
    selected,
    additionalFiles: files.filter((f) => !names.has(f.name)).map((f) => f.name),
  };
}
export interface PreviewEntry {
  line: number;
  raw: string;
  ordinal: number | null;
  name: string | null;
  status: "header" | "blank" | "create" | "omit" | "review";
  issues: string[];
  matches: string[];
  proposal?: {
    id: string;
    tournament_id: string;
    team_id: string;
    full_name: string;
    slug: string;
    shirt_number: null;
    position: null;
    is_active: true;
  };
}
const label = (s: string) =>
  normalizePlayerName(s.replace(/_/g, " ")).replace(/^nomina\s+/, "");
export const sha256 = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex");
/** Application-specific deterministic UUID v8; independent of source line/order/filename. */
export function importPlayerId(
  tournamentId: string,
  teamId: string,
  name: string,
) {
  const hex = sha256(
    JSON.stringify([
      "mundialito-roster-v1",
      tournamentId,
      teamId,
      name.normalize("NFC"),
    ]),
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function decodeRosterFile(name: string, bytes: Uint8Array): RosterFile {
  let encoding = "UTF-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "UTF-16LE";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "UTF-16BE";
  // Fatal decoding prevents silent replacement characters or guessed legacy encodings.
  const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  return { name, text, encoding, sha256: sha256(bytes) };
}
export function buildImportPreview(
  files: RosterFile[],
  context: RosterContext,
  existing: RosterPlayer[],
) {
  const reports = files.map((file) => {
    const stem = file.name.replace(/\.txt$/i, "");
    const candidates = context.teams.filter(
      (t) => label(t.name) === label(stem),
    );
    const team = candidates.length === 1 ? candidates[0] : null;
    const lines = file.text.split(/\r\n|\n|\r/);
    const trailingNewline = /(?:\r\n|\r|\n)$/.test(file.text);
    if (trailingNewline) lines.pop(); // A final terminator is not an additional physical blank line.
    const entries: PreviewEntry[] = lines.map((raw, index) => {
      const base: PreviewEntry = {
        line: index + 1,
        raw,
        ordinal: null,
        name: null,
        status: "review",
        issues: [],
        matches: [],
      };
      if (!raw.trim()) return { ...base, status: "blank" };
      if (index === 0 && label(raw.trim()) === label(stem))
        return { ...base, status: "header" };
      const numbered = raw.match(/^\s*(\d+)[.)]\s?(.*)$/u);
      base.ordinal = numbered ? Number(numbered[1]) : null;
      base.name = numbered ? numbered[2] : raw;
      if (!base.name.trim()) {
        base.issues.push("Entrada numerada sin nombre; no es un jugador.");
        return base;
      }
      if (!team)
        base.issues.push(
          "No hay una coincidencia única con el nombre completo de un equipo oficial.",
        );
      if (base.name !== base.name.trim() || /\s{2,}/u.test(base.name))
        base.issues.push(
          "Espacios adicionales: requiere revisión, sin corregir automáticamente.",
        );
      if (/[^\p{L}\p{M} .’'\-]/u.test(base.name))
        base.issues.push(
          "Caracteres o formato fuera de un nombre habitual; revisar sin descartar por suponer un error.",
        );
      if (
        /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(
          base.name,
        )
      )
        base.issues.push("Carácter de control o invisible.");
      try {
        validatePlayerValues({
          fullName: base.name,
          shirtNumber: null,
          position: null,
          active: true,
        });
      } catch {
        base.issues.push("El nombre no supera la validación del formulario.");
      }
      if (team) {
        base.proposal = {
          id: importPlayerId(context.tournamentId, team.id, base.name),
          tournament_id: context.tournamentId,
          team_id: team.id,
          full_name: base.name,
          slug: makePlayerSlug(
            base.name,
            importPlayerId(context.tournamentId, team.id, base.name),
          ),
          shirt_number: null,
          position: null,
          is_active: true,
        };
        const roster = existing.filter((p) => p.teamId === team.id);
        const exact = roster.filter((p) => p.fullName === base.name);
        const similar = roster.filter(
          (p) =>
            normalizePlayerName(p.fullName) === normalizePlayerName(base.name!),
        );
        const idConflict = existing.find(
          (p) =>
            p.id === base.proposal!.id &&
            (p.teamId !== team.id || p.fullName !== base.name),
        );
        const slugConflict = roster.find(
          (p) => p.slug === base.proposal!.slug && p.id !== base.proposal!.id,
        );
        base.matches = similar.map((p) => p.id);
        if (idConflict)
          base.issues.push(
            "El UUID propuesto ya pertenece a una ficha diferente.",
          );
        if (slugConflict)
          base.issues.push("El slug propuesto ya está ocupado por otra ficha.");
        if (exact.length > 1)
          base.issues.push(
            "Varias fichas existentes tienen exactamente este nombre; posible homónimo.",
          );
        if (similar.length > exact.length)
          base.issues.push(
            "Coincidencia por acentos, mayúsculas o espacios en Supabase; revisar identidad.",
          );
        base.status = base.issues.length
          ? "review"
          : exact.length === 1
            ? "omit"
            : "create";
      }
      return base;
    });
    const numbered = entries.filter((e) => e.ordinal !== null);
    for (let i = 0; i < numbered.length; i++)
      if (numbered[i].ordinal !== i + 1) {
        numbered[i].issues.push(
          "Numeración repetida, incompleta o fuera de secuencia; no se interpreta como dorsal.",
        );
        numbered[i].status = "review";
      }
    return {
      file: file.name,
      sha256: file.sha256,
      encoding: file.encoding,
      trailingNewline,
      team,
      entries,
    };
  });
  // Detect all occurrences, including duplicates across different files for the same team.
  const nameGroups = new Map<string, PreviewEntry[]>();
  for (const report of reports)
    for (const entry of report.entries)
      if (entry.name?.trim()) {
        const key = JSON.stringify([
          report.team?.id ?? label(report.file),
          normalizePlayerName(entry.name),
        ]);
        nameGroups.set(key, [...(nameGroups.get(key) ?? []), entry]);
      }
  for (const entries of nameGroups.values())
    if (entries.length > 1)
      for (const entry of entries) {
        entry.issues.push(
          "Nombre repetido o similar en los archivos del mismo equipo: confirmar si es un homónimo.",
        );
        entry.status = "review";
      }
  const entries = reports.flatMap((r) => r.entries);
  const summary = {
    files: reports.length,
    detectedPlayers: entries.filter((e) => e.name?.trim()).length,
    create: entries.filter((e) => e.status === "create").length,
    omit: entries.filter((e) => e.status === "omit").length,
    review: entries.filter((e) => e.status === "review").length,
    blank: entries.filter((e) => e.status === "blank").length,
  };
  const snapshot = existing
    .map((p) => ({
      id: p.id,
      teamId: p.teamId,
      name: p.fullName,
      slug: p.slug,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    mode: "dry-run" as const,
    version: 1,
    tournamentId: context.tournamentId,
    existingCount: existing.length,
    snapshotHash: sha256(JSON.stringify(snapshot)),
    planHash: sha256(JSON.stringify(reports)),
    summary,
    reports,
  };
}
export type ImportPreview = ReturnType<typeof buildImportPreview>;

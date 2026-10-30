export type GroupId = "A" | "B" | "C" | "D" | "E" | "F";
export interface Team {
  readonly name: string;
  readonly slug: string;
  readonly group: GroupId;
}
export const groupIds: readonly GroupId[] = ["A", "B", "C", "D", "E", "F"];
// Catálogo oficial cerrado. No hay operaciones de creación en esta fase.
export const teams: readonly Team[] = [
  { name: "La Bomba", slug: "la-bomba", group: "A" },
  { name: "Villa Hermosa", slug: "villa-hermosa", group: "A" },
  { name: "La Casaca", slug: "la-casaca", group: "A" },
  { name: "San Julián", slug: "san-julian", group: "B" },
  { name: "Sagrado", slug: "sagrado", group: "B" },
  { name: "2.da Del Sagrado", slug: "2da-del-sagrado", group: "B" },
  { name: "San Diego", slug: "san-diego", group: "C" },
  { name: "La Florida", slug: "la-florida", group: "C" },
  { name: "El Esqueleto", slug: "el-esqueleto", group: "C" },
  { name: "Tamaris", slug: "tamaris", group: "D" },
  { name: "Esperancita", slug: "esperancita", group: "D" },
  { name: "2da La Bomba", slug: "2da-la-bomba", group: "D" },
  { name: "La Pista 65", slug: "la-pista-65", group: "E" },
  { name: "La Gloria", slug: "la-gloria", group: "E" },
  { name: "El Mango", slug: "el-mango", group: "E" },
  { name: "Lagunitas", slug: "lagunitas", group: "F" },
  { name: "Los Ángeles", slug: "los-angeles", group: "F" },
  { name: "El Tambo", slug: "el-tambo", group: "F" },
];

import type { Player } from "../domain/types.ts";
export const players: readonly Player[] = [];
// Persist a UUID as id; append it to a readable name to avoid same-name collisions.
export function playerSlug(name: string, id: string) {
  const readable = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${readable}--${id}`;
}

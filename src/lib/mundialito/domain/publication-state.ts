import type { PublicationState } from "./types.ts";
import type { ClassificationPublication } from "./governance.ts";
/** A resolved calculation can only be labeled confirmed after the institutional gate. */
export function publishedState(calculated:PublicationState,publication:ClassificationPublication,ready=true):PublicationState {
  return calculated==="confirmed"&&(publication.status!=="official"||!ready)?"provisional":calculated;
}

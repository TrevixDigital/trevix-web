import type { ReactNode } from "react";
import type { PendingReason, PublicationState } from "@/lib/mundialito/domain/types";
export const pendingLabels: Record<PendingReason, string> = {
  results: "Resultados oficiales pendientes",
  discipline: "Datos disciplinarios pendientes",
  draw: "Sorteo documentado pendiente",
  interpretation: "Interpretación reglamentaria pendiente del Comité",
  assignment: "Asignación de terceros pendiente",
  penalties: "Tanda de penales pendiente",
};
export function StateBadge({ state }: { state: PublicationState }) {
  return (
    <span className={`state-badge state-${state}`}>
      {state === "confirmed"
        ? "CONFIRMADO"
        : state === "provisional"
          ? "PROVISIONAL"
          : "PENDIENTE"}
    </span>
  );
}
export function PendingNotice({
  reasons,
}: {
  reasons: readonly PendingReason[];
}) {
  return (
    <div className="pending-reasons">
      {[...new Set(reasons)].map((reason) => (
        <span key={reason}>{pendingLabels[reason]}</span>
      ))}
    </div>
  );
}
export function DataEmpty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="data-empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function StatGrid({
  items,
}: {
  items: readonly { label: string; value: string | number | null }[];
}) {
  return (
    <dl className="stat-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

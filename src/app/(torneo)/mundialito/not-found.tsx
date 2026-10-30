import Link from "next/link";
export default function NotFound() {
  return (
    <section className="shell section empty-state">
      <p className="eyebrow">404 · FUERA DE CANCHA</p>
      <h1>Página no encontrada</h1>
      <p>La página o el equipo que buscas no está disponible.</p>
      <Link href="/mundialito" className="button button-gold">
        Volver al inicio
      </Link>
    </section>
  );
}

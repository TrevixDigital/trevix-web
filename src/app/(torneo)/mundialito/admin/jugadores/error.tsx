"use client";
import styles from "../admin.module.css";
export default function RosterErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className={styles.dashboard}>
      <h1>No se pudo cargar la nómina</h1>
      <p className={styles.notice}>
        Revisa la conexión y los permisos de lectura de Supabase. No se
        mostrarán datos locales como respaldo.
      </p>
      <button className={styles.secondary} onClick={reset}>
        Volver a intentar
      </button>
    </section>
  );
}

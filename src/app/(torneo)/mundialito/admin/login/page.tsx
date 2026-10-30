import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LockKeyhole, ArrowLeft } from "lucide-react";
import { LoginForm } from "./login-form";
import { serverAdminClient } from "@/lib/mundialito/admin/server";
import { verifyAdmin } from "@/lib/mundialito/admin/client";
import styles from "../admin.module.css";
export const metadata = { title: "Acceso administrativo" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  // Do not catch Next's prerender bailout as an authentication/configuration error.
  await connection();
  let access: "allowed" | "anonymous" | "denied" | "unavailable" =
    "unavailable";
  try {
    access = await verifyAdmin(await serverAdminClient());
  } catch {
    /* Closed when environment or authorization is unavailable. */
  }
  if (access === "allowed") redirect("/mundialito/admin");
  const { estado } = await searchParams;
  return (
    <section className={styles.loginShell}>
      <div className={styles.loginIntro}>
        <p className={styles.eyebrow}>MUNDIALITO LA BOMBA · 2026</p>
        <h1>
          El control del torneo,
          <br />
          <span>en buenas manos.</span>
        </h1>
        <p>
          Acceso reservado para el equipo organizador. Tu sesión y tus permisos
          se verifican con Supabase.
        </p>
        <Link href="/mundialito" className={styles.backLink}>
          <ArrowLeft size={17} aria-hidden="true" /> Volver al sitio público
        </Link>
      </div>
      <div className={styles.loginCard}>
        <span className={styles.lockIcon}>
          <LockKeyhole size={26} aria-hidden="true" />
        </span>
        <h2>Administración</h2>
        <p className={styles.hint}>Inicia sesión para acceder al panel.</p>
        {access === "denied" ? (
          <div role="alert">
            <h3>Acceso denegado</h3>
            <p>Tu sesión no tiene autorización administrativa.</p>
            <form action="/mundialito/admin/logout" method="post">
              <button className={styles.primary}>
                Cerrar sesión y cambiar de usuario
              </button>
            </form>
          </div>
        ) : (
          <>
            {access === "unavailable" && (
              <p role="alert" className={styles.notice}>
                No se pudo verificar la configuración o los permisos. El acceso
                permanece bloqueado; inténtalo más tarde.
              </p>
            )}
            {estado === "salida" && (
              <p role="status" className={styles.notice}>
                La sesión se cerró en este navegador.
              </p>
            )}
            {estado === "salida-local" && (
              <p role="status" className={styles.notice}>
                El acceso se cerró en este navegador. No se pudo confirmar el
                cierre remoto de la sesión.
              </p>
            )}
            {estado === "denegado" && (
              <p role="alert" className={styles.notice}>
                No se pudo autorizar el acceso administrativo.
              </p>
            )}
            <LoginForm disabled={access === "unavailable"} />
          </>
        )}
      </div>
    </section>
  );
}

"use client";
import { useActionState } from "react";
import { signInAdmin } from "../actions";
import styles from "../admin.module.css";
export function LoginForm({ disabled = false }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(signInAdmin, { error: "" });
  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      <label htmlFor="admin-email">Correo electrónico</label>
      <input
        id="admin-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        maxLength={254}
        disabled={disabled || pending}
        autoCapitalize="none"
        spellCheck={false}
      />
      <label htmlFor="admin-password">Contraseña</label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={1024}
        disabled={disabled || pending}
      />
      <p role="alert" className={styles.formError}>
        {state.error}
      </p>
      <button
        className={styles.primary}
        type="submit"
        disabled={disabled || pending}
      >
        {pending ? "Verificando acceso…" : "Iniciar sesión"}
      </button>
      <p className={styles.hint}>
        Utiliza tu usuario existente de Supabase. Solo pueden entrar usuarios
        autorizados por la organización.
      </p>
    </form>
  );
}

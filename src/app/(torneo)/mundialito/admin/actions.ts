"use server";
import { redirect } from "next/navigation";
import { clearAdminCookies, serverAdminClient } from "@/lib/mundialito/admin/server";
import { verifyAdmin } from "@/lib/mundialito/admin/client";

export interface LoginState {
  error: string;
}
export async function signInAdmin(
  _previous: LoginState,
  form: FormData,
): Promise<LoginState> {
  const email = form.get("email"),
    password = form.get("password");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    email.length > 254 ||
    !password ||
    password.length > 1024
  )
    return { error: "Introduce un correo válido y tu contraseña." };
  try {
    const client = await serverAdminClient(true);
    const login = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (login.error)
      return {
        error:
          login.error.status === 429
            ? "Demasiados intentos. Espera unos minutos e inténtalo otra vez."
            : "No se pudo iniciar sesión. Comprueba el correo y la contraseña.",
      };
    const access = await verifyAdmin(client);
    if (access !== "allowed") {
      await client.auth.signOut({ scope: "local" });
      await clearAdminCookies();
      return {
        error:
          access === "denied"
            ? "Tu usuario no tiene autorización administrativa."
            : "No se pudo verificar el permiso administrativo. Inténtalo de nuevo más tarde.",
      };
    }
  } catch {
    await clearAdminCookies();
    return {
      error:
        "El acceso no está disponible. Revisa la conexión e inténtalo de nuevo.",
    };
  }
  redirect("/mundialito/admin");
}

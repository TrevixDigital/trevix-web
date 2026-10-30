import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  adminConfiguration,
  createAdminClient,
  verifyAdmin,
} from "./client.ts";
import { adminCookieDeletions } from "./access.ts";

export async function serverAdminClient(writable = false) {
  const store = await cookies();
  return createAdminClient(adminConfiguration(), {
    getAll: () => store.getAll(),
    setAll(values) {
      // Proxy owns refresh writes during rendering; actions/handlers may persist them.
      if (writable)
        values.forEach(({ name, value, options }) =>
          store.set(name, value, options),
        );
    },
  });
}
export async function clearAdminCookies() {
  const store = await cookies();
  const deletions = adminCookieDeletions(
    store.getAll().map((cookie) => cookie.name),
    process.env.NODE_ENV === "production",
    "/mundialito",
  );
  for (const cookie of deletions) store.set(cookie);
}
/** DAL guard: invoke inside every future private data operation, not only a layout. */
export const requireAdministrator = cache(async () => {
  const client = await serverAdminClient();
  const access = await verifyAdmin(client);
  if (access === "anonymous") redirect("/mundialito/admin/login");
  if (access !== "allowed") redirect("/mundialito/admin/login?estado=denegado");
  return client;
});

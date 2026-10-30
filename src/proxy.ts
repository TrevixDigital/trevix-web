import { NextResponse, type NextRequest } from "next/server.js";
import type { CookieOptions } from "@supabase/ssr";
import {
  adminConfiguration,
  createAdminClient,
  verifyAdmin,
} from "./lib/mundialito/admin/client.ts";
import { isPublicAdminPath } from "./lib/mundialito/admin/access.ts";

function closedPage(status: number, basePath: string) {
  const denied = status === 403;
  return new NextResponse(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Administración | Mundialito La Bomba</title><body style="margin:0;background:#071116;color:#f5f4ed;font:16px/1.6 Arial,sans-serif;min-height:100vh;display:grid;place-items:center"><main style="max-width:540px;margin:24px;padding:32px;border:1px solid #d7b45d;border-radius:12px"><p style="color:#f4c456">MUNDIALITO LA BOMBA 2026</p><h1>${denied ? "Acceso denegado" : "Acceso temporalmente no disponible"}</h1><p>${denied ? "Tu sesión no tiene autorización administrativa." : "No se pudo verificar el acceso. Inténtalo nuevamente más tarde."}</p><a style="color:#f4c456" href="${basePath}/admin/login">Volver al acceso</a><form method="post" action="${basePath}/admin/logout"><button style="margin-top:24px;padding:12px 20px;background:#f4c456;border:0;border-radius:6px;cursor:pointer">Cerrar sesión</button></form></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
export async function proxy(request: NextRequest) {
  const basePath = "/mundialito";
  const pathname = request.nextUrl.pathname;
  if (pathname !== "/mundialito/admin" && !pathname.startsWith("/mundialito/admin/")) return NextResponse.next();
  const path = pathname.slice(basePath.length).replace(/\/$/, "") || "/";
  const pending = new Map<
    string,
    { name: string; value: string; options: CookieOptions }
  >();
  let response: NextResponse;
  try {
    const client = createAdminClient(adminConfiguration(), {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const cookie of values) {
          request.cookies.set(cookie.name, cookie.value);
          pending.set(cookie.name, cookie);
        }
      },
    });
    // getUser validates with Auth and refreshes through the SSR cookie adapter.
    const access =
      path === "/admin/logout"
        ? "public"
        : isPublicAdminPath(path)
          ? (await client.auth.getUser(), "public")
          : await verifyAdmin(client);
    if (access === "anonymous") {
      const login = request.nextUrl.clone();
      login.pathname = "/mundialito/admin/login";
      login.search = "";
      response = NextResponse.redirect(login);
    } else if (access === "denied") response = closedPage(403, basePath);
    else if (access === "unavailable") response = closedPage(503, basePath);
    else response = NextResponse.next({ request });
  } catch {
    response = isPublicAdminPath(path)
      ? NextResponse.next({ request })
      : closedPage(503, basePath);
  }
  for (const { name, value, options } of pending.values())
    response.cookies.set(name, value, options);
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, max-age=0, must-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; form-action 'self'; base-uri 'self'",
  );
  return response;
}
export const config = { matcher: ["/mundialito/admin/:path*"] };

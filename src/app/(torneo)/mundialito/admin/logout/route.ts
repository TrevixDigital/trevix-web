import { NextResponse, type NextRequest } from "next/server";
import { clearAdminCookies, serverAdminClient } from "@/lib/mundialito/admin/server";
import { isSameRequestOrigin } from "@/lib/mundialito/admin/access";
export async function POST(request: NextRequest) {
  if (
    !isSameRequestOrigin(
      request.headers.get("origin"),
      request.headers.get("host"),
      request.nextUrl.protocol,
    )
  )
    return new NextResponse("Solicitud no permitida.", {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  let remoteClosed = false;
  try {
    const result = await (
      await serverAdminClient(true)
    ).auth.signOut({ scope: "local" });
    remoteClosed = !result.error;
  } catch {
    /* Always clear this browser's auth cookies. */
  }
  await clearAdminCookies();
  // Relative Location keeps the browser on its actual LAN/production hostname.
  return new NextResponse(null, {
    status: 303,
    headers: {
      "Cache-Control": "private, no-store",
      Location: `/mundialito/admin/login?estado=${remoteClosed ? "salida" : "salida-local"}`,
    },
  });
}

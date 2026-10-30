import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { proxy } from "../../src/proxy.ts";
import { ADMIN_COOKIE } from "../../src/lib/mundialito/admin/access.ts";

const user = {
  id: "00000000-0000-4000-8000-000000000123",
  aud: "authenticated",
  role: "authenticated",
  email: "private-test@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
function session(expired = false) {
  const expiry = Math.floor(Date.now() / 1000) + (expired ? -60 : 3600);
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expiry })).toString("base64url")}.test-signature`;
  return {
    access_token: token,
    refresh_token: "only-test-refresh",
    expires_in: 3600,
    expires_at: expiry,
    token_type: "bearer",
    user,
  };
}
function setup(
  t: TestContext,
  permission: unknown = true,
  { invalid = false, rpcError = false } = {},
) {
  const beforeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    beforeKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proxy-test.example";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_only_test";
  t.after(() => {
    if (beforeUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = beforeUrl;
    if (beforeKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = beforeKey;
  });
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/auth/v1/user")
      return invalid ? json({ message: "Invalid token" }, 401) : json(user);
    if (url.pathname === "/auth/v1/token") return json(session());
    if (url.pathname === "/rest/v1/rpc/is_mundialito_admin")
      return rpcError
        ? json({ message: "Permission denied", code: "42501" }, 403)
        : json(permission);
    throw new Error("Unexpected request");
  });
  return calls;
}
function request(path: string, withSession = true, expired = false) {
  return new NextRequest(`https://torneo.example${path}`, {
    headers: withSession
      ? {
          cookie: `${ADMIN_COOKIE}=base64-${Buffer.from(JSON.stringify(session(expired))).toString("base64url")}`,
        }
      : {},
  });
}
test("proxy administrativo: visitante directo al panel o subruta privada recibe login sin contenido privado", async (t) => {
  const calls = setup(t);
  for (const path of ["/mundialito/admin", "/mundialito/admin/partidos", "/mundialito/admin/login/privado"]) {
    const response = await proxy(request(path, false));
    assert.equal(response.status, 307);
    assert.equal(
      new URL(response.headers.get("location")!).pathname,
      "/mundialito/admin/login",
    );
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    assert.equal(await response.text(), "");
  }
  assert.equal(calls.length, 0);
});
test("proxy administrativo: usuario autenticado sin permiso recibe HTTP 403 sin datos privados", async (t) => {
  setup(t, false);
  const response = await proxy(request("/mundialito/admin"));
  assert.equal(response.status, 403);
  const body = await response.text();
  assert.match(body, /Acceso denegado/);
  assert.equal(body.includes(user.email), false);
});
test("proxy administrativo: solo RPC true deja pasar al administrador", async (t) => {
  const calls = setup(t, true);
  const response = await proxy(request("/mundialito/admin"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.deepEqual(calls, [
    "/auth/v1/user",
    "/rest/v1/rpc/is_mundialito_admin",
  ]);
});
test("proxy administrativo: RPC NULL y errores permanecen cerrados", async (t) => {
  setup(t, null);
  assert.equal((await proxy(request("/mundialito/admin"))).status, 403);
});
test("proxy administrativo: error de RLS muestra 503 sin autorizar", async (t) => {
  setup(t, true, { rpcError: true });
  assert.equal((await proxy(request("/mundialito/admin"))).status, 503);
});
test("proxy administrativo: cookie con identidad inventada no evita validar Auth", async (t) => {
  const calls = setup(t, true, { invalid: true });
  const response = await proxy(request("/mundialito/admin"));
  assert.equal(response.status, 307);
  assert.equal(
    calls.some((path) => path.includes("is_mundialito_admin")),
    false,
  );
});
test("proxy administrativo: renovación conserva Set-Cookie HttpOnly y no-store en respuesta autorizada", async (t) => {
  const calls = setup(t, true);
  const response = await proxy(request("/mundialito/admin", true, true));
  assert.equal(response.status, 200);
  assert.ok(calls.includes("/auth/v1/token"));
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(response.headers.get("cache-control")!, /no-store/);
});
test("proxy administrativo: login público no exige admin; logout no provoca renovación", async (t) => {
  const calls = setup(t, false);
  assert.equal((await proxy(request("/mundialito/admin/login", false))).status, 200);
  assert.equal((await proxy(request("/mundialito/admin/logout", true, true))).status, 200);
  assert.equal(calls.length, 0);
});
test("proxy administrativo: renovación conserva cookies incluso al denegar acceso", async (t) => {
  setup(t, false);
  const response = await proxy(request("/mundialito/admin", true, true));
  assert.equal(response.status, 403);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(response.headers.get("cache-control")!, /no-store/);
});

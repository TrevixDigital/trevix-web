import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAdminAccess,
  adminCookieOptions,
  adminCookieDeletions,
  isAdminCookie,
  isPublicAdminPath,
  isSameOrigin,
  isSameRequestOrigin,
  ADMIN_COOKIE,
} from "../../src/lib/mundialito/admin/access.ts";
import { adminFetch } from "../../src/lib/mundialito/admin/transport.ts";
import { createAdminClient, verifyAdmin } from "../../src/lib/mundialito/admin/client.ts";
import { readAdminDashboard } from "../../src/lib/mundialito/admin/dashboard.ts";

test("admin: visitante, sesión caducada y cookie no verificada no consultan permisos", async () => {
  for (const result of [
    { user: null, error: null },
    { user: { id: "forged" }, error: new Error("expired") },
  ]) {
    let called = false;
    assert.equal(
      await checkAdminAccess({
        async getVerifiedUser() {
          return result;
        },
        async isAdmin() {
          called = true;
          return { data: true, error: null };
        },
      }),
      "anonymous",
    );
    assert.equal(called, false);
  }
});
test("admin: solo el booleano true autoriza; false, NULL, cadenas y errores se rechazan", async () => {
  for (const data of [
    false,
    null,
    undefined,
    "true",
    1,
    [true],
    { admin: true },
  ])
    assert.equal(
      await checkAdminAccess({
        async getVerifiedUser() {
          return { user: { id: "verified" }, error: null };
        },
        async isAdmin() {
          return { data, error: null };
        },
      }),
      "denied",
    );
  assert.equal(
    await checkAdminAccess({
      async getVerifiedUser() {
        return { user: { id: "verified" }, error: null };
      },
      async isAdmin() {
        return { data: true, error: new Error("RLS") };
      },
    }),
    "unavailable",
  );
  assert.equal(
    await checkAdminAccess({
      async getVerifiedUser() {
        throw new Error("network");
      },
      async isAdmin() {
        return { data: true, error: null };
      },
    }),
    "unavailable",
  );
});
test("admin: cookies HttpOnly, Secure en producción, host-only y delimitadas a admin", () => {
  assert.deepEqual(adminCookieOptions(true), {
    name: ADMIN_COOKIE,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/admin",
  });
  assert.equal(
    adminCookieOptions(false, "/mundialito").path,
    "/mundialito/admin",
  );
  assert.equal(adminCookieOptions(false).secure, false);
  for (const name of [ADMIN_COOKIE, `${ADMIN_COOKIE}.0`, `${ADMIN_COOKIE}.12`])
    assert.equal(isAdminCookie(name), true);
  for (const name of [
    "other-session",
    `${ADMIN_COOKIE}-other`,
    `${ADMIN_COOKIE}.x`,
  ])
    assert.equal(isAdminCookie(name), false);
});
test("admin: ninguna subruta privada se confunde con login/logout; CSRF rechaza otro origen", () => {
  assert.equal(isPublicAdminPath("/admin/login"), true);
  for (const path of [
    "/admin",
    "/admin/partidos",
    "/admin/login/privado",
    "/admin/login-extra",
    "/admin/estadisticas",
  ])
    assert.equal(isPublicAdminPath(path), false);
  assert.equal(
    isSameOrigin(
      "https://torneo.example",
      "https://torneo.example/admin/logout",
    ),
    true,
  );
  for (const origin of [
    null,
    "null",
    "http://torneo.example",
    "https://evil.example",
    "not-a-url",
  ])
    assert.equal(
      isSameOrigin(origin, "https://torneo.example/admin/logout"),
      false,
    );
});
test("admin: transporte bloquea escrituras de datos, otros RPC, signup y otros orígenes", async () => {
  let sent = 0;
  const guarded = adminFetch(
    "https://auth.example.test",
    async (_input, init) => {
      sent++;
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.redirect, "error");
      return new Response("true");
    },
  );
  for (const [url, method] of [
    ["/rest/v1/teams", "POST"],
    ["/rest/v1/matches", "PATCH"],
    ["/rest/v1/admin_users", "GET"],
    ["/rest/v1/rpc/other", "POST"],
    ["/auth/v1/signup", "POST"],
    ["/auth/v1/admin/users", "GET"],
  ])
    await assert.rejects(
      guarded(`https://auth.example.test${url}`, { method }),
    );
  await assert.rejects(guarded("https://evil.example/auth/v1/user"));
  assert.equal(sent, 0);
  await guarded("https://auth.example.test/rest/v1/rpc/is_mundialito_admin");
  await guarded("https://auth.example.test/auth/v1/logout?scope=local", {
    method: "POST",
  });
  assert.equal(sent, 2);
});

const host = "https://auth.example.test";
test("admin logout: borra todas las partes de una sesión fragmentada sin tocar otras cookies", () => {
  const names = [
    `${ADMIN_COOKIE}.0`,
    `${ADMIN_COOKIE}.1`,
    ADMIN_COOKIE,
    "site-preferences",
  ];
  const deleted = adminCookieDeletions(names, true, "/mundialito");
  assert.deepEqual(
    deleted.map((c) => c.name),
    names.slice(0, 3),
  );
  assert.ok(
    deleted.every(
      (c) =>
        c.value === "" &&
        c.maxAge === 0 &&
        c.path === "/mundialito/admin" &&
        c.httpOnly &&
        c.secure,
    ),
  );
});
test("admin logout: compara el origen con Host público incluso al escuchar en 0.0.0.0", () => {
  assert.equal(
    isSameRequestOrigin("http://localhost:3000", "localhost:3000", "http:"),
    true,
  );
  assert.equal(
    isSameRequestOrigin(
      "http://192.168.0.103:3000",
      "192.168.0.103:3000",
      "http:",
    ),
    true,
  );
  assert.equal(
    isSameRequestOrigin("https://evil.example", "localhost:3000", "http:"),
    false,
  );
  assert.equal(isSameRequestOrigin(null, "localhost:3000", "http:"), false);
  assert.equal(
    isSameRequestOrigin(
      "http://localhost:3000",
      "evil.example@localhost:3000",
      "http:",
    ),
    false,
  );
});
const user = {
  id: "00000000-0000-4000-8000-000000000123",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
function fixture({
  expired = false,
  authorized = true,
  invalid = false,
  refreshFails = false,
  countsFail = false,
  tournamentExists = true,
} = {}) {
  const jwt = (expiry: number) =>
    `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expiry })).toString("base64url")}.test-only-signature`;
  const expiry = Math.floor(Date.now() / 1000) + (expired ? -60 : 3600);
  const store = new Map([
    [
      ADMIN_COOKIE,
      `base64-${Buffer.from(JSON.stringify({ access_token: jwt(expiry), refresh_token: "test-only-refresh", expires_at: expiry, expires_in: 3600, token_type: "bearer", user })).toString("base64url")}`,
    ],
  ]);
  const requests: { url: URL; method: string }[] = [];
  const cookieWrites: {
    name: string;
    value: string;
    options: { httpOnly?: boolean; secure?: boolean };
  }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    requests.push({ url, method });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/auth/v1/user")
      return invalid
        ? json({ message: "Invalid token", code: "bad_jwt" }, 401)
        : json(user);
    if (url.pathname === "/auth/v1/token")
      return refreshFails
        ? json(
            {
              message: "Invalid refresh token",
              code: "refresh_token_not_found",
            },
            400,
          )
        : json({
            access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
            refresh_token: "test-only-new-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          });
    if (url.pathname === "/auth/v1/logout") {
      assert.equal(url.searchParams.get("scope"), "local");
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/rest/v1/rpc/is_mundialito_admin") {
      assert.notEqual(
        new Headers(init?.headers).get("authorization"),
        "Bearer sb_publishable_test_only",
      );
      assert.equal(method, "GET");
      return json(authorized);
    }
    if (url.pathname === "/rest/v1/tournaments") {
      assert.equal(url.searchParams.get("slug"), "eq.mundialito-la-bomba-2026");
      return json(
        tournamentExists
          ? [
              {
                id: "00000000-0000-4000-8000-000000000001",
                slug: "mundialito-la-bomba-2026",
                name: "Mundialito",
              },
            ]
          : [],
      );
    }
    if (countsFail) return json({ message: "Denied", code: "42501" }, 403);
    assert.equal(method, "HEAD");
    assert.equal(
      url.searchParams.get("tournament_id"),
      "eq.00000000-0000-4000-8000-000000000001",
    );
    const count = url.pathname.endsWith("teams")
      ? 18
      : url.pathname.endsWith("groups")
        ? 6
        : !url.searchParams.has("status") ||
            url.searchParams.get("status") === "eq.scheduled"
          ? 34
          : 0;
    return new Response(null, { headers: { "Content-Range": `*/${count}` } });
  };
  const client = createAdminClient(
    { mode: "supabase", url: host, publishableKey: "sb_publishable_test_only" },
    {
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      setAll(values) {
        for (const cookie of values) {
          cookieWrites.push(cookie);
          if (!cookie.value) store.delete(cookie.name);
          else store.set(cookie.name, cookie.value);
        }
      },
    },
    true,
    transport,
  );
  return { client, store, requests, cookieWrites };
}
test("admin SDK SSR: usuario validado por Auth y RPC true permite dashboard real delimitado al torneo", async () => {
  const f = fixture();
  assert.equal(await verifyAdmin(f.client), "allowed");
  assert.deepEqual(await readAdminDashboard(f.client), {
    teams: 18,
    groups: 6,
    scheduled: 34,
    finished: 0,
  });
  assert.deepEqual(
    f.requests.slice(0, 2).map((r) => r.url.pathname),
    ["/auth/v1/user", "/rest/v1/rpc/is_mundialito_admin"],
  );
});
test("admin SDK SSR: usuario autenticado sin membresía no recibe acceso", async () => {
  assert.equal(
    await verifyAdmin(fixture({ authorized: false }).client),
    "denied",
  );
});
test("admin SDK SSR: password grant guarda la sesión únicamente en cookies y después verifica permisos", async () => {
  const f = fixture();
  f.store.clear();
  const result = await f.client.auth.signInWithPassword({
    email: "test@example.test",
    password: "not-a-real-password",
  });
  assert.equal(result.error, null);
  assert.equal(
    f.requests.some((r) => r.url.searchParams.get("grant_type") === "password"),
    true,
  );
  assert.ok(f.cookieWrites.length > 0);
  assert.equal(await verifyAdmin(f.client), "allowed");
});
test("admin SDK SSR: cookie falsificada con usuario local no sustituye validación de Auth", async () => {
  const f = fixture({ invalid: true });
  assert.equal(await verifyAdmin(f.client), "anonymous");
  assert.equal(
    f.requests.some((r) => r.url.pathname.includes("is_mundialito_admin")),
    false,
  );
});
test("admin SDK SSR: sesión caducada se renueva y persiste cookies seguras antes de autorizar", async () => {
  const f = fixture({ expired: true });
  assert.equal(await verifyAdmin(f.client), "allowed");
  assert.equal(
    f.requests.some(
      (r) => r.url.searchParams.get("grant_type") === "refresh_token",
    ),
    true,
  );
  assert.ok(f.cookieWrites.length > 0);
  assert.ok(
    f.cookieWrites.every(
      (c) => c.options.httpOnly === true && c.options.secure === true,
    ),
  );
});
test("admin SDK SSR: refresh rechazado bloquea el acceso sin consultar permisos", async () => {
  const f = fixture({ expired: true, refreshFails: true });
  assert.equal(await verifyAdmin(f.client), "anonymous");
  assert.equal(
    f.requests.some((r) => r.url.pathname.includes("is_mundialito_admin")),
    false,
  );
});
test("admin SDK SSR: logout revoca solo la sesión local y elimina sus cookies", async () => {
  const f = fixture();
  const result = await f.client.auth.signOut({ scope: "local" });
  assert.equal(result.error, null);
  assert.equal(f.store.size, 0);
  assert.equal(await verifyAdmin(f.client), "anonymous");
  assert.equal(
    f.requests.some((r) => r.url.pathname === "/auth/v1/logout"),
    true,
  );
});
test("admin dashboard: RLS/error no se transforma en estadísticas de cero ni otro torneo", async () => {
  await assert.rejects(
    readAdminDashboard(fixture({ countsFail: true }).client),
    /ADMIN_COUNT_UNAVAILABLE/,
  );
  const f = fixture({ tournamentExists: false });
  await assert.rejects(
    readAdminDashboard(f.client),
    /TOURNAMENT_NOT_AVAILABLE/,
  );
  assert.equal(f.requests.length, 1);
});

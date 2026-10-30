import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import config from "../../next.config.ts";

// Exercise the installed Next guard that rejected the real phone's requests.
const require = createRequire(import.meta.url);
const { blockCrossSiteDEV } =
  require("next/dist/server/lib/router-utils/block-cross-site-dev.js") as {
    blockCrossSiteDEV: (
      req: IncomingMessage,
      res: ServerResponse,
      origins: string[] | undefined,
      host: string,
    ) => boolean;
  };
function check(
  url: string,
  headers: Record<string, string>,
  origins = config.allowedDevOrigins,
) {
  let ended = false;
  const response = {
    statusCode: 200,
    end() {
      ended = true;
    },
  };
  const blocked = blockCrossSiteDEV(
    { url, headers } as IncomingMessage,
    response as unknown as ServerResponse,
    origins,
    "0.0.0.0",
  );
  return { blocked, status: response.statusCode, ended };
}
const allowed = { blocked: false, status: 200, ended: false };
const denied = { blocked: true, status: 403, ended: true };

test("LAN: reproduce el 403 original y permite el mismo recurso con la configuración corregida", () => {
  const request = { origin: "http://192.168.0.104:3000" };
  assert.deepEqual(check("/_next/static/chunks/app.js", request, []), denied);
  assert.deepEqual(check("/_next/static/chunks/app.js", request), allowed);
});
test("LAN: permite el origen del canal HMR y conserva localhost", () => {
  for (const origin of [
    "http://192.168.0.104:3000",
    "http://192.168.0.110:3000",
    "http://localhost:3000",
  ]) {
    assert.deepEqual(check("/_next/hmr", { origin }), allowed);
  }
});
test("LAN: permite scripts no-cors con Referer de la IP confirmada", () => {
  assert.deepEqual(
    check("/_next/static/chunks/app.js", {
      "sec-fetch-mode": "no-cors",
      "sec-fetch-site": "cross-site",
      referer: "http://192.168.0.104:3000/partidos",
    }),
    allowed,
  );
});
test("LAN: sigue bloqueando otros orígenes y orígenes opacos", () => {
  for (const origin of [
    "http://untrusted.example",
    "http://192.168.0.103:3000",
    "http://192.168.0.100:3000",
    "http://192.168.0.111:3000",
    "null",
  ]) {
    assert.deepEqual(check("/_next/hmr", { origin }), denied);
  }
  assert.deepEqual(
    check("/_next/static/chunks/app.js", {
      "sec-fetch-mode": "no-cors",
      "sec-fetch-site": "cross-site",
      referer: "http://untrusted.example/",
    }),
    denied,
  );
});

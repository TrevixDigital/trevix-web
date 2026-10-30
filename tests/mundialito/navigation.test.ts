import test from "node:test";
import assert from "node:assert/strict";
import { isNavigationActive, navigationLinks } from "../../src/lib/mundialito/navigation.ts";

test("navegación: conserva las siete rutas públicas existentes", () => {
  assert.deepEqual(
    navigationLinks.map(({ href }) => href),
    [
      "/mundialito",
      "/mundialito/grupos",
      "/mundialito/partidos",
      "/mundialito/eliminatorias",
      "/mundialito/fase-final",
      "/mundialito/equipos",
      "/mundialito/estadisticas",
    ],
  );
});
test("navegación: cada sección tiene un único enlace activo", () => {
  for (const { href } of navigationLinks) {
    assert.deepEqual(
      navigationLinks
        .filter((link) => isNavigationActive(href, link.href))
        .map((link) => link.href),
      [href],
    );
  }
});
test("navegación: detalles de equipos, partidos y rutas con barra final conservan su sección", () => {
  for (const path of [
    "/mundialito/equipos/la-bomba",
    "/mundialito/partidos/b7229984-e126-4bc3-bda5-6f76f3d360b5",
    "/mundialito/grupos/",
  ]) {
    const section = `/mundialito/${path.split("/")[2]}`;
    assert.deepEqual(
      navigationLinks
        .filter((link) => isNavigationActive(path, link.href))
        .map((link) => link.href),
      [section],
    );
  }
});
test("navegación: no confunde prefijos ajenos ni activa Inicio en subrutas", () => {
  for (const path of [
    "/equipos-extra",
    "/partidos-anteriores",
    "/administracion",
    "/mundialito/jugadores/un-jugador",
  ]) {
    assert.equal(
      navigationLinks.some((link) => isNavigationActive(path, link.href)),
      false,
    );
  }
});

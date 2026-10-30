# TREVIX

Aplicación Next.js unificada. `/` sirve TREVIX y `/mundialito` sirve el torneo, sus fichas y su administrador. Un solo `package.json`, instalación, `package-lock.json`, build y servidor Next.js. No usa el antiguo proxy inverso ni los puertos internos 3100/3001.

## Desarrollo local

Node.js >=22.16 compatible con las dependencias fijadas y npm. La implementación se verificó con Node 26.8.1 en Windows. En un equipo nuevo:

```powershell
Set-Location 'D:\ARCHIVOS\TREVIX\Pagina_Web\Trevix'
npm ci
# Configurar .env.local a partir de .env.example, por canal privado.
npm run dev
```

En esta copia ya están instaladas las dependencias y configurado `.env.local`; basta con `npm run dev`.

- Corporativo: http://localhost:3300/
- Mundialito: http://localhost:3300/mundialito
- Acceso administrativo: http://localhost:3300/mundialito/admin/login
- LAN opcional: `npm run dev:lan`, usando la IP vigente del equipo y puerto 3300. No abrir puertos del router ni usar el servidor de desarrollo en producción.

El puerto 3300 permite conservar el stack original del puerto 3000. No se necesita iniciar ninguno de los proyectos originales.

Durante la comparación local, usar el stack original como referencia visual. No ejecutar importaciones simultáneas desde el original y el unificado contra la misma base: las copias del journal tienen bloqueos independientes. El corte operativo debe detener las importaciones anteriores antes de tomar el respaldo final del journal.

## Estructura

```text
src/
  app/
    (corporativo)/         # Raíz corporativa, CSS y manifest
    (torneo)/
      layout.tsx          # Raíz visual del torneo
      mundialito/         # Todas las páginas, admin y Server Actions
  components/{corporate,mundialito}/
  lib/{corporate,mundialito}/
  proxy.ts                # Solo protección de /mundialito/admin
public/                   # Recursos corporativos
  mundialito/             # Recursos del torneo
tests/{corporate,mundialito,integration}/
scripts/start-node.mjs
docs/
```

Los dos route groups tienen layouts raíz separados para mantener el CSS y la presentación originales. Navegar entre corporativo y torneo recarga el documento por diseño de Next.js; dentro del torneo se mantiene App Router. Son dos áreas de una misma aplicación, no dos servidores.

## Configuración y seguridad

Ver `.env.example`. Nunca subir `.env.local`, credenciales, nóminas, journals, respaldos o logs. La clave pública/publishable conserva el uso previsto por Supabase; no agregar una service-role key al cliente ni al servidor para eludir RLS. Auth, RPC de membresía, cookies HttpOnly con ámbito `/mundialito/admin`, validaciones, CSRF y comprobaciones de permisos permanecen en servidor.

No se usa `NEXT_PUBLIC_BASE_PATH`: `/mundialito` es una ruta real. Los recursos del torneo tienen prefijo `/mundialito`; los recursos optimizados de ambas áreas usan `/_next/image`.

El importador necesita dos directorios absolutos privados **fuera del proyecto y de public**:

- `OFFICIAL_ROSTERS_DIR`: fuentes oficiales de solo lectura, con sus cuatro nombres y hashes originales.
- `OFFICIAL_IMPORT_RUNS_DIR`: journal durable y bloqueo de exclusión; requiere escritura persistente.

Configurar ambas rutas fuera de la aplicación (por ejemplo, `/data/trevix/nominas` y `/data/trevix/official-import-runs` en un volumen privado). Se copiaron las cuatro fuentes y el journal existente, sin reiniciarlo ni ejecutar la importación. No copiar esta carpeta a GitHub ni servirla mediante HTTP. Una ruta ausente, relativa o dentro del árbol de código falla cerrada.

Los flags de `.env.example` están desactivados. `.env.local` conserva las opciones existentes del torneo; no conceden permisos por sí mismos. La verificación no ejecutó escrituras reales. Revisar y autorizar explícitamente los flags de producción antes del lanzamiento.

## Verificaciones

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

`npm start` escucha únicamente en 127.0.0.1:3300. Para un alojamiento Node.js configurar `HOSTNAME` y `PORT` y ejecutar `npm run start:node` después del build. Las variables públicas de Next.js deben existir durante la compilación; cambiarlas exige recompilar.

Ver [despliegue, actualización y reversión](docs/OPERACION.md) y [preparación de GitHub](docs/GITHUB.md). Los inventarios de copias, evidencias de QA e informe histórico se conservan solo localmente y están excluidos de Git. Esta preparación no publica la aplicación ni cambia DNS o alojamiento.

# Administrador Mundialito: activacion controlada

No activar produccion hasta completar la restauracion aislada y revisar el commit
exacto que se publicara. Este documento no ejecuta cambios ni habilita funciones.

## Modulos y escrituras

- `src/app/(torneo)/mundialito/admin`: acceso, partidos, jugadores, estadisticas y reglamento.
- `admin/access.ts`, `admin/client.ts`, `admin/transport.ts` y `src/proxy.ts`: usuario
  verificado, RPC administrativa, transporte limitado y cookies privadas.
- `matches/repository.ts`: marcador, horarios y auditoria; version optimista.
- `events/repository.ts`: goles y autogoles; identificadores estables y version.
- `events/card-repository.ts`: lectura y sincronizacion por RPC de tarjetas.
- `events/simple-save.ts`: coordinacion por secciones, conservacion de eventos y reintentos.
- `players/repository.ts`: altas y cambios de fichas sin cambiar equipo ni identidad.
- `engine/` y `repositories/competition-report.ts`: calculos publicos comunes.

Todos los guardados verifican el usuario y su condicion administrativa. Las claves
publicas no sustituyen RLS. No utilizar service_role en este flujo.

## Variables

Requisitos existentes: `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, del mismo proyecto oficial.

Para habilitar solo tarjetas, despues del respaldo verificado:

| Variable | Valor propuesto |
| --- | --- |
| SUPABASE_PHASE4_READ_ENABLED | true |
| SUPABASE_PHASE4_WRITE_TARGET | production |
| SUPABASE_PHASE4_PRODUCTION_CARD_WRITES_APPROVED | true |
| SUPABASE_PHASE4_CARD_WRITES_ENABLED | true |

No activar certificacion (`SUPABASE_PHASE4_CERTIFICATION_WRITES_ENABLED`) ni
clasificacion (`SUPABASE_CLASSIFICATION_WRITES_ENABLED` y su aprobacion) como
efecto secundario. La certificacion nueva esta limitada al entorno aislado.

El registro expreso de tarjetas, incluidos ceros revisados, es independiente:
`SUPABASE_CARD_REGISTRATION_READ_ENABLED` y
`SUPABASE_CARD_REGISTRATION_WRITES_ENABLED`. No inferir un cero oficial por
ausencia de eventos. Requiere prueba y decision separadas.

Penales y cambios de resultado en eliminatorias necesitan el guardado atomico:
`SUPABASE_KNOCKOUT_PROGRESS_ENABLED=true`,
`SUPABASE_KNOCKOUT_PRODUCTION_WRITES_APPROVED=true` y la RPC de estado version 2
con `progression_enabled=true` en la base de datos. No habilitar estas opciones
sin revisar sus dependencias y probarlas en aislamiento. El coordinador rechaza
el resultado antes de guardar estadisticas cuando el avance seguro esta apagado.

## Respaldo verificado fuera de Git

Ejecutar desde PowerShell, sin conexiones a bases de datos:

```powershell
./scripts/verify-supabase-backup.ps1 -BackupPath 'D:\ARCHIVOS\TREVIX\Pagina_Web\Respaldos_Supabase\20261029_233153\database.dump' -CopyPath 'D:\ARCHIVOS\TREVIX\Pagina_Web\Respaldos_Supabase\20261029_233153\database-copy.dump'
```

El script solo lista y procesa el archivo hacia NUL; no restaura. El indice declara
856 entradas y lista 849 elementos seleccionables. Son contadores distintos;
esa diferencia no demuestra truncamiento. Los archivos SQL de comprobacion y el
archivo CUSTOM contienen informacion privada: no imprimirlos ni incorporarlos a Git.

## Prueba de restauracion aislada pendiente

1. Instalar Docker Desktop con contenedores Linux y una CLI Supabase compatible,
   en una carpeta NUEVA fuera del repositorio y de los originales.
2. Crear un proyecto LOCAL con `npx --yes supabase@2.122.0 init`. Configurar
   `[db] major_version = 17` y un project_id exclusivo de restauracion. No ejecutar
   `supabase link`, `db push`, `db reset --linked` ni usar credenciales oficiales.
3. Iniciar el stack local. Mantener claves y salida de inicio privadas. Verificar
   que el contenedor PostgreSQL es Supabase 17, extensiones compatibles y puerto
   accesible exclusivamente en loopback. Una instancia PostgreSQL 18 normal no
   certifica compatibilidad con Supabase 17.
4. Mantener el stack y los datos restaurados sin acceso de terceros y bloquear
   integraciones salientes, webhooks y tareas de red antes de restaurar. No iniciar
   una aplicacion contra los datos reales copiados. La base de prueba no se sirve
   desde Render ni se enlaza a produccion.
5. Crear una base VACIA de nombre exclusivo en ese contenedor, conservando las
   bases del stack. Verificar version, roles y extensiones disponibles. El archivo
   fue generado por pg_dump 18.6 desde servidor 17.11: usar pg_restore 18.6 y
   comprobar realmente que el SQL es aceptado por el servidor Supabase 17.
6. Inspeccionar solo metadatos del archivo: roles propietarios, extensiones y ACL.
   Preparar los roles personalizados faltantes SOLO en el cluster local, sin
   copiar contrasenas oficiales. No eliminar ACL ni propietarios para ocultar
   errores: impide certificar seguridad equivalente.
7. Con puerto local confirmado (ejemplo 54322) y herramientas cliente 18.6, los
   comandos siguientes tienen destino fijo local. La contrasena LOCAL se ingresa
   mediante el prompt; no usar URI ni variables de produccion. Limpiar antes de
   esa sesion PGSERVICE, PGHOSTADDR, PGOPTIONS y PGPASSWORD si estuvieran definidos.

```powershell
$pg = 'C:\Program Files\PostgreSQL\18\bin'
& "$pg\psql.exe" -X -h 127.0.0.1 -p 54322 -U postgres -d postgres -W -v ON_ERROR_STOP=1 -c 'SHOW server_version;'
# Solo despues de comprobar que es el contenedor Supabase local 17:
& "$pg\createdb.exe" -h 127.0.0.1 -p 54322 -U postgres -W --template=template0 trevix_restore_supabase17
if ($LASTEXITCODE -ne 0) { throw 'No se creo una base nueva; detener.' }
& "$pg\pg_restore.exe" -h 127.0.0.1 -p 54322 -U postgres -W --dbname=trevix_restore_supabase17 --single-transaction --exit-on-error 'D:\ARCHIVOS\TREVIX\Pagina_Web\Respaldos_Supabase\20261029_233153\database.dump'
if ($LASTEXITCODE -ne 0) { throw 'Restauracion no validada; revisar errores de forma privada.' }
```

8. Si una extension no admite restauracion transaccional, falla un propietario o
   faltan objetos gestionados, detener y adaptar el procedimiento con la guia
   oficial para ese entorno. No ignorar errores ni reintentar contra produccion.
9. Comparar recuentos y huellas canonicas por tabla contra el respaldo; identidades,
   minutos, notas, recibos y auditorias; todas las claves foraneas; firmas y cuerpos
   de funciones; propietarios, concesiones, RLS, politicas, valores predeterminados
   y estados de triggers. No mostrar filas privadas en los informes.
10. Ejecutar los dos diagnosticos de catalogos en la copia local y comparar con
    los JSON oficiales. Comprobar permisos efectivos con roles locales anon y
    authenticated, sin reutilizar claves o sesiones de produccion.
11. Probar RPC, rechazo de no administradores, idempotencia, respuesta perdida,
    conflictos concurrentes y auditoria en una base LOCAL de fixtures sinteticos
    con el mismo esquema. No ejecutar correcciones sobre las filas oficiales copiadas.
12. Registrar versiones, hashes, resultado de restauracion y resultados de pruebas
    fuera de Git. Solo entonces marcar el respaldo como recuperable verificado.

Fuentes: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
y https://www.postgresql.org/docs/18/app-pgrestore.html.

## Activacion, primera correccion y desactivacion

1. Completar restauracion y pruebas aisladas; revisar y autorizar publicacion del
   commit con las correcciones locales. Confirmar commit desplegado en Render.
2. Registrar configuracion anterior y respaldo, pausar otros guardados y usar una
   unica sesion administrativa. Verificar la lectura inicial sin cambiar cantidades.
3. Aplicar solo las cuatro variables de tarjetas y desplegar el mismo artefacto
   con la nueva configuracion. No usar Save only ni asumir que reiniciar incorpora
   variables guardadas sin desplegar.
4. Corregir UNA tarjeta legitimamente documentada, sin modificar goles o marcador,
   en un partido sin dependencias bloqueadas y sin historial excepcional.
5. Recargar y comprobar cantidades, eventos conservados, recibo y auditoria mediante
   lectura. Verificar paginas publicas, estadisticas y perfiles. Nunca inventar
   tarjetas para probar ni repetir ciegamente un guardado incierto.
6. Ante fallos, establecer CARD_WRITES_ENABLED y PRODUCTION_CARD_WRITES_APPROVED de
   fase 4 en false y desplegar. Esperar operaciones en curso y volver a leer.
   Desactivar variables NO revierte datos ya guardados ni revoca RPC en Supabase.
   Conservar auditorias y recibos; toda correccion posterior necesita revision.

El guardado completo sigue siendo por secciones. La RPC de tarjetas es atomica
por jugador; la cola de Node no es un bloqueo distribuido. Los rechazos por estado
concurrente o grupos protegidos son medidas de seguridad, no motivos para eludir RLS.

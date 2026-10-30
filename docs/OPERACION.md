# Despliegue, actualización y reversión

## Antes de publicar

Esta entrega está limitada al entorno local. El futuro repositorio puede seguir siendo `TrevixDigital/trevix-web`, sustituyendo su contenido mediante un commit revisable y conservando su historial. La carpeta está vinculada al remoto existente en una rama local de preparación, conservando la ascendencia de main. No se ha realizado push. No ejecutar push, workflows de publicación o cambios de DNS sin autorización posterior.

GitHub Pages no ejecuta este sistema: hay SSR, Server Actions, autenticación con cookies, un Route Handler POST y almacenamiento privado del importador. No convertir a exportación estática ni mover las operaciones administrativas al navegador.

La opción operativa prevista es un servicio Node.js con un volumen privado persistente, por ejemplo Railway. Confirmar precio, límites y condiciones vigentes antes de contratar; no se afirma que un plan gratuito cubra esta aplicación comercial. Vercel con la persistencia actual del importador necesitaría adaptar el almacenamiento. No modificar el importador para usar disco efímero ni desactivar su journal.

## Preparar un único servicio Node.js

1. Revisar el código y los informes. La revisión visual manual local fue confirmada por el responsable. Completar la aceptación administrativa segura sobre un entorno de pruebas y la verificación HTTPS del proveedor.
2. Respaldar el repositorio remoto y su commit actualmente publicado; conservar el sitio antiguo y su configuración de DNS/hosting. Los respaldos privados del análisis previo no deben entrar al nuevo repositorio.
3. Seleccionar una versión Node compatible, fijarla en el proveedor y reproducir `npm ci`, tipos, lint, pruebas y build en Linux antes de promocionar. Las pruebas actuales se ejecutaron en Windows con Node 26.8.1.
4. Crear un solo servicio con raíz de proyecto en este directorio, instalación `npm ci`, build `npm run build`, arranque `npm run start:node`. No usar `npm run dev`, los scripts anteriores ni tres servicios.
5. Inyectar configuración desde el gestor de secretos. Configurar `HOSTNAME=0.0.0.0` exclusivamente dentro del servicio del proveedor, `PORT` proporcionado por él y TLS delante del servicio. No publicar puertos de desarrollo o internos. Configurar `TREVIX_SITE_URL=https://trevix.digital` y las variables públicas de Supabase antes del build. No registrar valores en los logs.
6. Montar un volumen privado fuera de la carpeta de aplicación, por ejemplo `/data/trevix`. Configurar `OFFICIAL_ROSTERS_DIR=/data/trevix/nominas` y `OFFICIAL_IMPORT_RUNS_DIR=/data/trevix/official-import-runs`. Detener las importaciones del sistema anterior antes del respaldo final; transferir por canal privado las cuatro fuentes originales y el journal completo, verificar sus hashes y permisos. Respaldar ese volumen. Nunca volver a crear un journal vacío sobre una importación ya realizada ni dejar dos sistemas importando con journals independientes.
7. Mantener **una instancia y un volumen compartido por esa instancia** mientras se use el bloqueo por archivo. Eliminar un lock requiere verificar que no queda ninguna importación activa; no automatizar su borrado ni escalar a varias réplicas sin revisar la coordinación.
8. Probar en URL previa protegida con el mismo origen para formularios, Auth y Server Actions. El proxy TLS debe conservar correctamente host y protocolo. Las cookies Secure y CSRF deben verificarse sobre HTTPS real. No ensanchar allowedOrigins ni desactivar CSRF para salvar un error del proxy.
9. Verificar lectura pública, login/logout, permisos, rutas protegidas, recursos, 404 y revalidaciones. El ensayo de mutaciones debe usar un Supabase de pruebas autorizado o registros de prueba explícitamente aprobados, nunca datos deportivos oficiales por defecto.
10. Revisar configuración de Supabase Auth, URLs que realmente utilice el flujo, accesibilidad y políticas existentes **sin modificarlas automáticamente**. No cambiar RLS ni agregar privilegios. Los flags de escrituras deportivas requieren autorización operativa específica.
11. El corporativo conserva `robots: noindex, nofollow` de su versión original. Decidir explícitamente su habilitación para indexación y verificar metadata/canonical antes de producción; admin debe permanecer noindex y no-store.
12. Solicitar autorización para publicar, conectar el dominio y reemplazar la web anterior. Solo entonces ejecutar cambios remotos y DNS. Validar `/` y `/mundialito` bajo el dominio y conservar la versión anterior disponible para reversión.

## Actualizaciones

Trabajar únicamente en el proyecto unificado. Los originales quedan como respaldo y referencia, no como segunda fuente de edición. Registrar cada cambio en un commit pequeño y actualizar el lock solo cuando corresponda. Reproducir instalación, tipos, lint, pruebas, build y verificaciones de rutas. Revisar visualmente desktop y móvil para cada área afectada, incluido el cruce entre layouts.

Crear una nueva versión del servicio antes de reemplazar la activa. Respaldar el volumen privado con el importador inactivo y confirmar que el journal permanece compatible. Cambiar variables públicas implica rebuild; los secretos se administran fuera de Git. Registrar commit/build, fecha y resultado. No mezclar una actualización de aplicación con cambios de esquema o RLS sin un procedimiento independiente y autorizado.

## Respaldo y reversión

Antes de cada publicación guardar: commit o bundle del código, lockfile, artefacto/configuración del despliegue anterior, inventario privado de nombres de variables y configuración del dominio. Guardar valores secretos solo en su gestor de secretos. Respaldar volumen privado por separado con control de acceso y el importador detenido. Un respaldo de código no sustituye el respaldo de Supabase ni del journal.

Si falla una actualización, detener importaciones, volver a la imagen/commit anterior con su configuración compatible y remontar el **journal vigente**, conservando evidencia de cualquier intento. Nunca restaurar automáticamente un journal anterior: podría repetir escrituras ya confirmadas. No deshacer datos deportivos mediante SQL para revertir código. Si hay incompatibilidad de journal, bloquear temporalmente la importación y revisar los intentos con el responsable antes de reabrirla.

Si se necesita volver a la web antigua tras el lanzamiento, restaurar la versión/hosting anterior y, únicamente con autorización, su configuración DNS registrada. Probar de nuevo el dominio. Esa web estática no reemplaza el administrador deportivo; documentar la disponibilidad del torneo durante la contingencia.

La reversión local es directa: detener el servidor unificado y seguir usando los proyectos originales, que conservan sus archivos y configuración. No es necesario borrar el proyecto nuevo ni sus copias privadas.

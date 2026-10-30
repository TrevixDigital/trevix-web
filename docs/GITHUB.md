# Preparación del repositorio y lanzamiento

Repositorio existente: https://github.com/TrevixDigital/trevix-web. Se conserva su historial; no se requiere force push. La aplicación es un proyecto Next.js con runtime Node.js, no una exportación estática.

## Estado de esta preparación

La rama local `preparacion/lanzamiento-unificado-2026-10-29` parte de `main` en `d345b46c3bbd62079072bb141fd8133d26978bcd`. El contenido está preparado para sustituir la antigua distribución estática. La etiqueta local `respaldo/web-estatica-2026-10-29` identifica esa versión anterior. No se ha realizado ningún push ni cambio de hosting o DNS.

El responsable confirmó la revisión manual de la aplicación unificada en localhost:3300. Las verificaciones administrativas de escritura se realizan con simulaciones; no modificar Supabase ni RLS como parte de la preparación de GitHub.

## Evitar publicación involuntaria

El repositorio tiene un workflow activo `pages-build-deployment` y despliegues `github-pages` desde `main`. Un push a main puede reconstruir o afectar la web actual. La consulta pública a la configuración administrativa de Pages devolvió 404, por lo que no se afirma haber confirmado su ajuste interno actual. No asumir que un cambio solo de código queda separado del alojamiento.

La primera subida recomendada, **solo después de autorización**, es la etiqueta de respaldo y la rama de preparación. Mantener main intacta y no fusionar hasta preparar el alojamiento Node y acordar por separado cómo desacoplar Pages. No crear en esta preparación workflows de despliegue ni conectar automáticamente un proveedor a esta rama.

## Contenido publicable

Incluir código `src/`, recursos aprobados `public/`, pruebas con datos sintéticos, configuración Next/TypeScript/ESLint/PostCSS, `package.json`, `package-lock.json`, `.nvmrc`, documentación operativa y el único script de arranque Node.

Solo `.env.example` está permitido como plantilla sin valores. Mantener excluidos .env reales, claves privadas, credenciales, nóminas, journals, bloqueos, respaldos, logs, node_modules, .next y evidencias locales. `.gitignore` no borra lo ya versionado: revisar siempre el índice exacto con `git ls-files` y un escáner de secretos antes de cada push.

La URL pública de Supabase presente en reglas de entorno no es una credencial y se mantiene para no debilitar el control del destino de escritura aprobado. Las claves reales permanecen en el entorno. Una clave deliberadamente inválida de una prueba comprueba que las credenciales secretas se rechacen; no es una credencial operativa.

Se retiraron nombres privados de fixtures y de la regla puntual de normalización del importador. La regla continúa limitada al archivo aprobado por SHA-256 y a retirar un solo espacio ASCII al final del registro autorizado; se comprobó que su salida para la fuente privada original es idéntica. Los documentos privados no se han alterado ni incorporado a Git.

## Node.js

`.nvmrc` fija Node 26.8.1, versión usada para las verificaciones locales. Antes de producción verificar la versión elegida en el proveedor y reproducir la instalación/build en su entorno Linux. Usar `npm ci`, `npm run build` y `npm run start:node`. Configurar variables públicas durante el build; inyectar secretos desde el gestor del proveedor. `HOSTNAME` y `PORT` controlan el único servidor. El desarrollo y el arranque local permanecen en loopback por defecto.

El importador necesita un volumen privado persistente separado del repositorio. No usar disco efímero, varias réplicas con bloqueos independientes ni restaurar un journal antiguo sobre operaciones ya confirmadas. Ver `OPERACION.md`.

## Respaldo y reversión

El respaldo externo contiene bundle del historial completo, ZIP de los ocho archivos estáticos antiguos, checksums y una clonación de restauración verificada. No subir esos archivos al repositorio de la aplicación. La etiqueta de respaldo puede publicarse posteriormente con autorización, ya que solo referencia contenido que ya era público.

Antes de cualquier push, volver a consultar origin/main. Si cambió desde el commit base, detenerse y revisar; no usar force push ni sobrescribir commits ajenos. La sustitución futura debe ser fast-forward o una fusión revisada.

Si fuera necesario revertir el reemplazo una vez integrado, crear un commit de reversión con `git revert <commit-de-sustitucion>` sobre main y publicarlo con autorización. Si la sustitución llegó mediante un merge commit, revisar sus padres y usar la opción apropiada de revert. No usar reset/force push. El respaldo se puede clonar de forma independiente con `git clone --branch main <archivo.bundle> <carpeta-nueva>`. La reversión de código no revierte Supabase ni el journal.

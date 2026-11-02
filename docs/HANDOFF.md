# Handoff — sesión del 2026-11-01/02

Para arrancar la próxima sesión: leer este archivo, después `docs/PLAN-REDISENO.md` y `docs/CHECKLIST-INGENIERIA.md`.

## 1. Objetivo

Que Pedidos Carmar sea **más práctico que mandar los pedidos por WhatsApp** y que **no se compre lo que ya está en el galpón externo**, con el sistema funcionando en producción como lo dejaría un ingeniero de software: monitoreado, con backups probados y servidor seguro.

## 2. Qué quedó hecho

Todo está en producción (`https://pedidos.18-230-136-195.sslip.io`), en GitHub (`main`, último commit `3e5b694`) y con 263 tests en verde.

**Rediseño (docs/PLAN-REDISENO.md)**
- **Fase 1 — Pedido por proveedor:** el repositor elige el proveedor, ve lo que ya se le pidió antes con casilleros de cantidad, "Guardar cantidades" de una vez y "Repetir último pedido". Eli, al aprobar, tiene el mensaje listo con "Enviar por WhatsApp" y "Copiar". La encargada puede cargar proveedores con su WhatsApp.
- **Fase 2 — Depósito (Rodrigo):** rol nuevo "Depósito". Revisa cada pedido enviado y carga cuánto hay en el galpón. Eli ve pedido / del galpón / a comprar. El mensaje al proveedor y el consolidado llevan solo lo que hay que comprar. Rodrigo tiene la lista "Para mandar a sucursales" con "Ya lo mandé".
- **Fase 3 — Sin períodos e Historial:** los pedidos ya no dependen de un período. El consolidado se reemplazó por **Historial** con filtros, resumen por producto y Excel (hojas Detalle, con Semana y Mes, y Resumen).
- **Manuales** actualizados en HTML y PDF: repositor, encargada, administrador y uno nuevo de depósito.

**Ingeniería (docs/CHECKLIST-INGENIERIA.md)**
- Monitoreo con UptimeRobot sobre `/api/health` cada 5 minutos, con aviso por mail (probado).
- Restauración de backup ensayada en la PC con una copia real (ver `docs/DEPLOY.md`, "Ensayar un backup en la PC").
- Copia semanal de backups traída a `C:\backups\carmar`: 10 copias, todas OK.
- Rotación de logs de Docker: 5 archivos × 10 MB por servicio.
- Servidor reforzado: firewall con solo 22/80/443, SSH solo con llave y sin root, actualizaciones automáticas con reinicio a las 04:00 de Argentina si hace falta.

## 3. Qué falta

**Del súper (no depende del código)**
- Eli carga los proveedores reales con su WhatsApp (`549` + área + número, sin 0 ni 15).
- Pasar los manuales a Dani, Eli y Rodrigo. Pedirle a Eli que espere la revisión de Rodrigo antes de aprobar.
- Unos días de uso real y preguntar: ¿es más práctico que WhatsApp? ¿Rodrigo llega a revisar a tiempo?

**Técnico, en orden sugerido**
1. **Apagar la prueba gratis**: Netlify, Render y Neon (borrar la base de Neon, que tiene datos de prueba).
2. **CI con GitHub Actions**: lint, build y tests en cada push.
3. **Dominio propio**, cuando Carmar elija el nombre: cambiar `DOMINIO` y `CORS_ORIGIN` en `.env.prod`, actualizar la URL del monitor de UptimeRobot y la constante `DIRECCION` de los manuales.
4. Script único de deploy (`deploy/deploy.sh`), manejador de errores en la API, cabeceras HSTS y CSP.
5. Lint y tests en `apps/web`, y pruebas end-to-end con Playwright.
6. **Fase 4 — Stock del galpón:** solo si el uso real muestra que hace falta.
7. Pendientes viejos: `tokenVersion` para cerrar sesiones, migrar a `prisma.config.ts`, zod 4 y Prisma 7 (en sprints dedicados).

**Rutina**
- Una vez por semana, traer los backups a la PC (en PowerShell):
  `scp -i "$env:USERPROFILE\Downloads\LightsailDefaultKey-sa-east-1.pem" "ubuntu@18.230.136.195:/var/backups/carmar/*.sql.gz" C:\backups\carmar\`

## 4. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Qué vende cada proveedor | No se carga a mano: la lista de cada proveedor se arma sola con los pedidos anteriores (más `producto.proveedorId` si existe). |
| Proveedor en el pedido | Se elige al empezar; existe "Otro / sin proveedor". En la API sigue siendo opcional. |
| Quién carga proveedores | La encargada (además del admin), porque ella y los repositores conocen los datos. |
| Mensaje al proveedor | La app arma el texto y abre WhatsApp (`wa.me`) o lo copia. **No manda nada sola.** |
| Depósito | Sin stock en la app: Rodrigo revisa cada pedido. El stock del galpón queda para la Fase 4, si hace falta. |
| Orden de revisión | Primero Rodrigo, después Eli. Eli puede aprobar sin la revisión, con un aviso. |
| Reenvío de un pedido devuelto | Borra la revisión del depósito: Rodrigo lo revisa de nuevo. |
| Períodos y consolidado | Se sacan de la app. Tablas y datos viejos se conservan; los archivos `Consolidado.tsx` y `AdminPeriodos.tsx` quedan sin ruta (regla "nada se borra"). |
| Historial | Filtra por fecha de envío en hora de Argentina; por defecto muestra los últimos 30 días y solo los aprobados. |
| Migraciones | Solo agregan o hacen opcional; nunca borran datos de producción. Backup obligatorio antes de cada deploy con migración. |
| Monitor | UptimeRobot tipo HTTP(s) (no keyword): `/health` da 500 si cae la base y 502 si cae la API. |
| Reinicio automático | Solo cuando una actualización lo pide, a las 07:00 UTC (04:00 de Argentina). |
| Forma de trabajo | El usuario no es técnico: un comando por vez, decir dónde pegarlo y qué tiene que verse. Nunca pedirle claves, `.env.prod` ni la llave `.pem`. |

## 5. Archivos tocados

20 commits desde `038d347`, 61 archivos.

**Base de datos (apps/api/prisma)**
- `schema.prisma`, `seed.ts` (usuario de prueba `deposito@carmar.com`)
- Migraciones nuevas: `20261102033746_deposito`, `20261102035702_pedido_sin_periodo`

**API (apps/api/src)**
- Nuevos: `routes/deposito.ts`, `routes/historial.ts`, `lib/historial.ts`, `lib/export-historial.ts` (con sus `.test.ts`)
- Modificados: `routes/pedidos.ts` (proveedores, sugeridos, carga masiva, repetir último, sin período), `routes/admin/proveedores.ts` (acceso de la encargada), `routes/admin/usuarios.ts`, `routes/auth.ts`, `lib/consolidado-helpers.ts`, `app.ts`, `test/helpers.ts`

**Web (apps/web/src)**
- Nuevos: `pages/DepositoPedidos.tsx`, `pages/DepositoDetalle.tsx`, `pages/Historial.tsx`, `pedidos/SelectorProveedor.tsx`, `pedidos/Sugeridos.tsx`, `revision/BloqueMensajeProveedor.tsx`, `revision/mensajeProveedor.ts`, `lib/depositoApi.ts`, `lib/historialApi.ts`
- Modificados: `App.tsx`, `pages/Inicio.tsx`, `pages/PedidoArmado.tsx`, `pages/PedidoRepositor.tsx`, `pages/RevisionDetalle.tsx`, `pages/RevisionPedidos.tsx`, `pages/AdminUsuarios.tsx`, `pedidos/ListaItems.tsx`, `pedidos/BuscadorProductos.tsx`, `revision/AccionesRevision.tsx`, `revision/comun.tsx`, `admin/*`, `lib/api.ts`, `lib/pedidosApi.ts`, `lib/revisionApi.ts`, `lib/adminApi.ts`, `styles.css`

**Infraestructura y documentación**
- `docker-compose.prod.yml` (rotación de logs), `README.md`
- `docs/PLAN-REDISENO.md` y `docs/CHECKLIST-INGENIERIA.md` (nuevos), `docs/DEPLOY.md` (monitoreo, ensayo de backup, logs, seguridad)
- `docs/manual/`: repositor, encargada, administrador y depósito (nuevo), en HTML y PDF

**En el servidor (fuera del repo)**
- `/etc/ssh/sshd_config.d/99-carmar.conf` (`PermitRootLogin no`)
- `/etc/apt/apt.conf.d/52-carmar-reinicio` (reinicio automático)

**Sin commitear, ajenos a esta sesión:** `.gitignore`, `CLAUDE.md` y `.mcp.json` (cambios del usuario, no tocados).

# Checklist de ingeniería — pedidos_carmar

Revisión del 2026-11-01. Toma como guía la lista del reel "¿Necesito un ingeniero de software para hacer una app?" (Estoy Programando, Facebook) y la compara con el estado real del proyecto.

**Resumen del video:** la IA puede escribir el código, pero una app que la gente usa necesita mucho más: requerimientos, arquitectura, base de datos, seguridad, infraestructura, backups, ambientes, CI/CD, pruebas, monitoreo, pagos, correos, tiendas móviles, legales, dependencias y mantenimiento continuo. Lo que sigue revisa cada uno de esos puntos contra este proyecto.

Estados: ✅ resuelto · 🟡 parcial · ❌ falta · ➖ no aplica hoy

## 1. Diseño

| Punto del video | Estado | Situación en pedidos_carmar |
|---|---|---|
| Requerimientos funcionales | ✅ | Roles (repositor, encargada, admin), flujo de pedidos, consolidado y Excel. README y manuales en `docs/manual/`. |
| Requerimientos no funcionales | 🟡 | Hay decisiones implícitas (un servidor, HTTPS, backups diarios), pero nada escrito: usuarios simultáneos, tiempo de respuesta aceptable, horario de uso, cuánto tiempo se puede estar caído. |
| Framework y arquitectura | ✅ | Monorepo pnpm, Fastify + Prisma + Zod, React + Vite, Docker Compose + Caddy. |
| Front y back | ✅ | `apps/web` y `apps/api` separados, la API sin prefijo y Caddy reenvía `/api`. |
| Modelo de datos, migraciones, índices, relaciones, integridad | ✅ | `schema.prisma` con migraciones versionadas y regla de no editar las ya aplicadas. Revisar índices cuando crezcan los pedidos (ver 6). |

## 2. Seguridad

| Punto del video | Estado | Situación |
|---|---|---|
| Autenticación y autorización | ✅ | JWT en cookie httpOnly, roles por ruta, PIN para repositores, bloqueo por intentos. |
| Manejo de sesiones | 🟡 | El token vale hasta que vence (7 días). No se puede cerrar la sesión de otro dispositivo ni invalidar al cambiar contraseña. Pendiente: `tokenVersion`. |
| Recuperación de contraseña | 🟡 | No hay "olvidé mi contraseña". Hoy lo resuelve el admin a mano. Está bien para un sistema interno, pero dejarlo escrito en el manual del admin. |
| Almacenamiento seguro de credenciales | ✅ | bcrypt para contraseñas y PIN. `.env` / `.env.prod` fuera del repo. |
| Cifrado de datos sensibles | ✅ | HTTPS automático (Let's Encrypt). No se guardan datos sensibles más allá de las credenciales. |
| Validación de entradas | ✅ | Zod en todas las rutas. |
| Inyección SQL | ✅ | Prisma usa consultas parametrizadas. Regla: no usar `$queryRawUnsafe`. |
| XSS | ✅ | React escapa el contenido. Falta una cabecera `Content-Security-Policy` en Caddy (refuerzo). |
| CSRF | 🟡 | Cookie `SameSite=Lax` + API JSON, alcanza para el caso actual. Si algún día se aceptan formularios o se cambia a `SameSite=None`, agregar token CSRF. |
| Otras vulnerabilidades | 🟡 | Rate limit en login, cabeceras básicas en Caddy. Faltan HSTS y CSP. |
| **Repo público** | ⚠️ | El repo de GitHub es público. No hay secretos, pero sí lógica y credenciales de prueba del seed. Evaluar pasarlo a privado. |

## 3. Infraestructura

| Punto del video | Estado | Situación |
|---|---|---|
| Servidores / nube | ✅ | AWS Lightsail (São Paulo), Docker Compose (db, api, web). |
| DNS y dominio | ❌ | Dominio provisorio `sslip.io`. Falta registrar un dominio propio del súper y cambiar `DOMINIO` y `CORS_ORIGIN`. |
| Certificados SSL | ✅ | Caddy los renueva solo. |
| Balanceador de carga, firewall | 🟡 | Balanceador no hace falta (un servidor alcanza). Firewall: solo Caddy publica puertos; verificar que en Lightsail estén abiertos únicamente 22, 80 y 443, y SSH solo con llave. |
| Almacenamiento | ✅ | Volumen de Postgres + Excel del catálogo montado en solo lectura. |
| Backups | ✅ | `deploy/backup.sh` diario (14 copias), snapshots de Lightsail y copia a la PC. |
| Redundancia / recuperación ante desastres | 🟡 | Restauración ensayada el 2026-11-02 con una copia real (ver `docs/DEPLOY.md`, "Ensayar un backup en la PC"). Falta: la copia a la PC depende de hacerla a mano cada semana. |
| Escalabilidad, caché, colas, tareas en segundo plano | ➖ | No hace falta con el volumen actual (dos sucursales). Revisar si el consolidado o el Excel empiezan a tardar. |

## 4. Ambientes y entrega

| Punto del video | Estado | Situación |
|---|---|---|
| Ambientes desarrollo / staging / producción | 🟡 | Hay desarrollo (local) y producción (Lightsail). La prueba gratis (Netlify + Render + Neon) quedó como pseudo-staging y hay que apagarla o reconvertirla. No hay staging real. |
| Variables de entorno y secretos | ✅ | `.env.example` documentado, `JWT_SECRET` obligatorio, `.env.prod` solo en el servidor. |
| Integración continua (CI) | ❌ | No hay. Lint, build y tests corren solo a mano. |
| Despliegue continuo (CD) | ❌ | El deploy es manual por SSH (`git pull` + `docker compose up --build`). Aceptable, pero falta un script único y un checklist. |
| Control de versiones | ✅ | Git + GitHub, convención de commits (skill `commits`). |

## 5. Pruebas

| Punto del video | Estado | Situación |
|---|---|---|
| Pruebas unitarias | 🟡 | API: sí (helpers, parser de Excel, etc.). Web: ninguna (`test` es un `echo`). |
| Pruebas de integración | ✅ | 181 tests de la API contra Postgres real. |
| Pruebas end-to-end | ❌ | No hay pruebas automáticas del recorrido completo en el navegador (login → pedido → aprobación → Excel). |
| Pruebas de carga | ❌ | Nunca se midió cuántos repositores a la vez soporta el servidor de 2 GB. |
| Lint en la web | ❌ | `lint` de `apps/web` es un `echo`. |

## 6. Operación

| Punto del video | Estado | Situación |
|---|---|---|
| Logging | 🟡 | Fastify loguea por consola (pino). Desde 2026-11-02 los logs de Docker rotan solos (5 × 10 MB por servicio). Falta un lugar donde buscarlos cómodo. |
| Monitoreo, métricas, alertas | 🟡 | Desde 2026-11-01: UptimeRobot revisa `/api/health` cada 5 min y avisa por mail (prueba recibida). Faltan métricas de uso y rendimiento. |
| Trazabilidad / observabilidad | 🟡 | Hay `requestId` de Fastify en los logs, sin un lugar donde buscarlos. |
| Errores no controlados | 🟡 | Sin `setErrorHandler` propio: revisar que ningún error devuelva detalles internos y que el mensaje al usuario sea en castellano simple. |
| Rendimiento | 🟡 | Sin medir. Revisar índices de pedidos por período/usuario cuando haya meses de datos. |

## 7. Lo que no aplica (hoy)

| Punto del video | Por qué no |
|---|---|
| Pasarela de pagos, conciliación, reembolsos | Sistema interno, no cobra nada. |
| Correos (SPF, DKIM, DMARC) | La app no manda correos. Si se agrega "olvidé mi contraseña" o avisos por mail, esto pasa a ser obligatorio. |
| App móvil (certificados, firmas, Google Play / App Store) | Es web. Si se quiere "instalable", el camino es PWA, no tiendas. |

## 8. Legal y mantenimiento

| Punto del video | Estado | Situación |
|---|---|---|
| Protección de datos personales | 🟡 | Se guardan nombre, email y sucursal de empleados. Ley 25.326: dejar escrito qué datos se guardan, para qué, y quién puede verlos. Una página corta alcanza. |
| Términos y condiciones | ➖ | Uso interno; alcanza con una nota de uso aceptable para empleados. |
| Actualización de dependencias | 🟡 | Se hizo mantenimiento (2026-10-27). Quedan avisos altos en zod <4 y Prisma 6, que necesitan sprints dedicados. Sin rutina fija. |
| Costos de infraestructura | 🟡 | Lightsail pagado por Agustín. Falta dejar escrito el costo mensual y quién lo paga a futuro, junto con el dominio. |
| Mantenerlo funcionando (APIs de terceros, SO, dependencias) | 🟡 | Ubuntu sin actualizaciones automáticas confirmadas. Sin calendario de mantenimiento. |

---

## Plan para dejarlo "como lo haría un ingeniero"

En orden de prioridad. Cada paso es chico y se puede hacer por separado.

### Prioridad alta (protege lo que ya está en producción)

1. ✅ *Hecho 2026-11-01 (ver `docs/DEPLOY.md` §15).* **Saber cuándo se cae.** Monitor externo gratis (UptimeRobot, Better Stack o similar) que consulte `https://<dominio>/api/health` cada 5 minutos y avise por mail o Telegram.
2. ✅ *Hecho 2026-11-02 (ver `docs/DEPLOY.md`).* **Probar una restauración.** Tomar el último backup, restaurarlo en la base local (`docker compose up -d` + `gunzip -c backup.sql.gz | psql`) y comprobar que la app muestra los pedidos. Escribir los pasos en `docs/DEPLOY.md` sección "Restaurar un backup".
3. ✅ *Hecho 2026-11-02 (bloque `x-logging` en `docker-compose.prod.yml`, json-file 5 × 10 MB).* **Rotación de logs de Docker.**
4. **Endurecer el servidor.** Firewall de Lightsail con solo 22/80/443; `unattended-upgrades` activado en Ubuntu; SSH solo con llave.
5. **Dominio propio.** Registrar el dominio del súper, cambiar `DOMINIO` y `CORS_ORIGIN` en `.env.prod`, reiniciar.
6. **Apagar la prueba gratis.** Netlify, Render y Neon (borrar la base de Neon). Evaluar si el repo debería ser privado.

### Prioridad media (evita romper cosas al cambiar código)

7. **CI con GitHub Actions.** En cada push: `pnpm install`, `pnpm lint`, `pnpm build` y `pnpm --filter api test` con un servicio Postgres 16. Si falla, no se despliega.
8. **Script de deploy único** `deploy/deploy.sh`: backup → `git pull` → `docker compose up -d --build` → `prisma migrate deploy` → chequeo de `/health`. Y un checklist corto antes de desplegar.
9. **Cabeceras de seguridad que faltan** en el `Caddyfile`: `Strict-Transport-Security` (cuando haya dominio propio) y una `Content-Security-Policy` básica.
10. **Manejador de errores** en la API: `setErrorHandler` que loguee el error completo con su `requestId` y le devuelva al usuario un mensaje simple en castellano, sin detalles internos.
11. **Lint y tests mínimos en la web.** ESLint real en `apps/web` y al menos tests de los componentes críticos (armado del pedido).
12. **Pruebas end-to-end** con Playwright para el recorrido principal: repositor arma y envía → encargada aprueba → consolidado → descarga del Excel.

### Prioridad baja (cuando haya uso real y tiempo)

13. **`tokenVersion`** para invalidar sesiones al cambiar contraseña o desactivar un usuario.
14. **Requerimientos no funcionales por escrito** en el README: usuarios simultáneos esperados, horario crítico, tiempo máximo caído aceptable, cuánto dato se puede perder (último backup).
15. **Prueba de carga** sencilla (k6 o autocannon) simulando 20 repositores armando pedidos a la vez.
16. **Staging.** Usar un segundo `docker compose` en el mismo servidor con otra base, o reconvertir la prueba gratis, para probar antes de tocar producción.
17. **Página de datos personales** (qué se guarda, para qué y quién lo ve) y nota de uso para empleados.
18. **Rutina de mantenimiento mensual:** `pnpm audit`, actualizar parches, revisar espacio en disco y backups, revisar el costo. Sprints dedicados para zod 4 y Prisma 7.
19. **Costos por escrito:** servidor, dominio y quién paga cada uno.

### Si en el futuro se agrega…

- **Correo** (recuperar contraseña, avisos): configurar SPF, DKIM y DMARC del dominio, o los mails terminan en spam.
- **Uso desde el celular como app:** PWA (manifest + service worker), no tiendas.
- **Más sucursales o mucho más volumen:** recién ahí pensar en caché, colas o un servidor más grande.

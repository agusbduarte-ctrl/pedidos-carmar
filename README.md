# Pedidos Cármar

Sistema interno de pedidos para los repositores y la encargada de compras del Supermercado Cármar.

**Estado actual:** Sprint 1.4 completo — backend con autenticación (JWT en cookie httpOnly), CRUD admin de usuarios, rubros, proveedores, productos y períodos, y el flujo de pedidos (armado por el repositor, revisión de la encargada), con 88 tests. Todavía no hay consolidado, exportación ni UI más allá de una página de prueba.

## Stack

| Capa | Tecnología |
|---|---|
| Monorepo | pnpm workspaces (pnpm 9) |
| Backend (`apps/api`) | Node 24, Fastify 5, Prisma 6, Zod, TypeScript 5 |
| Auth (`apps/api`) | `@fastify/jwt`, `@fastify/cookie`, `@fastify/rate-limit`, bcryptjs |
| Base de datos | PostgreSQL 16 (Docker Compose en local) |
| Frontend (`apps/web`) | React 18, Vite 6, TypeScript 5 |
| Calidad | ESLint 10 + typescript-eslint (api), Vitest (api) |

**Todavía no existe** (aunque estaba en planes anteriores): Tailwind, PWA, deploy en Railway, rama `develop`, CI.

## Estructura

```
pedidos_carmar/
├── apps/
│   ├── api/                  Backend Fastify
│   │   ├── prisma/
│   │   │   ├── schema.prisma   Modelo de dominio
│   │   │   ├── migrations/     Migraciones SQL versionadas
│   │   │   └── seed.ts         Datos de prueba
│   │   ├── src/
│   │   │   ├── server.ts       Arranque (puerto PORT, por defecto 3000)
│   │   │   ├── app.ts          buildApp(): plugins y rutas, sin escuchar (lo usan los tests)
│   │   │   ├── lib/            jwt, middleware de auth, paginación, helpers de Zod
│   │   │   ├── routes/         auth y admin/*, cada una con su .test.ts
│   │   │   └── test/           helpers compartidos por los tests
│   │   ├── vitest.config.ts
│   │   └── eslint.config.mjs
│   └── web/                  Frontend React + Vite (puerto 5173)
│       └── src/
├── docker-compose.yml        Postgres 16 local
├── .env.example              Variables de entorno de referencia
└── pnpm-workspace.yaml
```

## Cómo arrancar

Requisitos: Node 24, pnpm 9, Docker.

```bash
pnpm install
docker compose up -d

# Variables de entorno de la API: copiar .env.example a apps/api/.env
# y generar un JWT_SECRET propio (no usar el del ejemplo)

pnpm --filter api exec prisma migrate dev
pnpm --filter api seed
pnpm dev
```

- API: http://localhost:3000/health
- Web: http://localhost:5173

> En pnpm 9, los comandos de Prisma van con `exec`: `pnpm --filter api exec prisma <comando>`.

### Variables de entorno (`apps/api/.env`)

| Variable | Para qué | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Conexión a Postgres | `postgresql://carmar:carmar@localhost:5432/pedidos_carmar` |
| `JWT_SECRET` | Firma de los tokens. **Obligatoria**: sin ella la API no arranca | generar uno propio |
| `JWT_EXPIRES_IN` | Duración del token | `7d` |
| `CORS_ORIGIN` | Origen permitido del frontend | `http://localhost:5173` |
| `NODE_ENV` | En `production` la cookie se marca `Secure` | `development` |
| `PORT` | Puerto de la API | `3000` |

### Usuarios de prueba (solo desarrollo local)

Creados por `pnpm --filter api seed`, que **borra y recrea todos los datos**.

| Rol | Acceso |
|---|---|
| ADMIN | `admin@carmar.com` / `admin123` |
| ENCARGADA | `encargada@carmar.com` / `encargada123` |
| REPOSITOR (CARMAR_1) | PIN `1234` — rubros Limpieza y Bazar |

## API

Todas las rutas `/admin/*` requieren sesión de un usuario con rol ADMIN. El token viaja en la cookie httpOnly `token` (también se acepta `Authorization: Bearer`).

| Método y ruta | Qué hace |
|---|---|
| `GET /health` | Estado de la API y de la base |
| `GET /auth/repositores?sucursal=` | Lista pública de repositores para el login con PIN |
| `POST /auth/login` | `{ tipo: "email", email, password }` o `{ tipo: "repositor", usuarioId, pin }`. Límite: 5/min por IP, 10/min por usuario; 10 PIN fallidos bloquean 15 min |
| `POST /auth/logout` · `GET /auth/me` | Cerrar sesión · usuario actual |
| `/admin/usuarios` | CRUD. Filtros `q`, `rol`, `incluirInactivos`. Un admin no puede desactivarse ni borrarse a sí mismo; el rol no se cambia por PATCH |
| `/admin/rubros` · `/admin/proveedores` | CRUD. Filtro `q` |
| `/admin/productos` | CRUD. Filtros `q` (nombre o código), `rubroId`, `proveedorId`, `incluirInactivos` |
| `/admin/periodos` | Alta, edición y `POST /:id/cerrar`. Un solo período abierto a la vez; no se reabren |

### Pedidos

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `GET /pedidos/mis-pedidos` | REPOSITOR | Sus pedidos, paginados, con período y cantidad de ítems |
| `GET /pedidos/mis-pedidos/:id` | REPOSITOR | Detalle de un pedido propio con sus ítems (de otro: 404) |
| `POST /pedidos` | REPOSITOR | Crea su pedido en BORRADOR en el período abierto |
| `POST /pedidos/:id/items` | REPOSITOR | Agrega un ítem `{ productoId, cantidad, observacion? }`; si el producto ya está, suma la cantidad |
| `DELETE /pedidos/:id/items/:itemId` | REPOSITOR | Quita un ítem |
| `POST /pedidos/:id/enviar` | REPOSITOR | BORRADOR o DEVUELTO → ENVIADO (revalida todos los ítems) |
| `GET /pedidos` | ENCARGADA, ADMIN | Pedidos con filtros `sucursal`, `periodoId`, `estado`, `repositorId`. Sin `estado`, excluye los BORRADOR |
| `GET /pedidos/:id` | ENCARGADA, ADMIN | Detalle con ítems, rubro de cada producto y quién envió, devolvió o aprobó |
| `POST /pedidos/:id/devolver` | ENCARGADA | ENVIADO → DEVUELTO con `{ comentario }` (1 a 500 caracteres) |
| `POST /pedidos/:id/aprobar` | ENCARGADA | ENVIADO → APROBADO |

Reglas de negocio:

- **Máquina de estados:** BORRADOR → ENVIADO (repositor) → DEVUELTO o APROBADO (encargada); DEVUELTO → ENVIADO (repositor). El repositor solo edita en BORRADOR o DEVUELTO. **APROBADO es inmutable.** Si dos encargadas actúan a la vez sobre el mismo pedido, la segunda recibe 400.
- **Un pedido por repositor por período.** Sin período abierto no se puede crear (400). Si el período se cierra con un pedido sin enviar, ese pedido queda huérfano: no se edita ni se envía. La encargada sí puede aprobar o devolver pedidos de un período cerrado.
- **Ítems:** el producto tiene que estar activo y su rubro asignado al repositor en la sucursal del pedido. Cantidad mayor a 0; **enteros para UN, CAJA y PACK, decimales solo para KG y LT**. Observación de hasta 200 caracteres.
- **Al enviar se revalida todo:** si desde que se cargó un ítem el producto se desactivó, el repositor perdió el rubro o la unidad cambió, el envío falla con el detalle de cada ítem.
- **Devoluciones:** se guarda solo la última (comentario, fecha y quién la hizo).

Convenciones:

- **Listas paginadas**: `?page=1&limit=20` (máximo 100). Respuesta `{ data, meta: { total, page, limit, totalPages } }`.
- **Decimales** (`precioReferencia`, `cantidad`) llegan como texto en el JSON (`"5.5"`): el frontend los convierte con `Number()`.
- **Errores de validación**: 400 `{ error, detalles: ["campo: mensaje", ...] }`. Conflictos (nombre, email o código repetido): 409.
- **PATCH**: un campo ausente no se toca; `null` lo vacía (donde está permitido); campos desconocidos o no editables dan 400.
- **Nombres, emails y códigos** se comparan sin distinguir mayúsculas al chequear duplicados.

## Semántica de `activo` vs `deletedAt`

`Usuario`, `Producto`, `Rubro` y `Proveedor` tienen los dos campos, con significados distintos:

| Campo | Significa | Quién lo cambia |
|---|---|---|
| `deletedAt` | **Eliminado** por un admin. No se borra nada de la base: el registro queda marcado y deja de aparecer en todas las listas. | `DELETE /admin/...` |
| `activo` | **Habilitado para pedidos.** Un registro puede estar inactivo sin estar eliminado (por ejemplo, un producto que se dejó de pedir temporalmente). | `PATCH /admin/...` con `activo` |

Reglas:

- **Listas normales** (y todo lo que use el frontend de pedidos): solo `activo = true` y `deletedAt = null`.
- **Listas admin**: por defecto igual que las normales; con `?incluirInactivos=true` muestran también los inactivos. Los eliminados no aparecen nunca.
- **Restaurar**: crear un registro con el mismo nombre (rubros, proveedores), email (usuarios) o código (productos) que uno eliminado lo restaura: `deletedAt` vuelve a `null` y `activo` se mantiene como estaba (en productos, salvo que el alta envíe `activo` explícitamente).
- **Borrar con dependencias**: no se puede eliminar un rubro o proveedor con productos activos, ni un rubro asignado a repositores activos.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta api y web en paralelo |
| `pnpm build` | Compila api (`tsc`) y web (`vite build`) |
| `pnpm --filter api lint` | ESLint sobre `src/` y `prisma/` |
| `pnpm --filter api test` | Vitest: 88 tests de integración con `app.inject()` |
| `pnpm --filter api seed` | Recarga los datos de prueba |
| `pnpm --filter api exec prisma studio` | Explorador visual de la base |

`apps/web` todavía tiene `lint` y `test` de relleno (`echo`).

### Sobre los tests

Corren **contra la base de desarrollo** (necesitan Docker arriba y el seed cargado), **un archivo a la vez**. Cada archivo crea y borra solo sus propios datos, identificados por un prefijo (`test-rubros-`, `test-ped-`, …), y no modifica el seed. La excepción son `periodos.test.ts` y `pedidos.test.ts`: cierran temporalmente el período abierto del seed y lo vuelven a abrir al terminar cada test (por eso no pueden correr en paralelo). Si se corta una corrida a mitad de camino y el período del seed queda cerrado, `pnpm --filter api seed` lo repone.

## Mover el proyecto a otra carpeta

Los enlaces (symlinks) que pnpm crea en `node_modules` guardan rutas absolutas. Si movés la carpeta del proyecto sin más, esos enlaces se rompen y ningún comando va a funcionar.

Pasos correctos para mover el proyecto:

1. Borrar `node_modules` **antes** de mover:
   ```
   cmd /c rmdir /s /q node_modules
   cmd /c rmdir /s /q apps\api\node_modules
   cmd /c rmdir /s /q apps\web\node_modules
   ```
2. Mover la carpeta a la nueva ubicación.
3. Reinstalar en la nueva ubicación:
   ```
   pnpm install
   ```
4. Aplicar migraciones y seed si es la primera vez:
   ```
   pnpm --filter api exec prisma migrate deploy
   pnpm --filter api exec prisma generate
   pnpm --filter api seed
   ```

No uses `Move-Item` de PowerShell 5.1 en `node_modules`: falla a mitad de camino con los enlaces de pnpm y deja todo a medio mover.

## Roadmap

- ~~**Sprint 1.1**~~ — Modelo de dominio, migración, seed.
- ~~**Sprint 1.2**~~ — Autenticación: email + contraseña para admin/encargada; lista de usuarios + PIN para repositores.
- ~~**Sprint 1.3**~~ — CRUD admin: usuarios, rubros, proveedores, productos, períodos.
- ~~**Sprint 1.4**~~ — Pedidos: armado por repositor, envío, devolución y aprobación.
- **Sprint 1.5** — Importación del catálogo real de artículos de Cármar.
- **Sprint 1.6** — Consolidado de pedidos por período.
- **Sprint 1.7** — Exportación.
- **Sprint 2.x** — Frontend.
- **Sprint 3.x** — Deploy (y logging estructurado).
- Pendientes futuros, sin sprint asignado:
  - Historial de devoluciones de un pedido (hoy solo se guarda la última).
  - `tokenVersion` para invalidar sesiones al hacer logout o cambiar la contraseña (hoy el token vale hasta que vence, salvo que el usuario se desactive).
  - Migrar `package.json#prisma` a `prisma.config.ts`.
  - CI, Tailwind/PWA, lint y tests en `apps/web`.

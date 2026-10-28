# Pedidos Cármar

Sistema interno de pedidos para los repositores y la encargada de compras del Supermercado Cármar.

**Estado actual:** Sprint 2.5 completo — backend con autenticación (JWT en cookie httpOnly), CRUD admin de usuarios, rubros, proveedores, productos y períodos, el flujo de pedidos, el catálogo real importado (14.322 artículos), el consolidado por período y su exportación a Excel, con 159 tests. El frontend cubre el login, la pantalla del repositor (armar y enviar su pedido), la de la encargada (revisar, aprobar o devolver), la del consolidado (generar, ajustar, aprobar y descargar el Excel) y la administración de usuarios, productos, rubros, proveedores y períodos.

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
| `CATALOGO_XLSX_PATH` | Excel de artículos para `import-catalogo`, relativo a la raíz del repo o absoluto | `./data/catalogo.xlsx` |

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
| `GET` · `PUT /admin/usuarios/:id/rubros` | Rubros que repone un REPOSITOR en su sucursal. El `PUT` con `{ rubroIds }` reemplaza el conjunto (vacío = quita todos) sin tocar las de otras sucursales. Si el usuario no es repositor o no tiene sucursal: 400 |
| `/admin/rubros` · `/admin/proveedores` | CRUD. Filtro `q` |
| `/admin/productos` | CRUD. Filtros `q` (nombre o código), `rubroId`, `proveedorId`, `incluirInactivos` |
| `/admin/periodos` | Alta, edición y `POST /:id/cerrar`. Un solo período abierto a la vez; no se reabren |

### Pedidos

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `GET /pedidos/mis-pedidos` | REPOSITOR | Sus pedidos, paginados, con período y cantidad de ítems |
| `GET /pedidos/mis-pedidos/:id` | REPOSITOR | Detalle de un pedido propio con sus ítems (de otro: 404) |
| `GET /pedidos/productos` | REPOSITOR | Busca productos que puede cargar (`q` por nombre o código, `rubroId`, paginado): activos y de sus rubros en su sucursal, sin datos de proveedor |
| `GET /pedidos/mis-rubros` | REPOSITOR | Rubros asignados al repositor en su sucursal |
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
- **Consolidado aprobado:** si el período ya tiene un consolidado APROBADO, los pedidos no se pueden enviar ni devolver (ver abajo).

### Consolidado

Suma, por producto, los pedidos ENVIADOS y APROBADOS de un período. Todas las rutas son para ENCARGADA y ADMIN.

| Método y ruta | Qué hace |
|---|---|
| `GET /consolidados` | Lista con filtros `periodoId` y `estado`, paginada |
| `GET /consolidados/:id` | Detalle con cada producto (código, unidad, rubro, proveedor), `cantidadTotal` y `cantidadEditada` |
| `POST /consolidados` | `{ periodoId }`: genera el consolidado BORRADOR del período (o lo regenera) |
| `PATCH /consolidados/:id/items/:itemId` | `{ cantidadEditada, observacion? }`: ajuste manual de un ítem (`null` vuelve a la suma automática) |
| `POST /consolidados/:id/aprobar` | BORRADOR → APROBADO |
| `GET /consolidados/:id/export` | Descarga el `.xlsx` con una hoja por proveedor; sirve en BORRADOR y APROBADO |
| `GET /periodos` | Lista de períodos de solo lectura (filtro `estado`, paginada) para que la encargada elija cuál consolidar. La gestión sigue en `/admin/periodos` |

Reglas del consolidado:

- **El BORRADOR se puede regenerar** las veces que haga falta: se borra el anterior (con sus cantidades editadas) y se crea uno nuevo con los pedidos del momento. Se puede generar con el período todavía abierto, para ir viendo cómo viene; el flujo es generar → revisar → regenerar cuando llegaron todos los pedidos → ajustar → aprobar. Un período tiene a lo sumo un BORRADOR (las generaciones simultáneas se serializan).
- **`cantidadTotal`** es la suma automática; **`cantidadEditada`** es el ajuste manual de la encargada (vacío si no se tocó). La exportación usa `cantidadEditada` cuando existe. Misma regla de unidades que los pedidos: enteros salvo KG y LT.
- **El APROBADO es inmutable:** no se edita, no se regenera (409) y no se vuelve a aprobar.
- **Con un consolidado APROBADO en el período, los pedidos quedan congelados:** no se pueden enviar ni devolver (400), porque eso cambiaría lo que se consolidó. Aprobar un pedido ENVIADO sí se permite: ya estaba sumado y lo sigue estando.
- **Roles:** el admin puede generar, editar y aprobar consolidados (es un acto administrativo), pero **no** aprueba ni devuelve pedidos individuales: eso es un acto de la encargada, que valida el trabajo del repositor.

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
| `pnpm --filter api test` | Vitest: 119 tests (integración con `app.inject()` y unitarios del parser y la importación) |
| `pnpm --filter api seed` | Recarga los datos de prueba. **Borra todo**, incluido el catálogo importado |
| `pnpm --filter api import-catalogo` | Importa el catálogo real desde `CATALOGO_XLSX_PATH` (ver abajo) |
| `pnpm --filter api exec prisma studio` | Explorador visual de la base |

`apps/web` todavía tiene `lint` y `test` de relleno (`echo`).

### Importación del catálogo

El catálogo real sale del Excel "BASE DE DATOS DE ARTICULOS" del sistema de Cármar (columnas `Cod. Art. Local`, `Artículo`, `Códigos Barras`, `Cod. Rubro`, `Rubro`). **El Excel no va al repo**: se copia a `data/catalogo.xlsx` (la carpeta `/data/` está en `.gitignore`) y se apunta `CATALOGO_XLSX_PATH` en `apps/api/.env`.

`pnpm --filter api import-catalogo`:

- Crea los rubros (por código; si ya existe uno con el mismo nombre, lo reutiliza y le asigna el código) y los productos nuevos en `UN`, activos y con el proveedor **SIN ASIGNAR**.
- En productos existentes actualiza nombre y rubro, y completa el proveedor solo si está vacío (no pisa uno real). No toca `activo`, ni la unidad, ni los productos borrados por un admin.
- Los códigos de artículo se guardan sin ceros a la izquierda (`000000000119951` → `119951`). Los códigos de barras van a la tabla `CodigoBarras` (0 o más por producto).
- Es **idempotente** y **nunca borra**: se puede correr cada vez que haya un Excel nuevo. Trabaja en transacciones de 500 productos; si un lote falla, los demás quedan importados y alcanza con volver a correrlo.
- Con el Excel actual (14.322 artículos): la primera corrida crea 88 rubros, 14.322 productos y 14.343 códigos de barras en unos 7 s; las siguientes no crean nada.

> ⚠️ `pnpm --filter api seed` **borra todos los productos y rubros**, incluidos los importados. Después de un seed, volver a correr `pnpm --filter api import-catalogo`.

`Producto.proveedorId` es opcional: si se borra físicamente un proveedor, sus productos quedan sin proveedor (`ON DELETE SET NULL`). En la práctica los proveedores solo se eliminan con borrado lógico.

`xlsx` (SheetJS) se instala desde `apps/api/vendor/` y no desde npm, porque la versión de npm tiene vulnerabilidades sin corregir (ver `apps/api/vendor/README.md`).

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
- ~~**Sprint 1.5**~~ — Importación del catálogo real de artículos de Cármar.
- ~~**Sprint 1.6**~~ — Consolidado de pedidos por período.
- ~~**Sprint 1.7**~~ — Exportación del consolidado a Excel.
- ~~**Sprint 2.1**~~ — Frontend del repositor:
  - Parte 1: base de `apps/web` (router, TanStack Query, proxy `/api` de Vite) y login (email o PIN), sesión con `/auth/me`, rutas por rol y cierre de sesión.
  - Parte 2: pantalla de pedido del repositor (empezar, buscar productos, agregar, quitar, enviar, corregir un pedido devuelto). Suma `GET /pedidos/productos` y `GET /pedidos/mis-rubros` en la API.
- ~~**Sprint 2.2**~~ — Pantalla de la encargada: lista de pedidos por estado y sucursal, detalle con ítems por rubro, aprobar y devolver con comentario. El admin la ve en solo lectura.
- ~~**Sprint 2.3**~~ — Pantalla del consolidado para encargada y admin: elegir período, generar y regenerar, ajustar cantidades por ítem, aprobar y descargar el Excel. Suma `GET /periodos` en la API.
- ~~**Sprint 2.4**~~ — Administración en la web, solo para ADMIN: usuarios (alta, edición, activar/desactivar, borrar y rubros que repone cada repositor) y productos (alta, edición, rubro, unidad y proveedor; el código no se cambia). Suma `GET` y `PUT /admin/usuarios/:id/rubros` en la API.
- ~~**Sprint 2.5**~~ — Administración en la web de rubros, proveedores (con email y teléfono) y períodos, solo para ADMIN. "Desactivar" un rubro o proveedor es borrarlo (borrado lógico); la API lo impide si tiene productos activos o rubros asignados a repositores, y crear uno con el nombre de un borrado lo restaura. Al cerrar un período, la pantalla avisa cuántos pedidos quedan sin enviar, devueltos o esperando aprobación. Sin cambios en la API. Además, los avisos de éxito dejaron de convivir con los errores en las cinco pantallas de administración.
- **Sprint 2.x** — Pasada de diseño de toda la UI (skill `frontend-design`).
- **Sprint 3.x** — Deploy (y logging estructurado).
- Pendientes futuros, sin sprint asignado:
  - Historial de devoluciones de un pedido (hoy solo se guarda la última).
  - `tokenVersion` para invalidar sesiones al hacer logout o cambiar la contraseña (hoy el token vale hasta que vence, salvo que el usuario se desactive).
  - Migrar `package.json#prisma` a `prisma.config.ts`.
  - CI, Tailwind/PWA, lint y tests en `apps/web`.

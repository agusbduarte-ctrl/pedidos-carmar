# Pedidos Cármar

Sistema interno de pedidos para los repositores y la encargada de compras del Supermercado Cármar.

**Estado actual:** Sprint 1.1 completado — modelo de dominio, migración inicial, seed de datos de prueba y `GET /health` con estado de la base. Todavía no hay autenticación, endpoints de negocio ni UI más allá de una página de prueba.

## Stack

| Capa | Tecnología |
|---|---|
| Monorepo | pnpm workspaces (pnpm 9) |
| Backend (`apps/api`) | Node 24, Fastify 5, Prisma 6, Zod, TypeScript 5 |
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
│   │   ├── src/server.ts       Entrada de la API (puerto 3000)
│   │   └── eslint.config.mjs
│   └── web/                  Frontend React + Vite (puerto 5173)
│       └── src/
├── docker-compose.yml        Postgres 16 local
├── .env.example              Variables de entorno de referencia
└── pnpm-workspace.yaml
```

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

### Usuarios de prueba (solo desarrollo local)

Creados por `pnpm --filter api seed`, que **borra y recrea todos los datos**.

| Rol | Acceso |
|---|---|
| ADMIN | `admin@carmar.com` / `admin123` |
| ENCARGADA | `encargada@carmar.com` / `encargada123` |
| REPOSITOR (CARMAR_1) | PIN `1234` — rubros Limpieza y Bazar |

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta api y web en paralelo |
| `pnpm build` | Compila api (`tsc`) y web (`vite build`) |
| `pnpm --filter api lint` | ESLint sobre `src/` y `prisma/` |
| `pnpm --filter api test` | Vitest. **Todavía no hay tests**: falla con "No test files found" a propósito |
| `pnpm --filter api seed` | Recarga los datos de prueba |
| `pnpm --filter api exec prisma studio` | Explorador visual de la base |

`apps/web` todavía tiene `lint` y `test` de relleno (`echo`).

## Roadmap

- **Sprint 1.2** — Autenticación: email + contraseña para admin/encargada; lista de usuarios + PIN para repositores. Primeros tests con Vitest.
- **Sprint 2.1** — Frontend.
- **Sprint 3.1** — Logging estructurado.
- Pendiente sin sprint asignado: CI, deploy, Tailwind/PWA, lint y tests en `apps/web`.

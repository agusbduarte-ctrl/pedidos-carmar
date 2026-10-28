# pedidos_carmar

Sistema interno de pedidos del Supermercado Cármar. Monorepo pnpm: `apps/api` (Fastify 5 + Prisma 6 + Zod + Vitest, Postgres 16 en Docker) y `apps/web` (React + Vite, todavía mínima). Estado y estructura: `README.md`.

## Comandos

- Tests: `pnpm --filter api test` (necesita `docker compose up -d`; comparten la BD de desarrollo)
- Lint: `pnpm --filter api lint`
- Build: `pnpm build`

## Reglas

- Implementación de 2+ archivos o más de ~40 líneas: delegá en el subagente `coder`. Vos planificás y verificás.
- Flujo para cambios: skill `implementar-cambio`. Endpoints nuevos: `nuevo-endpoint`. Schema o migraciones: `prisma`. Commits: `commits`.
- Nunca: editar migraciones ya aplicadas, leer o modificar `.env`, commitear sin tests en verde.

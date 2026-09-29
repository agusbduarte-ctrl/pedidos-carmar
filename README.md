# Pedidos Cármar

Sistema interno de pedidos para repositores y encargada de compras del Supermercado Cármar.

## Stack

- **Frontend:** React + Vite + Tailwind (PWA)
- **Backend:** Node + Fastify + Prisma
- **Base de datos:** PostgreSQL

## Setup local

1. `pnpm install`
2. `docker compose up -d`
3. `pnpm --filter api prisma migrate dev`
4. `pnpm dev`

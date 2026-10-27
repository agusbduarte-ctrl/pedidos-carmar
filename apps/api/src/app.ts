import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { PrismaClient, EstadoPeriodo } from "@prisma/client";
import { COOKIE_NAME } from "./lib/jwt.js";
import { authRoutes } from "./routes/auth.js";
import rubrosRoutes from "./routes/admin/rubros.js";
import proveedoresRoutes from "./routes/admin/proveedores.js";
import usuariosRoutes from "./routes/admin/usuarios.js";
import productosRoutes from "./routes/admin/productos.js";
import periodosRoutes from "./routes/admin/periodos.js";
import pedidosRoutes from "./routes/pedidos.js";
import consolidadosRoutes from "./routes/consolidados.js";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient;
  }
}

interface HealthCounts {
  usuarios: number;
  productos: number;
  periodosAbiertos: number;
}

type HealthResponse =
  | { status: "ok"; timestamp: string; db: "connected"; counts: HealthCounts }
  | { status: "error"; timestamp: string; db: "error" };

export interface BuildAppOptions {
  logger?: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no definido`);
  return value;
}

export async function buildApp(
  prisma?: PrismaClient,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const db = prisma ?? new PrismaClient();
  const app = Fastify({ logger: options.logger ?? true });

  app.decorate("db", db);

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  });

  await app.register(cookie);

  await app.register(jwt, {
    secret: requireEnv("JWT_SECRET"),
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" },
    cookie: { cookieName: COOKIE_NAME, signed: false },
  });

  await app.register(rateLimit, {
    global: false, // deshabilitado global, se activa por ruta
    max: 100,
    timeWindow: "1 minute",
  });

  // /health (mismo comportamiento que antes)
  app.get("/health", async (_request, reply): Promise<HealthResponse> => {
    const timestamp = new Date().toISOString();
    try {
      const [usuarios, productos, periodosAbiertos] = await Promise.all([
        db.usuario.count(),
        db.producto.count(),
        db.periodo.count({ where: { estado: EstadoPeriodo.ABIERTO } }),
      ]);
      return {
        status: "ok",
        timestamp,
        db: "connected",
        counts: { usuarios, productos, periodosAbiertos },
      };
    } catch (err) {
      console.error("Health check: error de base de datos", err);
      reply.code(500);
      return { status: "error", timestamp, db: "error" };
    }
  });

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(rubrosRoutes, { prefix: "/admin/rubros" });
  await app.register(proveedoresRoutes, { prefix: "/admin/proveedores" });
  await app.register(usuariosRoutes, { prefix: "/admin/usuarios" });
  await app.register(productosRoutes, { prefix: "/admin/productos" });
  await app.register(periodosRoutes, { prefix: "/admin/periodos" });
  await app.register(pedidosRoutes, { prefix: "/pedidos" });
  await app.register(consolidadosRoutes, { prefix: "/consolidados" });

  app.addHook("onClose", async () => {
    if (!prisma) await db.$disconnect();
  });

  return app;
}

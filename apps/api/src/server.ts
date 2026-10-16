import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient, EstadoPeriodo } from "@prisma/client";

const prisma = new PrismaClient();

const app = Fastify({ logger: true });

app.register(cors, { origin: true });

interface HealthCounts {
  usuarios: number;
  productos: number;
  periodosAbiertos: number;
}

type HealthResponse =
  | { status: "ok"; timestamp: string; db: "connected"; counts: HealthCounts }
  | { status: "error"; timestamp: string; db: "error" };

app.get("/health", async (_request, reply): Promise<HealthResponse> => {
  const timestamp = new Date().toISOString();

  try {
    const [usuarios, productos, periodosAbiertos] = await Promise.all([
      prisma.usuario.count(),
      prisma.producto.count(),
      prisma.periodo.count({ where: { estado: EstadoPeriodo.ABIERTO } }),
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

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info(`${signal} recibido, cerrando...`);
  try {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const start = async () => {
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
    console.log("API en http://localhost:3000");
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
};

start();

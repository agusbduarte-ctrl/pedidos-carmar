import type { FastifyInstance } from "fastify";
import { EstadoPeriodo, Prisma, Rol } from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../lib/auth.js";
import { buildMeta, parsePagination, skipTake } from "../lib/pagination.js";
import { sendValidationError } from "../lib/zod-helpers.js";

const listQuery = z.object({ estado: z.nativeEnum(EstadoPeriodo).optional() });

// Lectura de períodos para ENCARGADA y ADMIN (la gestión sigue en /admin/periodos)
export default async function periodosLecturaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(Rol.ENCARGADA, Rol.ADMIN));

  app.get("/", async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const pagination = parsePagination(request.query);

    const where: Prisma.PeriodoWhereInput = query.data.estado ? { estado: query.data.estado } : {};
    const [data, total] = await Promise.all([
      app.db.periodo.findMany({ where, orderBy: { fechaApertura: "desc" }, ...skipTake(pagination) }),
      app.db.periodo.count({ where }),
    ]);

    return { data, meta: buildMeta(total, pagination.page, pagination.limit) };
  });
}

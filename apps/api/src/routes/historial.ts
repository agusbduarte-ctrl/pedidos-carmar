import type { FastifyInstance } from "fastify";
import { Rol } from "@prisma/client";
import { authenticate, requireRole } from "../lib/auth.js";
import { buildMeta, parsePagination } from "../lib/pagination.js";
import { sendValidationError } from "../lib/zod-helpers.js";
import {
  contarFilas,
  historialQuery,
  listarFilas,
  resolverFiltros,
  resumenPorProducto,
} from "../lib/historial.js";
import {
  DemasiadasFilasError,
  exportarHistorial,
  nombreArchivoHistorial,
} from "../lib/export-historial.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default async function historialRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(Rol.ENCARGADA, Rol.ADMIN));

  app.get("/", async (request, reply) => {
    const query = historialQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const resuelto = resolverFiltros(query.data);
    if (!resuelto.ok) return reply.code(400).send({ error: resuelto.error });
    const pagination = parsePagination(request.query);

    const [data, total, resumen] = await Promise.all([
      listarFilas(app.db, resuelto.filtros, pagination),
      contarFilas(app.db, resuelto.filtros),
      resumenPorProducto(app.db, resuelto.filtros),
    ]);
    return { data, meta: buildMeta(total, pagination.page, pagination.limit), resumen };
  });

  app.get("/excel", async (request, reply) => {
    const query = historialQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const resuelto = resolverFiltros(query.data);
    if (!resuelto.ok) return reply.code(400).send({ error: resuelto.error });
    const { filtros } = resuelto;

    try {
      const buffer = await exportarHistorial(app.db, filtros);
      return reply
        .header("Content-Type", XLSX_MIME)
        .header(
          "Content-Disposition",
          `attachment; filename="${nombreArchivoHistorial(filtros.desde, filtros.hasta)}"`,
        )
        .send(buffer);
    } catch (err) {
      if (err instanceof DemasiadasFilasError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });
}

import type { FastifyInstance, FastifyReply } from "fastify";
import { EstadoConsolidado, Prisma, Rol } from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../lib/auth.js";
import { CONSOLIDADO_COMPLETO, generarConsolidado } from "../lib/consolidado-helpers.js";
import {
  ConsolidadoNoEncontradoError,
  exportarConsolidado,
  nombreDeArchivo,
} from "../lib/export-consolidado.js";
import { buildMeta, parsePagination, skipTake } from "../lib/pagination.js";
import { cantidadValida } from "../lib/pedidos-helpers.js";
import { sendValidationError } from "../lib/zod-helpers.js";

const listaQuery = z.object({
  periodoId: z.string().min(1).optional(),
  estado: z.nativeEnum(EstadoConsolidado).optional(),
});
const idParams = z.object({ id: z.string().min(1) });
const itemParams = z.object({ id: z.string().min(1), itemId: z.string().min(1) });
const crearBody = z.object({ periodoId: z.string().min(1) });
const editarItemBody = z.object({
  // null = volver a la cantidad sumada (cantidadTotal). Decimal(10, 2) en la BD
  cantidadEditada: z.number().positive().max(99_999_999.99).nullable(),
  observacion: z.string().trim().max(200).nullable().optional(),
});

const NO_ENCONTRADO = { error: "Consolidado no encontrado" };
const CONGELADO = { error: "El consolidado está aprobado y no se puede modificar" };

export default async function consolidadosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(Rol.ENCARGADA, Rol.ADMIN));

  // Consolidado en BORRADOR; si no existe o está aprobado, responde el error y devuelve null
  const consolidadoEditable = async (id: string, reply: FastifyReply) => {
    const consolidado = await app.db.consolidado.findUnique({ where: { id }, select: { id: true, estado: true } });
    if (!consolidado) {
      reply.code(404).send(NO_ENCONTRADO);
      return null;
    }
    if (consolidado.estado !== EstadoConsolidado.BORRADOR) {
      reply.code(400).send(CONGELADO);
      return null;
    }
    return consolidado;
  };

  app.get("/", async (request, reply) => {
    const query = listaQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const pagination = parsePagination(request.query);

    const where: Prisma.ConsolidadoWhereInput = query.data;
    const [data, total] = await Promise.all([
      app.db.consolidado.findMany({
        where,
        include: {
          periodo: { select: { id: true, nombre: true, estado: true } },
          aprobadoPor: { select: { id: true, nombre: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(pagination),
      }),
      app.db.consolidado.count({ where }),
    ]);

    return { data, meta: buildMeta(total, pagination.page, pagination.limit) };
  });

  app.get("/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const data = await app.db.consolidado.findUnique({
      where: { id: params.data.id },
      include: CONSOLIDADO_COMPLETO,
    });
    if (!data) return reply.code(404).send(NO_ENCONTRADO);
    return { data };
  });

  app.post("/", async (request, reply) => {
    const body = crearBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);

    const resultado = await generarConsolidado(app.db, body.data.periodoId);
    if (!resultado.ok) {
      return resultado.error === "periodo_no_encontrado"
        ? reply.code(404).send({ error: "Período no encontrado" })
        : reply.code(409).send({ error: "Ya hay un consolidado aprobado para este período" });
    }
    return reply.code(201).send({ data: resultado.consolidado });
  });

  app.patch("/:id/items/:itemId", async (request, reply) => {
    const params = itemParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = editarItemBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    const { cantidadEditada, observacion } = body.data;

    const consolidado = await consolidadoEditable(params.data.id, reply);
    if (!consolidado) return reply;

    const item = await app.db.itemConsolidado.findFirst({
      where: { id: params.data.itemId, consolidadoId: consolidado.id },
      include: { producto: { select: { unidad: true } } },
    });
    if (!item) return reply.code(404).send({ error: "Ítem no encontrado" });

    // Misma regla que en los pedidos: enteros salvo KG y LT
    if (cantidadEditada !== null && !cantidadValida(cantidadEditada, item.producto.unidad)) {
      return reply.code(400).send({
        error: "Datos inválidos",
        detalles: [`cantidadEditada: Tiene que ser un número entero para productos en ${item.producto.unidad}`],
      });
    }

    // Condicionado a que el consolidado siga en BORRADOR (por si lo aprueban en paralelo)
    const { count } = await app.db.itemConsolidado.updateMany({
      where: { id: item.id, consolidado: { estado: EstadoConsolidado.BORRADOR } },
      data: { cantidadEditada, ...(observacion !== undefined ? { observacion } : {}) },
    });
    if (count === 0) return reply.code(400).send(CONGELADO);

    return {
      data: await app.db.itemConsolidado.findUniqueOrThrow({
        where: { id: item.id },
        include: CONSOLIDADO_COMPLETO.items.include,
      }),
    };
  });

  app.post("/:id/aprobar", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const consolidado = await consolidadoEditable(params.data.id, reply);
    if (!consolidado) return reply;

    const { count } = await app.db.consolidado.updateMany({
      where: { id: consolidado.id, estado: EstadoConsolidado.BORRADOR },
      data: {
        estado: EstadoConsolidado.APROBADO,
        aprobadoPorId: request.user.id,
        fechaAprobacion: new Date(),
      },
    });
    if (count === 0) return reply.code(400).send(CONGELADO);

    return {
      data: await app.db.consolidado.findUniqueOrThrow({
        where: { id: consolidado.id },
        include: CONSOLIDADO_COMPLETO,
      }),
    };
  });

  // Excel con una hoja por proveedor. Se puede exportar en BORRADOR o APROBADO.
  app.get("/:id/export", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const consolidado = await app.db.consolidado.findUnique({
      where: { id: params.data.id },
      select: { periodo: { select: { nombre: true } } },
    });
    if (!consolidado) return reply.code(404).send(NO_ENCONTRADO);

    try {
      const buffer = await exportarConsolidado(app.db, params.data.id);
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", `attachment; filename="${nombreDeArchivo(consolidado.periodo.nombre)}"`)
        .send(buffer);
    } catch (err) {
      // Lo borraron (regeneraron) entre la consulta de arriba y la exportación
      if (err instanceof ConsolidadoNoEncontradoError) return reply.code(404).send(NO_ENCONTRADO);
      throw err;
    }
  });
}

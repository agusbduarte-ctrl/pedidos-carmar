import type { FastifyInstance } from "fastify";
import { EstadoPeriodo, Prisma, Rol } from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../../lib/auth.js";
import { buildMeta, parsePagination, skipTake } from "../../lib/pagination.js";
import { sendValidationError } from "../../lib/zod-helpers.js";

const listQuery = z.object({ estado: z.nativeEnum(EstadoPeriodo).optional() });
const idParams = z.object({ id: z.string().min(1) });

const nombre = z.string().trim().min(2);
const fecha = z.coerce.date();

const crearBody = z
  .object({ nombre, fechaApertura: fecha, fechaCierre: fecha.optional() })
  .refine((d) => !d.fechaCierre || d.fechaApertura <= d.fechaCierre, {
    path: ["fechaCierre"],
    message: "No puede ser anterior a la fecha de apertura",
  });

// strict: estado y fechaApertura no se cambian por PATCH (no se puede reabrir)
const editarBody = z
  .object({ nombre: nombre.optional(), fechaCierre: fecha.nullable().optional() })
  .strict();

const NOMBRE_EN_USO = { error: "Ya existe un período con ese nombre" };
const NO_ENCONTRADO = { error: "Período no encontrado" };

export default async function periodosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(Rol.ADMIN));

  // Periodo.nombre no es @unique en la BD: la unicidad se controla acá
  const nombreEnUso = async (valor: string, excluirId?: string) =>
    (await app.db.periodo.count({
      where: {
        nombre: { equals: valor, mode: "insensitive" },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
    })) > 0;

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

  app.post("/", async (request, reply) => {
    const body = crearBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);

    if (await nombreEnUso(body.data.nombre)) return reply.code(409).send(NOMBRE_EN_USO);

    const abierto = await app.db.periodo.findFirst({ where: { estado: EstadoPeriodo.ABIERTO } });
    if (abierto) {
      return reply.code(409).send({ error: `Ya hay un período abierto: ${abierto.nombre}` });
    }

    const data = await app.db.periodo.create({ data: body.data });
    return reply.code(201).send({ data });
  });

  app.patch("/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = editarBody.safeParse(request.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const periodo = await app.db.periodo.findUnique({ where: { id: params.data.id } });
    if (!periodo) return reply.code(404).send(NO_ENCONTRADO);
    if (periodo.estado !== EstadoPeriodo.ABIERTO) {
      return reply.code(409).send({ error: "Solo se puede editar un período abierto" });
    }

    const { nombre: nuevoNombre, fechaCierre } = body.data;
    if (fechaCierre && fechaCierre < periodo.fechaApertura) {
      return reply.code(400).send({
        error: "Datos inválidos",
        detalles: ["fechaCierre: No puede ser anterior a la fecha de apertura"],
      });
    }
    if (nuevoNombre && (await nombreEnUso(nuevoNombre, periodo.id))) {
      return reply.code(409).send(NOMBRE_EN_USO);
    }

    const data = await app.db.periodo.update({ where: { id: periodo.id }, data: body.data });
    return { data };
  });

  app.post("/:id/cerrar", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const periodo = await app.db.periodo.findUnique({ where: { id: params.data.id } });
    if (!periodo) return reply.code(404).send(NO_ENCONTRADO);
    if (periodo.estado === EstadoPeriodo.CERRADO) {
      return reply.code(409).send({ error: "El período ya está cerrado" });
    }

    const data = await app.db.periodo.update({
      where: { id: periodo.id },
      data: { estado: EstadoPeriodo.CERRADO, fechaCierre: periodo.fechaCierre ?? new Date() },
    });
    return { data };
  });
}

import type { FastifyInstance } from "fastify";
import { Rol } from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../../lib/auth.js";
import { buildMeta, parsePagination, skipTake } from "../../lib/pagination.js";
import { isUniqueViolation, sendValidationError } from "../../lib/zod-helpers.js";

const listQuery = z.object({ q: z.string().trim().optional() });
const idParams = z.object({ id: z.string().min(1) });
const nombre = z.string().trim().min(2);
const email = z.string().trim().email();
const telefono = z.string().trim().min(1);
const crearBody = z.object({ nombre, email: email.optional(), telefono: telefono.optional() });
// undefined = no tocar, null = vaciar, string = actualizar
const editarBody = z.object({
  nombre: nombre.optional(),
  email: email.nullable().optional(),
  telefono: telefono.nullable().optional(),
});

const YA_EXISTE = { error: "El proveedor ya existe" };
const NO_ENCONTRADO = { error: "Proveedor no encontrado" };

export default async function proveedoresRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(Rol.ADMIN));

  // Incluye borrados: el nombre es @unique en la BD aunque el proveedor esté borrado
  const conMismoNombre = (valor: string, excluirId?: string) =>
    app.db.proveedor.findMany({
      where: {
        nombre: { equals: valor, mode: "insensitive" },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
    });

  app.get("/", async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const pagination = parsePagination(request.query);

    const where = {
      deletedAt: null,
      ...(query.data.q ? { nombre: { contains: query.data.q, mode: "insensitive" as const } } : {}),
    };
    const [data, total] = await Promise.all([
      app.db.proveedor.findMany({ where, orderBy: { nombre: "asc" }, ...skipTake(pagination) }),
      app.db.proveedor.count({ where }),
    ]);

    return { data, meta: buildMeta(total, pagination.page, pagination.limit) };
  });

  app.post("/", async (request, reply) => {
    const body = crearBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);

    const existentes = await conMismoNombre(body.data.nombre);
    if (existentes.some((p) => p.deletedAt === null)) {
      return reply.code(409).send(YA_EXISTE);
    }

    // Restaurar un borrado equivale a darlo de alta de nuevo: los campos
    // que no se envían quedan vacíos, igual que en un alta.
    const campos = {
      nombre: body.data.nombre,
      email: body.data.email ?? null,
      telefono: body.data.telefono ?? null,
    };
    try {
      const borrado = existentes[0];
      const data = borrado
        ? await app.db.proveedor.update({
            where: { id: borrado.id },
            data: { ...campos, deletedAt: null },
          })
        : await app.db.proveedor.create({ data: campos });
      return reply.code(201).send({ data });
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send(YA_EXISTE);
      throw err;
    }
  });

  app.patch("/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = editarBody.safeParse(request.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const proveedor = await app.db.proveedor.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!proveedor) return reply.code(404).send(NO_ENCONTRADO);

    if (body.data.nombre) {
      // En PATCH no se restaura: cualquier coincidencia (activa o borrada) es conflicto
      const otros = await conMismoNombre(body.data.nombre, proveedor.id);
      if (otros.length > 0) {
        return reply.code(409).send(
          otros.some((p) => p.deletedAt === null)
            ? YA_EXISTE
            : { error: "Existe un proveedor borrado con ese nombre" },
        );
      }
    }

    try {
      const data = await app.db.proveedor.update({ where: { id: proveedor.id }, data: body.data });
      return { data };
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send(YA_EXISTE);
      throw err;
    }
  });

  app.delete("/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const proveedor = await app.db.proveedor.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!proveedor) return reply.code(404).send(NO_ENCONTRADO);

    const productosActivos = await app.db.producto.count({
      where: { proveedorId: proveedor.id, activo: true, deletedAt: null },
    });
    if (productosActivos > 0) {
      return reply.code(400).send({ error: "No se puede borrar un proveedor con productos activos" });
    }

    await app.db.proveedor.update({ where: { id: proveedor.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}

import type { FastifyInstance } from "fastify";
import { Prisma, Rol, UnidadMedida } from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../../lib/auth.js";
import { buildMeta, parsePagination, skipTake } from "../../lib/pagination.js";
import { isUniqueViolation, sendValidationError } from "../../lib/zod-helpers.js";

const CON_RUBRO_Y_PROVEEDOR = {
  rubro: { select: { id: true, nombre: true } },
  proveedor: { select: { id: true, nombre: true } },
} satisfies Prisma.ProductoInclude;

const listQuery = z.object({
  q: z.string().trim().optional(),
  incluirInactivos: z.enum(["true", "false"]).optional(),
  rubroId: z.string().min(1).optional(),
  proveedorId: z.string().min(1).optional(),
});
const idParams = z.object({ id: z.string().min(1) });

const nombre = z.string().trim().min(2);
// Decimal(10, 2) en la BD
const precio = z.number().positive().max(99_999_999.99);

const crearBody = z.object({
  codigo: z.string().trim().min(1),
  nombre,
  rubroId: z.string().min(1),
  proveedorId: z.string().min(1).optional(),
  unidad: z.nativeEnum(UnidadMedida).default(UnidadMedida.UN),
  precioReferencia: precio.optional(),
  activo: z.boolean().optional(),
});

// strict: el código no se puede cambiar por PATCH (un campo desconocido es 400)
const editarBody = z
  .object({
    nombre: nombre.optional(),
    rubroId: z.string().min(1).optional(),
    // null = quitarle el proveedor
    proveedorId: z.string().min(1).nullable().optional(),
    unidad: z.nativeEnum(UnidadMedida).optional(),
    precioReferencia: precio.nullable().optional(),
    activo: z.boolean().optional(),
  })
  .strict();

const CODIGO_EN_USO = { error: "El código ya existe" };
const NO_ENCONTRADO = { error: "Producto no encontrado" };

export default async function productosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(Rol.ADMIN));

  // Rubro y proveedor (si se envían) tienen que existir y no estar borrados
  const referenciasInvalidas = async (rubroId?: string, proveedorId?: string | null) => {
    const [rubro, proveedor] = await Promise.all([
      rubroId ? app.db.rubro.findFirst({ where: { id: rubroId, deletedAt: null } }) : true,
      proveedorId ? app.db.proveedor.findFirst({ where: { id: proveedorId, deletedAt: null } }) : true,
    ]);
    const detalles: string[] = [];
    if (!rubro) detalles.push("rubroId: El rubro no existe o está borrado");
    if (!proveedor) detalles.push("proveedorId: El proveedor no existe o está borrado");
    return detalles;
  };

  app.get("/", async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const pagination = parsePagination(request.query);
    const { q, incluirInactivos, rubroId, proveedorId } = query.data;

    const where: Prisma.ProductoWhereInput = {
      deletedAt: null,
      ...(incluirInactivos === "true" ? {} : { activo: true }),
      ...(rubroId ? { rubroId } : {}),
      ...(proveedorId ? { proveedorId } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { codigo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      app.db.producto.findMany({
        where,
        include: CON_RUBRO_Y_PROVEEDOR,
        orderBy: { nombre: "asc" },
        ...skipTake(pagination),
      }),
      app.db.producto.count({ where }),
    ]);

    return { data, meta: buildMeta(total, pagination.page, pagination.limit) };
  });

  app.post("/", async (request, reply) => {
    const body = crearBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    const { activo, ...campos } = body.data;

    const existente = await app.db.producto.findUnique({ where: { codigo: campos.codigo } });
    if (existente && existente.deletedAt === null) {
      return reply.code(409).send(CODIGO_EN_USO);
    }

    const detalles = await referenciasInvalidas(campos.rubroId, campos.proveedorId);
    if (detalles.length > 0) return reply.code(400).send({ error: "Datos inválidos", detalles });

    try {
      // Restaurar un borrado con el mismo código: deletedAt=null y activo se
      // mantiene como estaba, salvo que el body lo indique explícitamente.
      const data = existente
        ? await app.db.producto.update({
            where: { id: existente.id },
            data: {
              ...campos,
              precioReferencia: campos.precioReferencia ?? null,
              proveedorId: campos.proveedorId ?? null,
              ...(activo !== undefined ? { activo } : {}),
              deletedAt: null,
            },
            include: CON_RUBRO_Y_PROVEEDOR,
          })
        : await app.db.producto.create({
            data: { ...campos, activo: activo ?? true },
            include: CON_RUBRO_Y_PROVEEDOR,
          });
      return reply.code(201).send({ data });
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send(CODIGO_EN_USO);
      throw err;
    }
  });

  app.patch("/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = editarBody.safeParse(request.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const producto = await app.db.producto.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!producto) return reply.code(404).send(NO_ENCONTRADO);

    const detalles = await referenciasInvalidas(body.data.rubroId, body.data.proveedorId);
    if (detalles.length > 0) return reply.code(400).send({ error: "Datos inválidos", detalles });

    const data = await app.db.producto.update({
      where: { id: producto.id },
      data: body.data,
      include: CON_RUBRO_Y_PROVEEDOR,
    });
    return { data };
  });

  app.delete("/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const producto = await app.db.producto.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!producto) return reply.code(404).send(NO_ENCONTRADO);

    await app.db.producto.update({ where: { id: producto.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}

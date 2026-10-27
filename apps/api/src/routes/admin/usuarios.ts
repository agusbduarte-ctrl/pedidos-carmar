import type { FastifyInstance } from "fastify";
import { Prisma, Rol, Sucursal } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authenticate, requireRole } from "../../lib/auth.js";
import { buildMeta, parsePagination, skipTake } from "../../lib/pagination.js";
import { isUniqueViolation, sendValidationError } from "../../lib/zod-helpers.js";

const BCRYPT_ROUNDS = 10;

// Nunca devolver passwordHash ni pinHash
const USUARIO_PUBLICO = {
  id: true,
  email: true,
  nombre: true,
  rol: true,
  sucursal: true,
  activo: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsuarioSelect;

const listQuery = z.object({
  q: z.string().trim().optional(),
  rol: z.nativeEnum(Rol).optional(),
  incluirInactivos: z.enum(["true", "false"]).optional(),
});
const idParams = z.object({ id: z.string().min(1) });

const nombre = z.string().trim().min(2);
const email = z.string().trim().toLowerCase().email();
const password = z.string().min(8, "La contraseña debe tener al menos 8 caracteres");
const pin = z.string().regex(/^\d{4}$/, "El PIN debe tener exactamente 4 dígitos");

const crearBody = z
  .object({
    nombre,
    rol: z.nativeEnum(Rol),
    email: email.optional(),
    password: password.optional(),
    pin: pin.optional(),
    sucursal: z.nativeEnum(Sucursal).optional(),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (d.rol === Rol.REPOSITOR) {
      if (!d.pin) issue("pin", "Requerido para repositores");
      if (!d.sucursal) issue("sucursal", "Requerida para repositores");
      if (d.password) issue("password", "Los repositores entran con PIN, no con contraseña");
    } else {
      if (!d.email) issue("email", "Requerido para admin y encargada");
      if (!d.password) issue("password", "Requerida para admin y encargada");
      if (d.pin) issue("pin", "Admin y encargada entran con contraseña, no con PIN");
    }
  });

// strict: el rol no se puede cambiar por PATCH (un campo desconocido es 400)
const editarBody = z
  .object({
    nombre: nombre.optional(),
    email: email.nullable().optional(),
    password: password.optional(),
    pin: pin.optional(),
    sucursal: z.nativeEnum(Sucursal).nullable().optional(),
    activo: z.boolean().optional(),
  })
  .strict();

const EMAIL_EN_USO = { error: "El email ya está en uso" };
const NO_ENCONTRADO = { error: "Usuario no encontrado" };

export default async function usuariosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(Rol.ADMIN));

  // Incluye borrados: el email es @unique en la BD aunque el usuario esté borrado
  const conMismoEmail = (valor: string, excluirId?: string) =>
    app.db.usuario.findMany({
      where: {
        email: { equals: valor, mode: "insensitive" },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });

  app.get("/", async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const pagination = parsePagination(request.query);
    const { q, rol, incluirInactivos } = query.data;

    const where: Prisma.UsuarioWhereInput = {
      deletedAt: null,
      ...(incluirInactivos === "true" ? {} : { activo: true }),
      ...(rol ? { rol } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      app.db.usuario.findMany({
        where,
        select: USUARIO_PUBLICO,
        orderBy: { nombre: "asc" },
        ...skipTake(pagination),
      }),
      app.db.usuario.count({ where }),
    ]);

    return { data, meta: buildMeta(total, pagination.page, pagination.limit) };
  });

  app.post("/", async (request, reply) => {
    const body = crearBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    const d = body.data;

    const existentes = d.email ? await conMismoEmail(d.email) : [];
    if (existentes.some((u) => u.deletedAt === null)) {
      return reply.code(409).send(EMAIL_EN_USO);
    }

    const esRepositor = d.rol === Rol.REPOSITOR;
    const campos = {
      nombre: d.nombre,
      rol: d.rol,
      email: d.email ?? null,
      sucursal: d.sucursal ?? null,
      passwordHash: esRepositor ? null : await bcrypt.hash(d.password!, BCRYPT_ROUNDS),
      pinHash: esRepositor ? await bcrypt.hash(d.pin!, BCRYPT_ROUNDS) : null,
    };

    try {
      // Restaurar un borrado con el mismo email: deletedAt=null, activo se mantiene
      const borrado = existentes[0];
      const data = borrado
        ? await app.db.usuario.update({
            where: { id: borrado.id },
            data: { ...campos, deletedAt: null },
            select: USUARIO_PUBLICO,
          })
        : await app.db.usuario.create({ data: campos, select: USUARIO_PUBLICO });
      return reply.code(201).send({ data });
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send(EMAIL_EN_USO);
      throw err;
    }
  });

  app.patch("/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = editarBody.safeParse(request.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const d = body.data;

    const usuario = await app.db.usuario.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!usuario) return reply.code(404).send(NO_ENCONTRADO);

    if (usuario.id === request.user.id && d.activo === false) {
      return reply.code(400).send({ error: "No podés desactivar tu propio usuario" });
    }

    // Las credenciales tienen que corresponder al rol del usuario
    const detalles: string[] = [];
    if (usuario.rol === Rol.REPOSITOR) {
      if (d.password !== undefined) detalles.push("password: Los repositores entran con PIN");
      if (d.sucursal === null) detalles.push("sucursal: Un repositor tiene que tener sucursal");
    } else {
      if (d.pin !== undefined) detalles.push("pin: Admin y encargada entran con contraseña");
      if (d.email === null) detalles.push("email: Admin y encargada tienen que tener email");
    }
    if (detalles.length > 0) {
      return reply.code(400).send({ error: "Datos inválidos", detalles });
    }

    if (d.email) {
      // En PATCH no se restaura: cualquier coincidencia (activa o borrada) es conflicto
      const otros = await conMismoEmail(d.email, usuario.id);
      if (otros.length > 0) return reply.code(409).send(EMAIL_EN_USO);
    }

    const { password: nuevaPassword, pin: nuevoPin, ...resto } = d;
    try {
      const data = await app.db.usuario.update({
        where: { id: usuario.id },
        data: {
          ...resto,
          ...(nuevaPassword ? { passwordHash: await bcrypt.hash(nuevaPassword, BCRYPT_ROUNDS) } : {}),
          ...(nuevoPin ? { pinHash: await bcrypt.hash(nuevoPin, BCRYPT_ROUNDS) } : {}),
        },
        select: USUARIO_PUBLICO,
      });
      return { data };
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send(EMAIL_EN_USO);
      throw err;
    }
  });

  app.delete("/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    if (params.data.id === request.user.id) {
      return reply.code(400).send({ error: "No podés borrar tu propio usuario" });
    }

    const usuario = await app.db.usuario.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!usuario) return reply.code(404).send(NO_ENCONTRADO);

    await app.db.usuario.update({ where: { id: usuario.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}

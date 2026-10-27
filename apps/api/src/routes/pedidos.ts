import type { FastifyInstance, FastifyReply } from "fastify";
import { EstadoPedido, EstadoPeriodo, Prisma, Rol, Sucursal } from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../lib/auth.js";
import { buildMeta, parsePagination, skipTake } from "../lib/pagination.js";
import {
  ESTADOS_EDITABLES,
  cantidadValida,
  getPeriodoAbierto,
  verificarRubroAsignado,
} from "../lib/pedidos-helpers.js";
import { isUniqueViolation, sendValidationError } from "../lib/zod-helpers.js";

const PEDIDO_RESUMEN = {
  periodo: { select: { id: true, nombre: true, estado: true } },
  _count: { select: { items: true } },
} satisfies Prisma.PedidoInclude;

const PEDIDO_COMPLETO = {
  periodo: { select: { id: true, nombre: true, estado: true } },
  items: {
    orderBy: { createdAt: "asc" },
    include: { producto: { select: { id: true, nombre: true, codigo: true, unidad: true } } },
  },
} satisfies Prisma.PedidoInclude;

// Vista de la encargada: además de los ítems, quién hizo cada paso
const USUARIO_NOMBRE = { select: { id: true, nombre: true } } as const;
const PEDIDO_DETALLE = {
  periodo: { select: { id: true, nombre: true, estado: true } },
  repositor: USUARIO_NOMBRE,
  enviadoPor: USUARIO_NOMBRE,
  devueltoPor: USUARIO_NOMBRE,
  aprobadoPor: USUARIO_NOMBRE,
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      producto: {
        select: {
          id: true,
          nombre: true,
          codigo: true,
          unidad: true,
          rubro: { select: { id: true, nombre: true } },
        },
      },
    },
  },
} satisfies Prisma.PedidoInclude;

const listaQuery = z.object({
  sucursal: z.nativeEnum(Sucursal).optional(),
  periodoId: z.string().min(1).optional(),
  estado: z.nativeEnum(EstadoPedido).optional(),
  repositorId: z.string().min(1).optional(),
});
const devolverBody = z.object({ comentario: z.string().trim().min(1).max(500) });

const idParams = z.object({ id: z.string().min(1) });
const itemParams = z.object({ id: z.string().min(1), itemId: z.string().min(1) });
const itemBody = z.object({
  productoId: z.string().min(1),
  // Decimal(10, 2) en la BD
  cantidad: z.number().positive().max(99_999_999.99),
  observacion: z.string().trim().max(200).optional(),
});

const NO_ENCONTRADO = { error: "Pedido no encontrado" };

export default async function pedidosRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  const soloRepositor = { preHandler: requireRole(Rol.REPOSITOR) };

  // Pedido del repositor logueado en estado editable y con su período abierto.
  // Si no se puede editar, responde el error y devuelve null.
  const pedidoEditable = async (id: string, usuarioId: string, reply: FastifyReply) => {
    const pedido = await app.db.pedido.findFirst({
      where: { id, repositorId: usuarioId },
      include: { periodo: { select: { estado: true } } },
    });
    if (!pedido) {
      reply.code(404).send(NO_ENCONTRADO);
      return null;
    }
    if (!ESTADOS_EDITABLES.includes(pedido.estado)) {
      reply.code(400).send({ error: `El pedido no se puede editar en estado ${pedido.estado}` });
      return null;
    }
    // Decisión 3: si el período se cerró, el pedido queda huérfano
    if (pedido.periodo.estado !== EstadoPeriodo.ABIERTO) {
      reply.code(400).send({ error: "El período del pedido está cerrado" });
      return null;
    }
    return pedido;
  };

  const pedidoCompleto = (id: string) =>
    app.db.pedido.findUniqueOrThrow({ where: { id }, include: PEDIDO_COMPLETO });

  app.get("/mis-pedidos", soloRepositor, async (request) => {
    const pagination = parsePagination(request.query);
    const where = { repositorId: request.user.id };

    const [data, total] = await Promise.all([
      app.db.pedido.findMany({
        where,
        include: PEDIDO_RESUMEN,
        orderBy: { createdAt: "desc" },
        ...skipTake(pagination),
      }),
      app.db.pedido.count({ where }),
    ]);

    return { data, meta: buildMeta(total, pagination.page, pagination.limit) };
  });

  app.get("/mis-pedidos/:id", soloRepositor, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const data = await app.db.pedido.findFirst({
      where: { id: params.data.id, repositorId: request.user.id },
      include: PEDIDO_COMPLETO,
    });
    if (!data) return reply.code(404).send(NO_ENCONTRADO);
    return { data };
  });

  app.post("/", soloRepositor, async (request, reply) => {
    const { id: usuarioId, sucursal } = request.user;
    if (!sucursal) {
      return reply.code(400).send({ error: "El repositor no tiene sucursal asignada" });
    }

    const periodo = await getPeriodoAbierto(app.db);
    if (!periodo) return reply.code(400).send({ error: "No hay período abierto" });

    const existente = await app.db.pedido.findFirst({
      where: { repositorId: usuarioId, periodoId: periodo.id },
      select: { id: true },
    });
    if (existente) return reply.code(409).send({ error: "Ya tenés un pedido en este período" });

    const data = await app.db.pedido.create({
      data: {
        repositorId: usuarioId,
        sucursal,
        periodoId: periodo.id,
        estado: EstadoPedido.BORRADOR,
        creadoPorId: usuarioId,
      },
      include: PEDIDO_COMPLETO,
    });
    return reply.code(201).send({ data });
  });

  app.post("/:id/items", soloRepositor, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = itemBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    const { productoId, cantidad, observacion } = body.data;

    const pedido = await pedidoEditable(params.data.id, request.user.id, reply);
    if (!pedido) return reply;

    const producto = await app.db.producto.findFirst({
      where: { id: productoId, activo: true, deletedAt: null },
      select: { id: true, rubroId: true, unidad: true },
    });
    if (!producto) return reply.code(404).send({ error: "Producto no encontrado" });

    if (!cantidadValida(cantidad, producto.unidad)) {
      return reply.code(400).send({
        error: "Datos inválidos",
        detalles: [`cantidad: Tiene que ser un número entero para productos en ${producto.unidad}`],
      });
    }

    if (!(await verificarRubroAsignado(app.db, request.user.id, producto.rubroId, pedido.sucursal))) {
      return reply.code(403).send({ error: "No tenés asignado ese rubro" });
    }

    // Si el producto ya está en el pedido, se suma la cantidad
    const upsert = () =>
      app.db.itemPedido.upsert({
        where: { pedidoId_productoId: { pedidoId: pedido.id, productoId } },
        create: { pedidoId: pedido.id, productoId, cantidad, observacion },
        update: {
          cantidad: { increment: cantidad },
          ...(observacion !== undefined ? { observacion } : {}),
        },
      });
    try {
      await upsert();
    } catch (err) {
      // Dos altas simultáneas del mismo producto: la segunda reintenta como suma
      if (!isUniqueViolation(err)) throw err;
      await upsert();
    }

    return { data: await pedidoCompleto(pedido.id) };
  });

  app.delete("/:id/items/:itemId", soloRepositor, async (request, reply) => {
    const params = itemParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const pedido = await pedidoEditable(params.data.id, request.user.id, reply);
    if (!pedido) return reply;

    const { count } = await app.db.itemPedido.deleteMany({
      where: { id: params.data.itemId, pedidoId: pedido.id },
    });
    if (count === 0) return reply.code(404).send({ error: "Ítem no encontrado" });

    return { ok: true };
  });

  app.post("/:id/enviar", soloRepositor, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const pedido = await pedidoEditable(params.data.id, request.user.id, reply);
    if (!pedido) return reply;

    const items = await app.db.itemPedido.findMany({
      where: { pedidoId: pedido.id },
      include: { producto: true },
    });
    if (items.length === 0) return reply.code(400).send({ error: "El pedido está vacío" });

    // Revalidar: desde que se cargaron, el producto pudo desactivarse, el
    // repositor perder el rubro o el producto cambiar de unidad
    const rubrosAsignados = new Set(
      (
        await app.db.repositorRubro.findMany({
          where: { usuarioId: request.user.id, sucursal: pedido.sucursal },
          select: { rubroId: true },
        })
      ).map((a) => a.rubroId),
    );
    const detalles = items.flatMap(({ producto, cantidad }) => {
      const problemas: string[] = [];
      if (!producto.activo || producto.deletedAt) problemas.push("el producto ya no está activo");
      if (!rubrosAsignados.has(producto.rubroId)) problemas.push("ya no tenés asignado su rubro");
      if (!cantidadValida(cantidad.toNumber(), producto.unidad)) {
        problemas.push(`la cantidad tiene que ser entera para ${producto.unidad}`);
      }
      return problemas.map((p) => `${producto.codigo} (${producto.nombre}): ${p}`);
    });
    if (detalles.length > 0) {
      return reply.code(400).send({ error: "El pedido tiene ítems inválidos", detalles });
    }

    const data = await app.db.pedido.update({
      where: { id: pedido.id },
      data: { estado: EstadoPedido.ENVIADO, fechaEnvio: new Date(), enviadoPorId: request.user.id },
      include: PEDIDO_COMPLETO,
    });
    return { data };
  });

  // ============================================================
  // Encargada (y admin para consultar)
  // ============================================================

  const puedeConsultar = { preHandler: requireRole(Rol.ENCARGADA, Rol.ADMIN) };
  const soloEncargada = { preHandler: requireRole(Rol.ENCARGADA) };

  // Pasa de ENVIADO a otro estado solo si sigue ENVIADO (si dos encargadas
  // actúan a la vez, la segunda recibe el 400 en lugar de pisar a la primera).
  const resolverEnviado = async (
    id: string,
    reply: FastifyReply,
    errorEstado: string,
    data: Prisma.PedidoUpdateManyMutationInput & { devueltoPorId?: string; aprobadoPorId?: string },
  ) => {
    const pedido = await app.db.pedido.findUnique({ where: { id }, select: { estado: true } });
    if (!pedido) return reply.code(404).send(NO_ENCONTRADO);

    const { count } = await app.db.pedido.updateMany({
      where: { id, estado: EstadoPedido.ENVIADO },
      data,
    });
    if (count === 0) return reply.code(400).send({ error: errorEstado });

    return { data: await app.db.pedido.findUniqueOrThrow({ where: { id }, include: PEDIDO_DETALLE }) };
  };

  app.get("/", puedeConsultar, async (request, reply) => {
    const query = listaQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const pagination = parsePagination(request.query);

    // Los BORRADOR son trabajo en curso del repositor: solo si se piden explícitamente
    const { estado, ...filtros } = query.data;
    const where: Prisma.PedidoWhereInput = {
      ...filtros,
      estado: estado ?? { not: EstadoPedido.BORRADOR },
    };
    const [data, total] = await Promise.all([
      app.db.pedido.findMany({
        where,
        include: {
          repositor: { select: { id: true, nombre: true } },
          periodo: { select: { id: true, nombre: true, estado: true } },
          _count: { select: { items: true } },
        },
        // Los no enviados (fechaEnvio null) al final
        orderBy: [{ fechaEnvio: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        ...skipTake(pagination),
      }),
      app.db.pedido.count({ where }),
    ]);

    return { data, meta: buildMeta(total, pagination.page, pagination.limit) };
  });

  app.get("/:id", puedeConsultar, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const data = await app.db.pedido.findUnique({
      where: { id: params.data.id },
      include: PEDIDO_DETALLE,
    });
    if (!data) return reply.code(404).send(NO_ENCONTRADO);
    return { data };
  });

  app.post("/:id/devolver", soloEncargada, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = devolverBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);

    return resolverEnviado(params.data.id, reply, "Solo se pueden devolver pedidos ENVIADOS", {
      estado: EstadoPedido.DEVUELTO,
      fechaDevolucion: new Date(),
      devueltoPorId: request.user.id,
      comentarioDevolucion: body.data.comentario,
    });
  });

  app.post("/:id/aprobar", soloEncargada, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    return resolverEnviado(params.data.id, reply, "Solo se pueden aprobar pedidos ENVIADOS", {
      estado: EstadoPedido.APROBADO,
      fechaAprobacion: new Date(),
      aprobadoPorId: request.user.id,
    });
  });
}

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
import { periodoConConsolidadoAprobado } from "../lib/consolidado-helpers.js";

const PROVEEDOR_SELECT = { select: { id: true, nombre: true } } as const;

// La encargada necesita el teléfono para llamar al proveedor
const PROVEEDOR_DETALLE = { select: { id: true, nombre: true, telefono: true } } as const;

const PEDIDO_RESUMEN = {
  periodo: { select: { id: true, nombre: true, estado: true } },
  proveedor: PROVEEDOR_SELECT,
  _count: { select: { items: true } },
} satisfies Prisma.PedidoInclude;

const PEDIDO_COMPLETO = {
  periodo: { select: { id: true, nombre: true, estado: true } },
  proveedor: PROVEEDOR_SELECT,
  items: {
    orderBy: { createdAt: "asc" },
    include: { producto: { select: { id: true, nombre: true, codigo: true, unidad: true } } },
  },
} satisfies Prisma.PedidoInclude;

// Vista de la encargada: además de los ítems, quién hizo cada paso
const USUARIO_NOMBRE = { select: { id: true, nombre: true } } as const;
const PEDIDO_DETALLE = {
  periodo: { select: { id: true, nombre: true, estado: true } },
  proveedor: PROVEEDOR_DETALLE,
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
const productosQuery = z.object({
  // Vacíos (?q=&rubroId=) se tratan como ausentes
  q: z.string().trim().max(100).optional(),
  rubroId: z.string().optional(),
});
const devolverBody = z.object({ comentario: z.string().trim().min(1).max(500) });

const titulo = z.string().trim().min(1).max(80);
const crearBody = z.object({ titulo: titulo.optional(), proveedorId: z.string().min(1).optional() });
const editarBody = z.object({
  titulo: titulo.nullable().optional(),
  proveedorId: z.string().min(1).nullable().optional(),
});

const idParams = z.object({ id: z.string().min(1) });
const itemParams = z.object({ id: z.string().min(1), itemId: z.string().min(1) });
const itemBody = z.object({
  productoId: z.string().min(1),
  // Decimal(10, 2) en la BD
  cantidad: z.number().positive().max(99_999_999.99),
  observacion: z.string().trim().max(200).optional(),
});

const MAX_ITEMS_MASIVO = 300;
const itemsMasivoBody = z.object({
  items: z
    .array(
      z.object({
        productoId: z.string().min(1),
        cantidad: z.number().min(0).max(99_999_999.99),
      }),
    )
    .min(1)
    .max(MAX_ITEMS_MASIVO),
});

const NO_ENCONTRADO = { error: "Pedido no encontrado" };
const PROVEEDOR_INVALIDO = { error: "El proveedor elegido no existe" };
const PERIODO_CONSOLIDADO = {
  error: "El período ya tiene un consolidado aprobado, no se pueden modificar pedidos",
};

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

  const proveedorExiste = async (id: string) =>
    (await app.db.proveedor.count({ where: { id, deletedAt: null } })) > 0;

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

  // Rubros asignados al repositor en su sucursal (para el filtro de la pantalla)
  app.get("/mis-rubros", soloRepositor, async (request) => {
    const { id: usuarioId, sucursal } = request.user;
    if (!sucursal) return [];
    const asignaciones = await app.db.repositorRubro.findMany({
      where: { usuarioId, sucursal, rubro: { deletedAt: null } },
      select: { rubro: { select: { id: true, nombre: true } } },
      orderBy: { rubro: { nombre: "asc" } },
    });
    return asignaciones.map((a) => a.rubro);
  });

  // Productos que el repositor puede cargar: activos y de sus rubros asignados
  app.get("/productos", soloRepositor, async (request, reply) => {
    const query = productosQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const pagination = parsePagination(request.query);
    const { q, rubroId } = query.data;
    const { id: usuarioId, sucursal } = request.user;

    const vacio = { data: [], meta: buildMeta(0, pagination.page, pagination.limit) };
    if (!sucursal) return vacio;

    const asignados = (
      await app.db.repositorRubro.findMany({
        where: { usuarioId, sucursal },
        select: { rubroId: true },
      })
    ).map((a) => a.rubroId);
    if (rubroId && !asignados.includes(rubroId)) return vacio;

    const where: Prisma.ProductoWhereInput = {
      activo: true,
      deletedAt: null,
      rubroId: rubroId ? rubroId : { in: asignados },
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
        select: {
          id: true,
          codigo: true,
          nombre: true,
          unidad: true,
          rubro: { select: { id: true, nombre: true } },
        },
        orderBy: [{ nombre: "asc" }, { id: "asc" }],
        ...skipTake(pagination),
      }),
      app.db.producto.count({ where }),
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

    const body = crearBody.safeParse(request.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const periodo = await getPeriodoAbierto(app.db);
    if (!periodo) return reply.code(400).send({ error: "No hay período abierto" });

    if (body.data.proveedorId && !(await proveedorExiste(body.data.proveedorId))) {
      return reply.code(400).send(PROVEEDOR_INVALIDO);
    }

    const data = await app.db.pedido.create({
      data: {
        repositorId: usuarioId,
        sucursal,
        periodoId: periodo.id,
        estado: EstadoPedido.BORRADOR,
        creadoPorId: usuarioId,
        titulo: body.data.titulo,
        proveedorId: body.data.proveedorId,
      },
      include: PEDIDO_COMPLETO,
    });
    return reply.code(201).send({ data });
  });

  app.patch("/:id", soloRepositor, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = editarBody.safeParse(request.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const pedido = await app.db.pedido.findFirst({
      where: { id: params.data.id, repositorId: request.user.id },
      select: { id: true, estado: true },
    });
    if (!pedido) return reply.code(404).send(NO_ENCONTRADO);
    if (!ESTADOS_EDITABLES.includes(pedido.estado)) {
      return reply.code(409).send({ error: `El pedido no se puede editar en estado ${pedido.estado}` });
    }

    const { titulo, proveedorId } = body.data;
    if (proveedorId && !(await proveedorExiste(proveedorId))) {
      return reply.code(400).send(PROVEEDOR_INVALIDO);
    }

    const data = await app.db.pedido.update({
      where: { id: pedido.id },
      data: { titulo, proveedorId },
      include: PEDIDO_COMPLETO,
    });
    return { data };
  });

  // Proveedores entre los que el repositor elige para armar un pedido
  app.get("/proveedores", soloRepositor, async () => {
    const data = await app.db.proveedor.findMany({
      where: { activo: true, deletedAt: null, nombre: { not: "SIN ASIGNAR" } },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    return { data };
  });

  const rubrosAsignadosDe = async (usuarioId: string, sucursal: Sucursal) =>
    (
      await app.db.repositorRubro.findMany({
        where: { usuarioId, sucursal },
        select: { rubroId: true },
      })
    ).map((a) => a.rubroId);

  // Productos que conviene mostrar para el proveedor del pedido: los que ya se
  // le pidieron antes y los que el catálogo le asigna
  app.get("/:id/sugeridos", soloRepositor, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const pedido = await pedidoEditable(params.data.id, request.user.id, reply);
    if (!pedido) return reply;
    if (!pedido.proveedorId) return { data: [] };

    const asignados = await rubrosAsignadosDe(request.user.id, pedido.sucursal);
    if (asignados.length === 0) return { data: [] };

    const productoSelect = {
      id: true,
      codigo: true,
      nombre: true,
      unidad: true,
      rubro: { select: { id: true, nombre: true } },
    } as const;
    const productoWhere = { activo: true, deletedAt: null, rubroId: { in: asignados } };

    const previos = await app.db.itemPedido.findMany({
      where: {
        producto: productoWhere,
        pedido: {
          id: { not: pedido.id },
          proveedorId: pedido.proveedorId,
          sucursal: pedido.sucursal,
          OR: [
            { estado: { in: [EstadoPedido.ENVIADO, EstadoPedido.DEVUELTO, EstadoPedido.APROBADO] } },
            { estado: EstadoPedido.BORRADOR, repositorId: request.user.id },
          ],
        },
      },
      select: {
        cantidad: true,
        producto: { select: productoSelect },
        pedido: { select: { createdAt: true } },
      },
    });

    type Sugerido = {
      producto: (typeof previos)[number]["producto"];
      vecesPedido: number;
      ultimaCantidad: string | null;
      ultimaFecha: string | null;
      _fecha: number;
    };
    const porProducto = new Map<string, Sugerido>();
    for (const { cantidad, producto, pedido: p } of previos) {
      const fecha = p.createdAt.getTime();
      const actual = porProducto.get(producto.id);
      if (!actual) {
        porProducto.set(producto.id, {
          producto,
          vecesPedido: 1,
          ultimaCantidad: cantidad.toString(),
          ultimaFecha: p.createdAt.toISOString(),
          _fecha: fecha,
        });
        continue;
      }
      actual.vecesPedido += 1;
      if (fecha > actual._fecha) {
        actual._fecha = fecha;
        actual.ultimaCantidad = cantidad.toString();
        actual.ultimaFecha = p.createdAt.toISOString();
      }
    }

    // Los del catálogo que nunca se pidieron: por nombre alcanza con los primeros
    const delCatalogo = await app.db.producto.findMany({
      where: { ...productoWhere, proveedorId: pedido.proveedorId, id: { notIn: [...porProducto.keys()] } },
      select: productoSelect,
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
      take: MAX_ITEMS_MASIVO,
    });
    for (const producto of delCatalogo) {
      porProducto.set(producto.id, {
        producto,
        vecesPedido: 0,
        ultimaCantidad: null,
        ultimaFecha: null,
        _fecha: 0,
      });
    }

    const data = [...porProducto.values()]
      .sort(
        (a, b) =>
          b.vecesPedido - a.vecesPedido ||
          a.producto.nombre.localeCompare(b.producto.nombre, "es") ||
          a.producto.id.localeCompare(b.producto.id),
      )
      .slice(0, MAX_ITEMS_MASIVO)
      .map((s) => ({ producto: s.producto, vecesPedido: s.vecesPedido, ultimaCantidad: s.ultimaCantidad, ultimaFecha: s.ultimaFecha }));
    return { data };
  });

  // Carga masiva: fija la cantidad de cada producto (0 = quitarlo). Todo o nada.
  app.put("/:id/items", soloRepositor, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = itemsMasivoBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    const { items } = body.data;

    const repetidos = items.filter((it, i) => items.findIndex((o) => o.productoId === it.productoId) !== i);
    if (repetidos.length > 0) {
      return reply.code(400).send({
        error: "Datos inválidos",
        detalles: [...new Set(repetidos.map((r) => `items: el producto ${r.productoId} está repetido`))],
      });
    }

    const pedido = await pedidoEditable(params.data.id, request.user.id, reply);
    if (!pedido) return reply;

    const aCargar = items.filter((it) => it.cantidad > 0);
    const aQuitar = items.filter((it) => it.cantidad === 0).map((it) => it.productoId);

    const [productosDb, asignados] = await Promise.all([
      app.db.producto.findMany({
        where: { id: { in: aCargar.map((it) => it.productoId) } },
        select: { id: true, codigo: true, nombre: true, rubroId: true, unidad: true, activo: true, deletedAt: true },
      }),
      rubrosAsignadosDe(request.user.id, pedido.sucursal),
    ]);
    const porId = new Map(productosDb.map((p) => [p.id, p]));
    const rubrosOk = new Set(asignados);

    const detalles: string[] = [];
    for (const { productoId, cantidad } of aCargar) {
      const producto = porId.get(productoId);
      if (!producto || !producto.activo || producto.deletedAt) {
        const quien = producto ? `${producto.codigo} (${producto.nombre})` : productoId;
        detalles.push(`${quien}: producto no encontrado o inactivo`);
        continue;
      }
      const quien = `${producto.codigo} (${producto.nombre})`;
      if (!cantidadValida(cantidad, producto.unidad)) {
        detalles.push(`${quien}: tiene que ser un número entero para productos en ${producto.unidad}`);
      }
      if (!rubrosOk.has(producto.rubroId)) detalles.push(`${quien}: no tenés asignado su rubro`);
    }
    if (detalles.length > 0) return reply.code(400).send({ error: "Datos inválidos", detalles });

    await app.db.$transaction([
      app.db.itemPedido.deleteMany({ where: { pedidoId: pedido.id, productoId: { in: aQuitar } } }),
      ...aCargar.map(({ productoId, cantidad }) =>
        app.db.itemPedido.upsert({
          where: { pedidoId_productoId: { pedidoId: pedido.id, productoId } },
          create: { pedidoId: pedido.id, productoId, cantidad },
          update: { cantidad },
        }),
      ),
    ]);

    return { data: await pedidoCompleto(pedido.id) };
  });

  // Copia al pedido los ítems del último pedido al mismo proveedor
  app.post("/:id/repetir-ultimo", soloRepositor, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const pedido = await pedidoEditable(params.data.id, request.user.id, reply);
    if (!pedido) return reply;
    if (!pedido.proveedorId) return reply.code(400).send({ error: "El pedido no tiene proveedor" });

    const anterior = await app.db.pedido.findFirst({
      where: {
        repositorId: request.user.id,
        proveedorId: pedido.proveedorId,
        id: { not: pedido.id },
        items: { some: {} },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { items: { include: { producto: true } } },
    });
    if (!anterior) {
      return reply.code(404).send({ error: "No hay un pedido anterior a este proveedor" });
    }

    const [asignados, existentes] = await Promise.all([
      rubrosAsignadosDe(request.user.id, pedido.sucursal),
      app.db.itemPedido.findMany({ where: { pedidoId: pedido.id }, select: { productoId: true } }),
    ]);
    const rubrosOk = new Set(asignados);
    const yaEstan = new Set(existentes.map((e) => e.productoId));

    const copiables = anterior.items.filter(
      ({ producto, cantidad }) =>
        !yaEstan.has(producto.id) &&
        producto.activo &&
        !producto.deletedAt &&
        rubrosOk.has(producto.rubroId) &&
        cantidadValida(cantidad.toNumber(), producto.unidad),
    );
    const { count } = await app.db.itemPedido.createMany({
      data: copiables.map((it) => ({
        pedidoId: pedido.id,
        productoId: it.productoId,
        cantidad: it.cantidad,
        observacion: it.observacion,
      })),
      skipDuplicates: true,
    });

    // omitidos: todo lo que no se copió (ya estaba, inactivo o sin rubro)
    return {
      data: await pedidoCompleto(pedido.id),
      copiados: count,
      omitidos: anterior.items.length - count,
    };
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

    if (await periodoConConsolidadoAprobado(app.db, pedido.periodoId)) {
      return reply.code(400).send(PERIODO_CONSOLIDADO);
    }

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

    // Aprobar no se bloquea: un pedido ENVIADO ya está sumado en el consolidado
    // y sigue estándolo como APROBADO. Devolverlo sí lo sacaría.
    const pedido = await app.db.pedido.findUnique({
      where: { id: params.data.id },
      select: { periodoId: true },
    });
    if (pedido && (await periodoConConsolidadoAprobado(app.db, pedido.periodoId))) {
      return reply.code(400).send(PERIODO_CONSOLIDADO);
    }

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
